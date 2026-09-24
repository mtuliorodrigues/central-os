import { centralDatabaseConfigured, createCentralPool } from "./connection.js";
import path from "node:path";

export async function centralDatabaseHealth() {
  if (!centralDatabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      detail: "CENTRAL_OS_DATABASE_URL ausente; persistência própria ainda não está conectada."
    };
  }

  const pool = createCentralPool();
  try {
    const result = await pool.query("SELECT current_database() AS database, 1 AS ok");
    return {
      ok: result.rows[0]?.ok === 1,
      configured: true,
      database: result.rows[0]?.database || null,
      detail: "Banco Central OS acessível."
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      detail: error?.message || String(error)
    };
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.basename(process.argv[1]) === "health.js") {
  centralDatabaseHealth().then(result => {
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  });
}
