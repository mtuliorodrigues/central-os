import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCentralPool } from "../src/db/connection.js";
import { createOperationalImport, createOperationalExecution, recordAuditEvent, listAuditEvents, operationalMetrics } from "../src/operational-history.js";

test("auditoria e métricas usam eventos e contadores oficiais persistidos", async (t) => {
  const pool = createCentralPool();
  const master = (await pool.query("SELECT id FROM users WHERE role='MASTER_ADMIN' LIMIT 1")).rows[0];
  if (!master) { await pool.end(); t.skip("MASTER_ADMIN não disponível"); return; }
  const importId = randomUUID(); const executionIds = [];
  t.after(async () => { if (executionIds.length) { await pool.query("DELETE FROM audit_events WHERE execution_id=ANY($1::uuid[])", [executionIds]); await pool.query("DELETE FROM executions WHERE id=ANY($1::uuid[])", [executionIds]); } await pool.query("DELETE FROM audit_events WHERE resource_id=$1::text", [importId]); await pool.query("DELETE FROM imports WHERE id=$1", [importId]); await pool.end(); });
  await createOperationalImport({ id: importId, userId: master.id, source: "audit_test", originalFileName: "audit-test.csv", storageKey: "synthetic/audit-test.csv", sha256: "e".repeat(64), rowCount: 2, pool });
  for (const [status, values] of [["completed", [4, 1, 3, 2, 0, 1, 1, 0, 0]], ["running", [8, 2, 6, 0, 1, 5, 0, 0, 0]]]) { const id = await createOperationalExecution({ importId, requestedByUserId: master.id, source: "audit_test", fileNameSnapshot: "audit-test.csv", pool }); executionIds.push(id); await pool.query("UPDATE executions SET status=$2,rows_read=$3,excluded_count=$4,eligible_count=$5,found_count=$6,review_count=$7,not_found_count=$8,sent_count=$9,skipped_count=$10,failure_count=$11,excluded_by_reason=$12::jsonb WHERE id=$1", [id, status, ...values, JSON.stringify({ INFRA: 1 })]); }
  await recordAuditEvent({ actorType: "SYSTEM", action: "audit_test_event", entityType: "execution", entityId: executionIds[0], executionId: executionIds[0], importId, metadata: { safe: true }, pool });
  const events = await listAuditEvents({ action: "audit_test_event", pool }); const metrics = await operationalMetrics({ source: "audit_test", pool });
  assert.equal(events.total, 1); assert.equal(events.items[0].action, "audit_test_event"); assert.equal(metrics.summary.executions, 2); assert.equal(metrics.summary.rowsRead, 12); assert.equal(metrics.summary.excludedCount, 3); assert.equal(metrics.summary.foundCount, 2); assert.equal(metrics.statusBreakdown.find(row => row.status === "running").count, 1); assert.equal(metrics.excludedByReason[0].key, "INFRA");
});
