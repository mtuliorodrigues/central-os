import pg from "pg";
import "../integrated-env.js";

const { Pool } = pg;

export function centralDatabaseConfigured() {
  return Boolean(String(process.env.CENTRAL_OS_DATABASE_URL || "").trim());
}

export function createCentralPool(options = {}) {
  const connectionString = String(options.connectionString || process.env.CENTRAL_OS_DATABASE_URL || "").trim();
  if (!connectionString) return null;

  return new Pool({
    connectionString,
    max: Number(options.max || process.env.CENTRAL_OS_DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: Number(options.connectionTimeoutMillis || 3_000),
    ssl: options.ssl ?? false
  });
}

export async function withCentralClient(fn, options = {}) {
  const pool = options.pool || createCentralPool(options);
  if (!pool) throw new Error("CENTRAL_OS_DATABASE_URL não configurada.");
  try {
    return await fn(pool);
  } finally {
    if (!options.pool) await pool.end();
  }
}
