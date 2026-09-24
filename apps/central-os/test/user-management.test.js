import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { centralDatabaseConfigured, createCentralPool } from "../src/db/connection.js";
import { hashPassword } from "../src/auth/password.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const waitForServer = async (child, url) => { const deadline = Date.now() + 8_000; while (Date.now() < deadline) { try { await fetch(url); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } } throw new Error(`Servidor de teste não iniciou: ${child.exitCode}`); };
const tokenHash = token => createHash("sha256").update(token, "utf8").digest("hex");

test("administração protege MASTER_ADMIN, usuários e sessões", { skip: !centralDatabaseConfigured() }, async () => {
  const pool = createCentralPool();
  const master = (await pool.query("SELECT id FROM users WHERE role = 'MASTER_ADMIN' AND active = true LIMIT 1")).rows[0];
  if (!master) { await pool.end(); return; }
  const port = 8801;
  const child = spawn(process.execPath, ["src/server.js"], { cwd: root, env: { ...process.env, CENTRAL_OS_PORT: String(port) }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  const masterToken = randomBytes(32).toString("base64url");
  const username = `synthetic-user-${randomUUID()}`;
  let createdId = null;
  const headers = { Authorization: `Bearer ${masterToken}`, "Content-Type": "application/json" };
  const call = (path, options = {}) => fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  try {
    await pool.query("INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, metadata) VALUES ($1, $2, $3, now() + interval '1 hour', now(), '{}'::jsonb)", [randomUUID(), master.id, tokenHash(masterToken)]);
    await waitForServer(child, `${base}/api/health`);

    const usersResponse = await call("/api/admin/users");
    assert.equal(usersResponse.status, 200);
    const listed = await usersResponse.json();
    assert.ok(listed.users.every(user => !("passwordHash" in user) && !("tokenHash" in user)));

    const createdResponse = await call("/api/admin/users", { method: "POST", body: JSON.stringify({ name: "Usuário Sintético", username, password: "Initial-123!", avatar: "synthetic" }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    createdId = created.user.id;
    assert.equal(created.user.role, "USER");
    assert.equal(created.user.active, true);
    assert.equal((await call("/api/admin/users", { method: "POST", body: JSON.stringify({ name: "Duplicado", username, password: "Other-123!" }) })).status, 409);
    assert.equal((await call(`/api/admin/users/${master.id}/deactivate`, { method: "POST" })).status, 409);

    const userLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Initial-123!" }) });
    assert.equal(userLogin.status, 200);
    const userAuth = await userLogin.json();
    const userHeaders = { Authorization: `Bearer ${userAuth.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/admin/users`, { headers: userHeaders })).status, 403);
    assert.equal((await call(`/api/admin/users/${createdId}`, { method: "PATCH", body: JSON.stringify({ name: "Usuário Editado", avatar: "avatar-2" }) })).status, 200);
    assert.equal((await call(`/api/admin/users/${createdId}/reset-password`, { method: "POST", body: JSON.stringify({ password: "Reset-456!" }) })).status, 200);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: userHeaders })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Initial-123!" }) })).status, 401);
    assert.equal((await call(`/api/admin/users/${createdId}/deactivate`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Reset-456!" }) })).status, 401);
    assert.equal((await call(`/api/admin/users/${createdId}/activate`, { method: "POST" })).status, 200);
    const reactivatedLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Reset-456!" }) });
    assert.equal(reactivatedLogin.status, 200);
    const reactivated = await reactivatedLogin.json();
    const reactivatedHeaders = { Authorization: `Bearer ${reactivated.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/auth/profile`, { method: "PATCH", headers: reactivatedHeaders, body: JSON.stringify({ name: "Perfil Alterado", avatar: "avatar-3" }) })).status, 200);
    const changed = await fetch(`${base}/api/auth/change-password`, { method: "POST", headers: reactivatedHeaders, body: JSON.stringify({ currentPassword: "Reset-456!", newPassword: "Changed-789!" }) });
    assert.equal(changed.status, 200);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: reactivatedHeaders })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Changed-789!" }) })).status, 200);
    const audit = await pool.query("SELECT action FROM audit_events WHERE user_id = $1", [createdId]);
    for (const action of ["user_created", "user_updated", "password_reset_by_admin", "user_disabled", "user_enabled", "password_changed", "sessions_revoked"]) assert.ok(audit.rows.some(row => row.action === action), action);
  } finally {
    child.kill();
    if (createdId) {
      await pool.query("DELETE FROM audit_events WHERE user_id = $1", [createdId]);
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [createdId]);
      await pool.query("DELETE FROM users WHERE id = $1", [createdId]);
    }
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(masterToken)]);
    await pool.end();
  }
});
