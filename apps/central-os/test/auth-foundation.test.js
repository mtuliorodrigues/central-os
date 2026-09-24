import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { centralDatabaseConfigured, createCentralPool } from "../src/db/connection.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { authenticateToken, bootstrapMasterAdmin, login, logout } from "../src/auth/service.js";
import { requireMasterAdmin } from "../src/auth/middleware.js";

test("núcleo de autenticação usa hashes, sessão opaca, revogação e auditoria", { skip: !centralDatabaseConfigured() }, async (t) => {
  const pool = createCentralPool();
  const existingMaster = await pool.query("SELECT 1 FROM users WHERE role = 'MASTER_ADMIN' LIMIT 1");
  if (existingMaster.rowCount) {
    await pool.end();
    t.skip("Banco operacional já contém MASTER_ADMIN real; não substituir a conta para teste sintético.");
    return;
  }
  const username = `synthetic-auth-${randomUUID()}`;
  const userId = randomUUID();
  const password = "Synthetic-Password-123!";
  let master;
  let userIdToClean = userId;
  try {
    const hash = await hashPassword(password);
    assert.notEqual(hash, password);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);

    master = await bootstrapMasterAdmin({ name: "Synthetic Admin", username, password, pool });
    assert.equal(master.role, "MASTER_ADMIN");
    await assert.rejects(
      () => bootstrapMasterAdmin({ name: "Second", username: `second-${username}`, password, pool }),
      error => error.code === "master_admin_exists"
    );

    const logged = await login({ username, password, pool });
    assert.ok(logged.token);
    assert.equal(logged.user.role, "MASTER_ADMIN");
    assert.equal(logged.user.id, master.id);
    const stored = await pool.query("SELECT token_hash, password_hash FROM users u LEFT JOIN sessions s ON s.user_id = u.id WHERE u.id = $1", [master.id]);
    assert.ok(stored.rows[0].password_hash.startsWith("scrypt$"));
    assert.ok(stored.rows[0].token_hash);
    assert.equal(stored.rows.some(row => row.token_hash === logged.token), false);

    const authenticated = await authenticateToken(logged.token, { pool });
    assert.equal(authenticated.user.username, username);
    assert.equal(await authenticateToken("invalid-token", { pool }), null);
    assert.equal(await logout(logged.token, { pool }), true);
    assert.equal(await authenticateToken(logged.token, { pool }), null);
    assert.equal(await logout(logged.token, { pool }), false);

    const inactiveId = randomUUID();
    const normalId = randomUUID();
    userIdToClean = `${master.id},${inactiveId},${normalId}`;
    await pool.query(
      "INSERT INTO users (id, name, username, password_hash, role, active) VALUES ($1, 'Inactive', $2, $3, 'USER', false)",
      [inactiveId, `inactive-${username}`, hash]
    );
    await assert.rejects(() => login({ username: `inactive-${username}`, password, pool }), error => error.code === "invalid_credentials");
    await pool.query(
      "INSERT INTO users (id, name, username, password_hash, role, active) VALUES ($1, 'Normal', $2, $3, 'USER', true)",
      [normalId, `normal-${username}`, hash]
    );
    const normalLogin = await login({ username: `normal-${username}`, password, pool });
    assert.equal(normalLogin.user.role, "USER");
    assert.throws(() => requireMasterAdmin({ user: normalLogin.user }), error => error.code === "forbidden");
    const expiredLogin = await login({ username, password, pool });
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [createHash("sha256").update(expiredLogin.token).digest("hex")]);
    assert.equal(await authenticateToken(expiredLogin.token, { pool }), null);
    const audit = await pool.query("SELECT action FROM audit_events WHERE user_id = $1 OR context->>'username' IN ($2, $3)", [master.id, username, `inactive-${username}`]);
    const actions = audit.rows.map(row => row.action);
    assert.ok(actions.includes("admin_bootstrapped"));
    assert.ok(actions.includes("login_succeeded"));
    assert.ok(actions.includes("login_failed"));
    assert.ok(actions.includes("logout"));
    assert.ok(actions.includes("session_revoked"));
  } finally {
    const ids = userIdToClean.split(",");
    await pool.query("DELETE FROM audit_events WHERE source = 'central-os-auth' AND context->>'username' LIKE 'inactive-synthetic-auth-%'");
    await pool.query("DELETE FROM audit_events WHERE user_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM sessions WHERE user_id = ANY($1::uuid[])", [ids]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});
