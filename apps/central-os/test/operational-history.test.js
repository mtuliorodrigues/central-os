import test from "node:test";
import assert from "node:assert/strict";
import { createCentralPool } from "../src/db/connection.js";
import {
  createOperationalImport,
  createOperationalExecution,
  finalizeOperationalExecution,
  failOperationalExecution,
  getExecution,
  listExecutionItems,
  listExecutionReports,
  sha256
} from "../src/operational-history.js";

const pool = createCentralPool();

test("rastreia Import → Execution → ExecutionItem → Report sem recalcular contadores", { skip: !pool }, async () => {
  const digest = sha256(Buffer.from("central-os-fase-7a-fixture", "utf8"));
  const first = await createOperationalImport({ source: "ui", originalFileName: "fixture.csv", storageKey: "data/planilhas/fixture.csv", sha256: digest, generatedAt: "2026-01-15T12:00:00.000Z", generatedAtSource: "manual", generatedAtConfidence: "user_confirmed", rowCount: 2, pool });
  const duplicate = await createOperationalImport({ source: "ui", originalFileName: "fixture-copy.csv", storageKey: "data/planilhas/fixture-copy.csv", sha256: digest, rowCount: 2, pool });
  const executionId = await createOperationalExecution({ importId: first.import.id, source: "ui", fileNameSnapshot: "fixture.csv", groups: [{ role: "origin", jid: "111@g.us", name: "Origem Fixture" }, { role: "destination", jid: "222@g.us", name: "Destino Fixture" }], pool });
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const finishedAt = new Date().toISOString();
  const contract = {
    executionId, importId: first.import.id, source: "ui", fileName: "fixture.csv", startedAt, finishedAt, status: "completed_with_errors", rowsRead: 2, excludedCount: 1, excludedByReason: { duplicada: 1 }, eligibleCount: 1, foundCount: 1, reviewCount: 0, notFoundCount: 0, sentCount: 0, skippedCount: 0, failureCount: 1, engineVersion: "fixture-engine", errorSummary: { message: "fixture" },
    items: [{ rowNumber: 2, osNumber: "OS-1", contractId: "C-1", clientName: "Cliente Fixture", status: "found", matchScore: 91, matchReasons: ["contractId"], messageIdSource: "msg-1", messageIdDestination: "", reviewRequired: false }, { rowNumber: 3, osNumber: "OS-2", contractId: "C-2", clientName: "Cliente Excluído", status: "excluded", matchReasons: ["duplicada"], failureCode: "duplicada", reviewRequired: false }],
    artifacts: [{ type: "preview", storageKey: "fixture-preview.csv", sha256: digest, sizeBytes: 12, metadata: { fixture: true } }]
  };
  const finalized = await finalizeOperationalExecution({ executionId, contract, pool });
  const items = await listExecutionItems(executionId, { pool });
  const reports = await listExecutionReports(executionId, { pool });
  const audit = await pool.query("SELECT action FROM audit_events WHERE execution_id=$1 ORDER BY timestamp", [executionId]);
  const secondExecution = await createOperationalExecution({ importId: first.import.id, source: "ui", fileNameSnapshot: "fixture.csv", groups: [], pool });
  await failOperationalExecution({ executionId: secondExecution, errorSummary: { code: "fixture_failure" }, pool });
  try {
    assert.equal(duplicate.duplicateOf.id, first.import.id);
    assert.equal(first.import.generatedAtSource, "manual");
    assert.equal(finalized.status, "completed_with_errors");
    assert.equal(finalized.foundCount, 1);
    assert.equal(finalized.failureCount, 1);
    assert.equal(items.length, 2);
    assert.equal(items[0].status, "found");
    assert.equal(reports.length, 1);
    assert.deepEqual(audit.rows.map(row => row.action).sort(), ["execution_finished", "execution_requested", "execution_started", "report_created"].sort());
    assert.equal((await getExecution(secondExecution, { pool })).status, "failed");
  } finally {
    await pool.query("DELETE FROM audit_events WHERE execution_id IN ($1,$2)", [executionId, secondExecution]);
    await pool.query("DELETE FROM reports WHERE execution_id IN ($1,$2)", [executionId, secondExecution]);
    await pool.query("DELETE FROM execution_items WHERE execution_id IN ($1,$2)", [executionId, secondExecution]);
    await pool.query("DELETE FROM execution_groups WHERE execution_id IN ($1,$2)", [executionId, secondExecution]);
    await pool.query("DELETE FROM executions WHERE id IN ($1,$2)", [executionId, secondExecution]);
    await pool.query("DELETE FROM imports WHERE id IN ($1,$2)", [first.import.id, duplicate.import.id]);
  }
});

test.after(async () => { if (pool) await pool.end(); });
