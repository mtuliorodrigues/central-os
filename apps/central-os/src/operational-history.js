import { createHash, randomUUID } from "node:crypto";
import { createCentralPool } from "./db/connection.js";

function json(value, fallback) {
  return value == null ? fallback : value;
}

function publicImport(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    userUsername: row.user_username || null,
    source: row.source,
    originalFileName: row.original_file_name,
    storageKey: row.storage_key,
    sha256: row.sha256,
    generatedAt: row.generated_at,
    generatedAtSource: row.generated_at_source,
    generatedAtConfidence: row.generated_at_confidence,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    status: row.status
  };
}

function publicExecution(row) {
  return {
    id: row.id,
    importId: row.import_id,
    requestedByUserId: row.requested_by_user_id,
    source: row.source,
    fileNameSnapshot: row.file_name_snapshot,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    rowsRead: row.rows_read,
    excludedCount: row.excluded_count,
    eligibleCount: row.eligible_count,
    foundCount: row.found_count,
    reviewCount: row.review_count,
    notFoundCount: row.not_found_count,
    sentCount: row.sent_count,
    skippedCount: row.skipped_count,
    failureCount: row.failure_count,
    excludedByReason: row.excluded_by_reason || {},
    errorSummary: row.error_summary || {},
    engineVersion: row.engine_version
  };
}

function publicGroup(row) {
  return { role: row.role, jid: row.jid, name: row.name_snapshot || row.jid };
}

function poolOrThrow(pool) {
  const db = pool || createCentralPool();
  if (!db) throw new Error("CENTRAL_OS_DATABASE_URL não configurada.");
  return { db, own: !pool };
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function createOperationalImport({ id = randomUUID(), userId = null, source = "ui", originalFileName, storageKey, sha256: digest, generatedAt = null, generatedAtSource = null, generatedAtConfidence = null, rowCount = 0, pool = null }) {
  const { db, own } = poolOrThrow(pool);
  try {
    const result = await db.query(`INSERT INTO imports (id, user_id, source, original_file_name, storage_key, sha256, generated_at, generated_at_source, generated_at_confidence, imported_at, row_count, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,'received') RETURNING *`, [id, userId, source, originalFileName, storageKey, digest, generatedAt, generatedAtSource, generatedAtConfidence, Math.max(0, Number(rowCount) || 0)]);
    const duplicate = await db.query("SELECT id, imported_at FROM imports WHERE sha256=$1 AND id<>$2 ORDER BY imported_at DESC LIMIT 1", [digest, id]);
    const importMetadata = { source, originalFileName, rowCount: Math.max(0, Number(rowCount) || 0), generatedAt, ...(duplicate.rows[0] ? { duplicateOf: duplicate.rows[0].id } : {}) };
    await db.query("INSERT INTO audit_events (id,user_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,$3,$4,'central-os-history','import_created','import',$5,'success',$6::jsonb)", [randomUUID(), userId, userId ? "USER" : "SYSTEM", userId, id, JSON.stringify(importMetadata)]);
    if (duplicate.rows[0]) await db.query("INSERT INTO audit_events (id,user_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,$3,$4,'central-os-history','import_duplicate_detected','import',$5,'info',$6::jsonb)", [randomUUID(), userId, userId ? "USER" : "SYSTEM", userId, id, JSON.stringify({ duplicateOf: duplicate.rows[0].id })]);
    return { import: publicImport(result.rows[0]), duplicateOf: duplicate.rows[0] ? { id: duplicate.rows[0].id, importedAt: duplicate.rows[0].imported_at } : null };
  } finally { if (own) await db.end(); }
}

export async function createOperationalExecution({ importId, requestedByUserId = null, source = "ui", fileNameSnapshot, engineVersion = null, groups = [], pool = null }) {
  const { db, own } = poolOrThrow(pool);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    await client.query(`INSERT INTO executions (id, import_id, requested_by_user_id, source, file_name_snapshot, started_at, status, engine_version)
      VALUES ($1,$2,$3,$4,$5,now(),'running',$6)`, [id, importId, requestedByUserId, source, fileNameSnapshot, engineVersion]);
    for (const group of groups) {
      if (!group?.role || !group?.jid) continue;
      await client.query("INSERT INTO execution_groups (execution_id, role, jid, name_snapshot) VALUES ($1,$2,$3,$4)", [id, group.role, group.jid, group.name || group.nameSnapshot || group.jid]);
    }
    await client.query("INSERT INTO audit_events (id,user_id,execution_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)", [randomUUID(), requestedByUserId, id, requestedByUserId ? "USER" : "SYSTEM", requestedByUserId, "central-os-history", "execution_requested", "execution", id, "success", JSON.stringify({ source })]);
    await client.query("INSERT INTO audit_events (id,user_id,execution_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,$3,$4,$5,'central-os-history','execution_started','execution',$6,'success',$7::jsonb)", [randomUUID(), requestedByUserId, id, requestedByUserId ? "USER" : "SYSTEM", requestedByUserId, id, JSON.stringify({ source })]);
    await client.query("COMMIT");
    return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); if (own) await db.end(); }
}

