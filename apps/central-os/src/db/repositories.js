import { randomUUID } from "node:crypto";
import { createCentralPool } from "./connection.js";

export async function insertSyntheticSmokeGraph({ pool = null } = {}) {
  const ownPool = pool || createCentralPool();
  if (!ownPool) throw new Error("CENTRAL_OS_DATABASE_URL não configurada.");
  const client = await ownPool.connect();
  const ids = {
    userId: randomUUID(),
    importId: randomUUID(),
    executionId: randomUUID(),
    itemId: randomUUID(),
    reportId: randomUUID(),
    auditId: randomUUID()
  };
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (id, name, username, role, active)
       VALUES ($1, $2, $3, 'USER', true)`,
      [ids.userId, "Synthetic User", `synthetic-${ids.userId}`]
    );
    await client.query(
      `INSERT INTO imports (id, user_id, source, original_file_name, storage_key, sha256,
         generated_at_source, imported_at, row_count, status)
       VALUES ($1, $2, 'manual_test', 'synthetic.csv', 'synthetic/synthetic.csv', $3,
         'unknown', now(), 1, 'ready')`,
      [ids.importId, ids.userId, `synthetic-${ids.importId}`]
    );
    await client.query(
      `INSERT INTO executions (id, import_id, requested_by_user_id, source,
         file_name_snapshot, status, rows_read, eligible_count, engine_version)
       VALUES ($1, $2, $3, 'manual_test', 'synthetic.csv', 'completed', 1, 1, 'test')`,
      [ids.executionId, ids.importId, ids.userId]
    );
    await client.query(
      `INSERT INTO execution_items (id, execution_id, row_number, os_number, status)
       VALUES ($1, $2, 2, 'SYNTHETIC-OS', 'NOT_FOUND')`,
      [ids.itemId, ids.executionId]
    );
    await client.query(
      `INSERT INTO reports (id, execution_id, type, storage_key, sha256, size_bytes)
       VALUES ($1, $2, 'preview', 'synthetic/preview.csv', $3, 0)`,
      [ids.reportId, ids.executionId, `synthetic-report-${ids.reportId}`]
    );
    await client.query(
      `INSERT INTO audit_events (id, user_id, execution_id, actor_type, source,
         action, resource_type, resource_id, result)
       VALUES ($1, $2, $3, 'ADMIN_TOOL', 'test', 'smoke_test', 'execution', $3, 'ok')`,
      [ids.auditId, ids.userId, ids.executionId]
    );
    await client.query("COMMIT");
    return ids;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    if (!pool) await ownPool.end();
  }
}
