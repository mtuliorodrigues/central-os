import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createCentralPool } from "../db/connection.js";
import { hashPassword, verifyPassword } from "./password.js";

const SESSION_TTL_HOURS = Math.max(1, Number(process.env.CENTRAL_OS_SESSION_TTL_HOURS || 8));
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

function tokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function publicUser(row) {
  return { id: row.id, name: row.name, username: row.username, role: row.role, avatar: row.avatar || null };
}

async function withPool(pool, fn) {
  const ownPool = pool || createCentralPool();
  if (!ownPool) throw new Error("CENTRAL_OS_DATABASE_URL não configurada.");
  try { return await fn(ownPool); } finally { if (!pool) await ownPool.end(); }
}

async function audit(client, { userId = null, actorType = "USER", action, result, source = "central-os-auth", context = {} }) {
  await client.query(
    `INSERT INTO audit_events (id, user_id, actor_type, source, action, resource_type, result, context)
     VALUES ($1, $2, $3, $4, $5, 'auth', $6, $7::jsonb)`,
    [randomUUID(), userId, actorType, source, action, result, JSON.stringify(context)]
  );
}

export async function bootstrapMasterAdmin({ name, username, password, pool = null }) {
  const cleanName = String(name || "").trim();
  const cleanUsername = String(username || "").trim();
  if (!cleanName || !cleanUsername || !password) throw new Error("Nome, username e senha são obrigatórios.");
  const passwordHash = await hashPassword(password);
  return withPool(pool, async db => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const existingMaster = await client.query("SELECT id FROM users WHERE role = 'MASTER_ADMIN' LIMIT 1 FOR UPDATE");
      if (existingMaster.rowCount) throw Object.assign(new Error("MASTER_ADMIN já existe."), { code: "master_admin_exists", statusCode: 409 });
      const existingUsername = await client.query("SELECT id FROM users WHERE username = $1", [cleanUsername]);
      if (existingUsername.rowCount) throw Object.assign(new Error("Username já existe."), { code: "username_exists", statusCode: 409 });
      const id = randomUUID();
      await client.query(
        `INSERT INTO users (id, name, username, password_hash, role, active)
         VALUES ($1, $2, $3, $4, 'MASTER_ADMIN', true)`,
        [id, cleanName, cleanUsername, passwordHash]
      );
      await audit(client, { userId: id, actorType: "ADMIN_TOOL", action: "admin_bootstrapped", result: "success" });
      await client.query("COMMIT");
      return { id, name: cleanName, username: cleanUsername, role: "MASTER_ADMIN" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });
}

export async function login({ username, password, metadata = {}, pool = null }) {
  const cleanUsername = String(username || "").trim();
  return withPool(pool, async db => {
    const client = await db.connect();
    try {
      const result = await client.query("SELECT * FROM users WHERE username = $1 LIMIT 1", [cleanUsername]);
      const user = result.rows[0];
      const valid = Boolean(user?.active && user?.password_hash && await verifyPassword(password, user.password_hash));
      if (!valid) {
        await audit(client, { action: "login_failed", result: "failure", context: { username: cleanUsername.slice(0, 128) } });
        throw Object.assign(new Error("Credenciais inválidas."), { code: "invalid_credentials", statusCode: 401 });
      }
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $4, $6::jsonb)`,
        [randomUUID(), user.id, tokenHash(token), now, expiresAt, JSON.stringify({ userAgent: String(metadata.userAgent || "").slice(0, 300), ip: String(metadata.ip || "").slice(0, 100) })]
      );
      await client.query("UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1", [user.id]);
      await audit(client, { userId: user.id, action: "login_succeeded", result: "success" });
      await client.query("COMMIT");
      return { token, expiresAt: expiresAt.toISOString(), user: publicUser(user) };
    } catch (error) {
      if (error.code !== "invalid_credentials") { try { await client.query("ROLLBACK"); } catch {} }
      throw error;
    } finally { client.release(); }
  });
}

export async function authenticateToken(token, { pool = null } = {}) {
  const value = String(token || "").trim();
  if (!value) return null;
  return withPool(pool, async db => {
    const result = await db.query(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, s.last_seen_at,
              u.id, u.name, u.username, u.role, u.avatar, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 LIMIT 1`,
      [tokenHash(value)]
    );
    const row = result.rows[0];
    if (!row || row.revoked_at || !row.active || new Date(row.expires_at).getTime() <= Date.now()) return null;
    if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() >= LAST_SEEN_REFRESH_MS) {
      await db.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND revoked_at IS NULL", [row.session_id]);
    }
    return { sessionId: row.session_id, user: publicUser(row), expiresAt: new Date(row.expires_at).toISOString() };
  });
}

export async function logout(token, { pool = null } = {}) {
  const value = String(token || "").trim();
  if (!value) return false;
  return withPool(pool, async db => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT id, user_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash(value)]);
      if (!found.rowCount) { await client.query("ROLLBACK"); return false; }
      await client.query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [found.rows[0].id]);
      await audit(client, { userId: found.rows[0].user_id, action: "logout", result: "success" });
      await audit(client, { userId: found.rows[0].user_id, action: "session_revoked", result: "success" });
      await client.query("COMMIT");
      return true;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
}

export { publicUser, tokenHash };