function normalizedItems(contract) {
  return Array.isArray(contract?.items) ? contract.items : [];
}

export async function finalizeOperationalExecution({ executionId, contract, outputDir, pool = null }) {
  const { db, own } = poolOrThrow(pool);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const execution = await client.query("SELECT id FROM executions WHERE id=$1 FOR UPDATE", [executionId]);
    if (!execution.rowCount) throw new Error("Execution não encontrada.");
    for (const item of normalizedItems(contract)) {
      await client.query(`INSERT INTO execution_items (id,execution_id,row_number,os_number,contract_id,client_name,status,match_score,match_reasons,message_id_source,message_id_destination,failure_code,failure_message,review_required)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)
        ON CONFLICT (execution_id,row_number) DO UPDATE SET os_number=EXCLUDED.os_number,contract_id=EXCLUDED.contract_id,client_name=EXCLUDED.client_name,status=EXCLUDED.status,match_score=EXCLUDED.match_score,match_reasons=EXCLUDED.match_reasons,message_id_source=EXCLUDED.message_id_source,message_id_destination=EXCLUDED.message_id_destination,failure_code=EXCLUDED.failure_code,failure_message=EXCLUDED.failure_message,review_required=EXCLUDED.review_required`, [randomUUID(), executionId, Math.max(1, Number(item.rowNumber) || 1), item.osNumber || null, item.contractId || null, item.clientName || null, item.status || "unknown", item.matchScore == null ? null : Number(item.matchScore), JSON.stringify(json(item.matchReasons, [])), item.messageIdSource || null, item.messageIdDestination || null, item.failureCode || null, item.failureMessage || null, Boolean(item.reviewRequired)]);
    }
    for (const artifact of Array.isArray(contract?.artifacts) ? contract.artifacts : []) {
      await client.query("INSERT INTO reports (id,execution_id,type,storage_key,sha256,size_bytes,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", [randomUUID(), executionId, artifact.type || "artifact", artifact.storageKey || "", artifact.sha256 || null, artifact.sizeBytes == null ? null : Number(artifact.sizeBytes), JSON.stringify(artifact.metadata || {})]);
      await client.query("INSERT INTO audit_events (id,execution_id,actor_type,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,'SYSTEM','central-os-history','report_created','report',$3,'success',$4::jsonb)", [randomUUID(), executionId, artifact.storageKey || "", JSON.stringify({ type: artifact.type || "artifact" })]);
    }
    const counts = contract || {};
    const status = ["completed", "completed_with_errors", "failed"].includes(counts.status) ? counts.status : "completed";
    await client.query(`UPDATE executions SET finished_at=COALESCE($2::timestamptz,now()), status=$3, rows_read=$4, excluded_count=$5, eligible_count=$6, found_count=$7, review_count=$8, not_found_count=$9, sent_count=$10, skipped_count=$11, failure_count=$12, excluded_by_reason=$13::jsonb, error_summary=$14::jsonb, engine_version=$15 WHERE id=$1`, [executionId, counts.finishedAt || null, status, Number(counts.rowsRead) || 0, Number(counts.excludedCount) || 0, Number(counts.eligibleCount) || 0, Number(counts.foundCount) || 0, Number(counts.reviewCount) || 0, Number(counts.notFoundCount) || 0, Number(counts.sentCount) || 0, Number(counts.skippedCount) || 0, Number(counts.failureCount) || 0, JSON.stringify(counts.excludedByReason || {}), JSON.stringify(counts.errorSummary || {}), counts.engineVersion || null]);
    await client.query("INSERT INTO audit_events (id,execution_id,actor_type,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,'SYSTEM','central-os-history',$3,'execution',$4,$5,$6::jsonb)", [randomUUID(), executionId, status === "failed" ? "execution_failed" : "execution_finished", executionId, status === "failed" ? "failure" : "success", JSON.stringify({ artifactCount: Array.isArray(contract?.artifacts) ? contract.artifacts.length : 0 })]);
    await client.query("COMMIT");
    return getExecution(executionId, { pool: db });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); if (own) await db.end(); }
}

