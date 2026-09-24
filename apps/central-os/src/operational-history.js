import { createHash, randomUUID } from "node:crypto";
import { createCentralPool } from "./db/connection.js";

function json(value, fallback) {
  return value == null ? fallback : value;
}

function publicImport(row) {
  return {
    id: row.id,
    userId: row.user_id,
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
    await db.query("INSERT INTO audit_events (id,user_id,actor_type,actor_ref,source,action,resource_type,resource_id,result,context) VALUES ($1,$2,$3,$4,'central-os-history','import_created','import',$5,'success',$6::jsonb)", [randomUUID(), userId, userId ? "USER" : "SYSTEM", userId, id, JSON.stringify({ source, rowCount: Math.max(0, Number(rowCount) || 0) })]);
    const duplicate = await db.query("SELECT id, imported_at FROM imports WHERE sha256=$1 AND id<>$2 ORDER BY imported_at DESC LIMIT 1", [digest, id]);
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

export async function listImports({ pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT * FROM imports ORDER BY imported_at DESC")).rows.map(publicImport); } finally { if (own) await db.end(); } }
export async function getImport(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const r = await db.query("SELECT * FROM imports WHERE id=$1", [id]); return r.rows[0] ? publicImport(r.rows[0]) : null; } finally { if (own) await db.end(); } }
export async function listExecutions(importId, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT * FROM executions WHERE import_id=$1 ORDER BY created_at DESC", [importId])).rows.map(publicExecution); } finally { if (own) await db.end(); } }
export async function getExecution(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { const r = await db.query("SELECT * FROM executions WHERE id=$1", [id]); return r.rows[0] ? publicExecution(r.rows[0]) : null; } finally { if (own) await db.end(); } }
export async function listExecutionItems(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT id,row_number AS \"rowNumber\",os_number AS \"osNumber\",contract_id AS \"contractId\",client_name AS \"clientName\",status,match_score AS \"matchScore\",match_reasons AS \"matchReasons\",message_id_source AS \"messageIdSource\",message_id_destination AS \"messageIdDestination\",failure_code AS \"failureCode\",failure_message AS \"failureMessage\",review_required AS \"reviewRequired\" FROM execution_items WHERE execution_id=$1 ORDER BY row_number", [id])).rows; } finally { if (own) await db.end(); } }
export async function listExecutionReports(id, { pool = null } = {}) { const { db, own } = poolOrThrow(pool); try { return (await db.query("SELECT id,type,storage_key AS \"storageKey\",sha256,size_bytes AS \"sizeBytes\",metadata,created_at AS \"createdAt\" FROM reports WHERE execution_id=$1 ORDER BY created_at", [id])).rows; } finally { if (own) await db.end(); } }
