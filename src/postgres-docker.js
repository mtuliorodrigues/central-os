import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readGroupHistoryFromDocker({
  groupJid,
  limit = 4114,
  sinceUnix = null,
  container = "evolution_postgres",
  user = "evolution",
  database = "evolution"
}) {
  if (!/^[0-9-]+@g\.us$/.test(groupJid)) throw new Error("SOURCE_GROUP_JID inválido.");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 4114, 20000));
  const safeSince = sinceUnix == null ? null : Math.max(0, Math.floor(Number(sinceUnix) || 0));
  const sinceClause = safeSince ? `AND "messageTimestamp" >= ${safeSince}` : "";
  const sql = `
    SELECT json_build_object(
      'id', id,
      'key', key,
      'pushName', "pushName",
      'participant', participant,
      'messageType', "messageType",
      'message', message,
      'contextInfo', "contextInfo",
      'messageTimestamp', "messageTimestamp"
    )::text
    FROM "Message"
    WHERE key->>'remoteJid' = '${groupJid}'
      ${sinceClause}
    ORDER BY "messageTimestamp" DESC
    LIMIT ${safeLimit};
  `;

  const { stdout } = await execFileAsync("docker", [
    "exec", container, "psql", "-U", user, "-d", database,
    "-t", "-A", "-c", sql
  ], { maxBuffer: 50 * 1024 * 1024 });

  return stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(line => JSON.parse(line));
}


export async function listWhatsAppGroupsFromDocker({
  container = "evolution_postgres",
  user = "evolution",
  database = "evolution"
} = {}) {
  const sql = `
    SELECT json_build_object(
      'remoteJid', "remoteJid",
      'name', COALESCE(name, '')
    )::text
    FROM "Chat"
    WHERE "remoteJid" LIKE '%@g.us'
    ORDER BY COALESCE(name, ''), "remoteJid";
  `;

  const { stdout } = await execFileAsync("docker", [
    "exec", container, "psql", "-U", user, "-d", database,
    "-t", "-A", "-c", sql
  ], { maxBuffer: 10 * 1024 * 1024 });

  return stdout
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