export async function failOperationalExecution({ executionId, errorSummary, pool = null }) {
  const { db, own } = poolOrThrow(pool);
  try {
    await db.query("UPDATE executions SET finished_at=now(), status='failed', error_summary=$2::jsonb WHERE id=$1", [executionId, JSON.stringify(errorSummary || { message: "Falha não especificada." })]);
    await db.query("INSERT INTO audit_events (id,execution_id,actor_type,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,'SYSTEM','central-os-history','execution_failed','execution',$3,'failure',$4::jsonb)", [randomUUID(), executionId, executionId, JSON.stringify(errorSummary || {})]);
  } finally { if (own) await db.end(); }
}

function importSelect() { return `SELECT i.*, u.name AS user_name, u.username AS user_username,
  (SELECT count(*)::int FROM executions e WHERE e.import_id=i.id) AS execution_count,
  EXISTS (SELECT 1 FROM imports older WHERE older.sha256=i.sha256 AND older.imported_at<i.imported_at) AS duplicate` }
export async function listImports({ page = 1, limit = 25, search = "", importedFrom = null, importedTo = null, user = "", status = "", source = "", pool = null } = {}) {
  const { db, own } = poolOrThrow(pool);
  try {
    const where = []; const values = [];
    if (search) { values.push(`%${search}%`); where.push(`i.original_file_name ILIKE $${values.length}`); }
    if (importedFrom) { values.push(importedFrom); where.push(`i.imported_at >= $${values.length}::timestamptz`); }
    if (importedTo) { values.push(`${importedTo}T23:59:59.999Z`); where.push(`i.imported_at <= $${values.length}::timestamptz`); }
    if (user) { values.push(`%${user}%`); where.push(`(u.name ILIKE $${values.length} OR u.username ILIKE $${values.length})`); }
    if (status) { values.push(status); where.push(`i.status=$${values.length}`); }
    if (source) { values.push(source); where.push(`i.source=$${values.length}`); }
    const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const totalResult = await db.query(`SELECT count(*)::int AS total FROM imports i LEFT JOIN users u ON u.id=i.user_id${condition}`, values);
    const safePage = Math.max(1, Number(page) || 1); const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25)); const offset = (safePage - 1) * safeLimit;
    const queryValues = [...values, safeLimit, offset];
    const rows = await db.query(`${importSelect()} FROM imports i LEFT JOIN users u ON u.id=i.user_id${condition} ORDER BY i.imported_at DESC LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`, queryValues);
    return { items: rows.rows.map(row => ({ ...publicImport(row), executionCount: row.execution_count || 0, duplicate: Boolean(row.duplicate) })), page: safePage, limit: safeLimit, total: totalResult.rows[0].total, totalPages: Math.max(1, Math.ceil(totalResult.rows[0].total / safeLimit)) };
  } finally { if (own) await db.end(); }
}
export async function getImport(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const r = await db.query(`${importSelect()} FROM imports i LEFT JOIN users u ON u.id=i.user_id WHERE i.id=$1`, [id]); return r.rows[0] ? { ...publicImport(r.rows[0]), executionCount: r.rows[0].execution_count || 0, duplicate: Boolean(r.rows[0].duplicate) } : null; } finally { if (own) await db.end(); } }
export async function listExecutions(importId, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const result = await db.query(`SELECT e.*, u.name AS user_name, u.username AS user_username FROM executions e LEFT JOIN users u ON u.id=e.requested_by_user_id WHERE e.import_id=$1 ORDER BY e.created_at DESC`, [importId]); const groups = await db.query("SELECT execution_id,role,jid,name_snapshot FROM execution_groups WHERE execution_id = ANY($1::uuid[])", [result.rows.map(row => row.id)]); const by = new Map(); for (const group of groups.rows) { if (!by.has(group.execution_id)) by.set(group.execution_id, []); by.get(group.execution_id).push(publicGroup(group)); } return result.rows.map(row => ({ ...publicExecution(row), userName: row.user_name || null, userUsername: row.user_username || null, groups: by.get(row.id) || [] })); } finally { if (own) await db.end(); } }
export async function getExecution(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const r = await db.query("SELECT e.*, u.name AS user_name, u.username AS user_username FROM executions e LEFT JOIN users u ON u.id=e.requested_by_user_id WHERE e.id=$1", [id]); if (!r.rows[0]) return null; const groups = await db.query("SELECT role,jid,name_snapshot FROM execution_groups WHERE execution_id=$1 ORDER BY role", [id]); return { ...publicExecution(r.rows[0]), userName: r.rows[0].user_name || null, userUsername: r.rows[0].user_username || null, groups: groups.rows.map(publicGroup) }; } finally { if (own) await db.end(); } }
export async function listExecutionItems(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT id,row_number AS \"rowNumber\",os_number AS \"osNumber\",contract_id AS \"contractId\",client_name AS \"clientName\",status,match_score AS \"matchScore\",match_reasons AS \"matchReasons\",message_id_source AS \"messageIdSource\",message_id_destination AS \"messageIdDestination\",failure_code AS \"failureCode\",failure_message AS \"failureMessage\",review_required AS \"reviewRequired\" FROM execution_items WHERE execution_id=$1 ORDER BY row_number", [id])).rows; } finally { if (own) await db.end(); } }
export async function listExecutionReports(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT id,type,storage_key AS \"storageKey\",sha256,size_bytes AS \"sizeBytes\",metadata,created_at AS \"createdAt\" FROM reports WHERE execution_id=$1 ORDER BY created_at", [id])).rows; } finally { if (own) await db.end(); } }
export async function getReport(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const result = await db.query("SELECT r.id,r.type,r.storage_key AS \"storageKey\",r.sha256,r.size_bytes AS \"sizeBytes\",r.metadata,r.execution_id AS \"executionId\" FROM reports r WHERE r.id=$1", [id]); return result.rows[0] || null; } finally { if (own) await db.end(); } }

