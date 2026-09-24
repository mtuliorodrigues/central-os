import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCentralPool } from "./connection.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

export async function listMigrations() {
  const names = await fs.readdir(migrationsDir);
  return names.filter(name => /^\d+_.+\.sql$/i.test(name)).sort();
}

export async function migrate({ pool = null } = {}) {
  const ownPool = pool || createCentralPool();
  if (!ownPool) throw new Error("CENTRAL_OS_DATABASE_URL não configurada.");
  const client = await ownPool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map(row => row.version));
    const appliedNow = [];

    for (const version of await listMigrations()) {
      if (applied.has(version)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, version), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        appliedNow.push(version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${version} falhou: ${error.message}`);
      }
    }
    return { applied: appliedNow, total: applied.size + appliedNow.length };
  } finally {
    client.release();
    if (!pool) await ownPool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  migrate().then(result => {
    console.log(JSON.stringify({ ok: true, ...result }));
  }).catch(error => {
    console.error(`[DB MIGRATION ERROR] ${error.message}`);
    process.exitCode = 1;
  });
}
