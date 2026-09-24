import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

async function waitForServer(child, url) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try { await fetch(url); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error(`Servidor de teste não iniciou: ${child.exitCode}`);
}

test("rotas públicas mínimas e proteção backend", async () => {
  const port = 8799;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, CENTRAL_OS_PORT: String(port) },
    stdio: "ignore"
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(child, `${base}/api/health`);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const publicPayload = await health.json();
    assert.equal(publicPayload.persistence.ok, true);
    assert.equal(publicPayload.relatorio, undefined);

    const protectedResponse = await fetch(`${base}/api/resumo`);
    assert.equal(protectedResponse.status, 401);
    const invalidToken = await fetch(`${base}/api/resumo`, { headers: { Authorization: "Bearer invalid" } });
    assert.equal(invalidToken.status, 401);

    const preflight = await fetch(`${base}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://central-os-lake.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://central-os-lake.vercel.app");
    assert.match(preflight.headers.get("access-control-allow-headers") || "", /Authorization/);
  } finally {
    child.kill();
  }
});
