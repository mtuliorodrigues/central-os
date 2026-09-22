import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "central-os-relatorio-test-"));
const groupsFile = path.join(testRoot, "config", "grupos.json");
const usersFile = path.join(testRoot, "config", "usuarios.json");

Object.assign(process.env, {
  CENTRAL_OS_ROOT: testRoot,
  RELATORIO_GROUPS_FILE: groupsFile,
  RELATORIO_USERS_FILE: usersFile,
  RELATORIO_PLANILHAS_DIR: path.join(testRoot, "data", "planilhas"),
  RELATORIO_OUTPUT_DIR: path.join(testRoot, "data", "saida"),
  RELATORIO_LISTENER_LOG_DIR: path.join(testRoot, "logs", "listener"),
  RELATORIO_ALLOW_WEB_EXECUTION: "false",
  RELATORIO_WORKER_URL: "http://127.0.0.1:1",
  EVOLUTION_BASE_URL: "http://127.0.0.1:1",
  EVOLUTION_INSTANCE: "test-instance",
  AUTHENTICATION_API_KEY: "test-key",
  DEPLOYMENT_MODE: "container",
  POSTGRES_HOST: "127.0.0.1",
  POSTGRES_PORT: "1",
  POSTGRES_PASSWORD: "test-password"
});

const {
  normalizeConnectionState,
  getRelatorioConfig,
  listSpreadsheets,
  executeReport,
  getRelatorioStatus,
  bridgePaths
} = await import("../src/relatorio-bridge.js");

test.after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

test("normaliza estados da Evolution sem confundir HTTP com WhatsApp conectado", () => {
  assert.deepEqual(normalizeConnectionState({ instance: { state: "open" } }), { state: "open", connected: true });
  assert.deepEqual(normalizeConnectionState({ state: "connected" }), { state: "connected", connected: true });
  assert.equal(normalizeConnectionState({ instance: { state: "close" } }).connected, false);
  assert.equal(normalizeConnectionState({}).connected, false);
});

test("configuração ausente é reportada sem inventar grupos", async () => {
  const config = await getRelatorioConfig();
  assert.equal(config.configured, false);
  assert.equal(config.origem, null);
  assert.equal(config.destino, null);
  assert.equal(config.webExecutionEnabled, false);
});

test("diretório de planilhas portátil é criado dentro da raiz integrada", async () => {
  const sheets = await listSpreadsheets();
  assert.ok(Array.isArray(sheets));
  assert.ok(bridgePaths.spreadsheetsDir.startsWith(bridgePaths.root));
  assert.equal(path.basename(bridgePaths.spreadsheetsDir), "planilhas");
});

test("execução web nasce bloqueada por segurança", async () => {
  await assert.rejects(() => executeReport({ fileName: "teste.csv" }), error => error?.code === "web_execution_disabled" && error?.statusCode === 403);
});

test("healthcheck retorna estados estruturados mesmo sem infraestrutura local", async () => {
  const status = await getRelatorioStatus();
  for (const key of ["docker", "postgres", "evolution", "whatsapp", "listener", "config"]) assert.ok(key in status);
  assert.equal(typeof status.ready, "boolean");
  assert.equal(status.whatsapp.instance, "test-instance");
});

test("lock persistente impede uma segunda execução antes de chamar o motor", async () => {
  await fs.mkdir(path.dirname(bridgePaths.groupsFile), { recursive: true });
  await fs.mkdir(bridgePaths.spreadsheetsDir, { recursive: true });
  await fs.mkdir(path.dirname(bridgePaths.lockFile), { recursive: true });
  await fs.writeFile(bridgePaths.groupsFile, JSON.stringify({ origem: { id: "111@g.us", name: "Origem Teste" }, destino: { id: "222@g.us", name: "Destino Teste" } }), "utf8");
  await fs.writeFile(path.join(bridgePaths.spreadsheetsDir, "lock-test.csv"), "OS;Cliente\n1;Teste\n", "utf8");
  await fs.writeFile(bridgePaths.lockFile, JSON.stringify({ pid: 99999, startedAt: new Date().toISOString(), fileName: "outro.csv" }), "utf8");
  const old = process.env.RELATORIO_ALLOW_WEB_EXECUTION;
  process.env.RELATORIO_ALLOW_WEB_EXECUTION = "true";
  try {
    await assert.rejects(() => executeReport({ fileName: "lock-test.csv" }), error => error?.code === "report_running" && error?.statusCode === 409);
  } finally {
    if (old == null) delete process.env.RELATORIO_ALLOW_WEB_EXECUTION; else process.env.RELATORIO_ALLOW_WEB_EXECUTION = old;
    await fs.rm(bridgePaths.lockFile, { force: true });
    await fs.rm(path.join(bridgePaths.spreadsheetsDir, "lock-test.csv"), { force: true });
    await fs.rm(bridgePaths.groupsFile, { force: true });
  }
});