export async function recordAuditEvent({ actorType = "SYSTEM", userId = null, actorRef = null, action, entityType = null, entityId = null, executionId = null, importId = null, result = "success", metadata = {}, pool = null } = {}) {
  const { db, own } = poolOrThrow(pool);
  try {
    const safe = metadata && typeof metadata === "object" ? metadata : {};
    await db.query(`INSERT INTO audit_events (id,user_id,execution_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context)
      VALUES ($1,$2,$3,$4,$5,'central-os-audit',$6,$7,$8,$9,$10::jsonb)`, [randomUUID(), userId, executionId, actorType, actorRef, action, entityType, entityId, result, JSON.stringify(safe)]);
  } finally { if (own) await db.end(); }
}

function publicAudit(row) {
  return { id: row.id, actorType: row.actor_type, userId: row.user_id, actorName: row.actor_name || row.actor_username || null, action: row.action, entityType: row.resource_type, entityId: row.resource_id, executionId: row.execution_id, importId: row.import_id || null, result: row.result, metadata: row.context || {}, createdAt: row.created_at };
}

export async function listAuditEvents({ page = 1, limit = 25, dateFrom = null, dateTo = null, action = "", actorType = "", userId = "", importId = "", executionId = "", entityType = "", entityId = "", pool = null } = {}) {
  const { db, own } = poolOrThrow(pool);
  try {
    const where = []; const values = [];
    if (dateFrom) { values.push(dateFrom); where.push(`a.timestamp >= $${values.length}::timestamptz`); }
    if (dateTo) { values.push(`${dateTo}T23:59:59.999Z`); where.push(`a.timestamp <= $${values.length}::timestamptz`); }
    for (const [value, column] of [[action, "a.action"], [actorType, "a.actor_type"], [userId, "a.user_id"], [executionId, "a.execution_id"], [entityType, "a.resource_type"], [entityId, "a.resource_id"]]) { if (value) { values.push(value); where.push(`${column}=$${values.length}`); } }
    if (importId) { values.push(importId); where.push(`(a.resource_type='import' AND a.resource_id=$${values.length} OR e.import_id=$${values.length})`); }
    const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = await db.query(`SELECT count(*)::int AS total FROM audit_events a${condition}`, values);
    const safePage = Math.max(1, Number(page) || 1); const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25)); const params = [...values, safeLimit, (safePage - 1) * safeLimit];
    const rows = await db.query(`SELECT a.id,a.user_id,a.execution_id,a.actor_type,a.action,a.resource_type,a.resource_id,a.result,a.context,a.timestamp AS created_at,u.name AS actor_name,u.username AS actor_username,
      COALESCE(CASE WHEN a.resource_type='import' THEN a.resource_id ELSE NULL END,e.import_id::text) AS import_id FROM audit_events a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN executions e ON e.id=a.execution_id${condition} ORDER BY a.timestamp DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: rows.rows.map(publicAudit), page: safePage, limit: safeLimit, total: total.rows[0].total, totalPages: Math.max(1, Math.ceil(total.rows[0].total / safeLimit)) };
  } finally { if (own) await db.end(); }
}

export async function operationalMetrics({ dateFrom = null, dateTo = null, userId = "", source = "", pool = null } = {}) {
  const { db, own } = poolOrThrow(pool);
  try {
    const where = []; const values = [];
    if (dateFrom) { values.push(dateFrom); where.push(`e.started_at >= $${values.length}::timestamptz`); }
    if (dateTo) { values.push(`${dateTo}T23:59:59.999Z`); where.push(`e.started_at <= $${values.length}::timestamptz`); }
    if (userId) { values.push(userId); where.push(`e.requested_by_user_id=$${values.length}`); }
    if (source) { values.push(source); where.push(`e.source=$${values.length}`); }
    const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const summary = (await db.query(`SELECT count(*)::int AS executions,COALESCE(sum(rows_read),0)::int AS rows_read,COALESCE(sum(excluded_count),0)::int AS excluded_count,COALESCE(sum(eligible_count),0)::int AS eligible_count,COALESCE(sum(found_count),0)::int AS found_count,COALESCE(sum(review_count),0)::int AS review_count,COALESCE(sum(not_found_count),0)::int AS not_found_count,COALESCE(sum(sent_count),0)::int AS sent_count,COALESCE(sum(skipped_count),0)::int AS skipped_count,COALESCE(sum(failure_count),0)::int AS failure_count FROM executions e${condition}`, values)).rows[0];
    const breakdown = (await db.query(`SELECT status,count(*)::int AS count FROM executions e${condition} GROUP BY status ORDER BY status`, values)).rows;
    const reasons = (await db.query(`SELECT reason.key, sum(reason.value::int)::int AS count FROM executions e CROSS JOIN LATERAL jsonb_each_text(e.excluded_by_reason) reason${condition} GROUP BY reason.key ORDER BY count DESC`, values)).rows;
    return { summary: { executions: summary.executions, rowsRead: summary.rows_read, excludedCount: summary.excluded_count, eligibleCount: summary.eligible_count, foundCount: summary.found_count, reviewCount: summary.review_count, notFoundCount: summary.not_found_count, sentCount: summary.sent_count, skippedCount: summary.skipped_count, failureCount: summary.failure_count }, statusBreakdown: breakdown, excludedByReason: reasons, period: { dateFrom, dateTo } };
  } finally { if (own) await db.end(); }
}
