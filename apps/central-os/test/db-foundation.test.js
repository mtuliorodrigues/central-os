import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { centralDatabaseHealth } from "../src/db/health.js";
import { listMigrations } from "../src/db/migrate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.join(here, "..", "src", "db", "migrations");

test("fundação possui migration inicial ordenada e separada da Evolution", async () => {
  assert.deepEqual(await listMigrations(), ["001_initial_schema.sql", "002_auth_foundation.sql"]);
  const sql = await fs.readFile(path.join(migrationDir, "001_initial_schema.sql"), "utf8");
  for (const table of ["users", "sessions", "imports", "executions", "execution_items", "execution_groups", "reports", "audit_events", "app_settings", "group_configurations"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /UNIQUE \(execution_id, row_number\)/);
  assert.match(sql, /idx_execution_items_execution_os/);
  assert.doesNotMatch(sql, /"Message"|"Chat"|evolution/i);
});

test("healthcheck identifica configuração ausente sem fingir que o banco está saudável", async () => {
  const previous = process.env.CENTRAL_OS_DATABASE_URL;
  delete process.env.CENTRAL_OS_DATABASE_URL;
  try {
    const result = await centralDatabaseHealth();
    assert.equal(result.ok, false);
    assert.equal(result.configured, false);
  } finally {
    if (previous == null) delete process.env.CENTRAL_OS_DATABASE_URL;
    else process.env.CENTRAL_OS_DATABASE_URL = previous;
  }
});
