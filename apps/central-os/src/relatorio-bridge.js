import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { integratedRoot } from "./integrated-env.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.env.CENTRAL_OS_ROOT || integratedRoot);
const reportApp = path.join(root, "apps", "relatorio-os");
const reportSrc = path.join(reportApp, "src");
const groupsFile = path.resolve(process.env.RELATORIO_GROUPS_FILE || path.join(reportApp, "config", "grupos_relatorio_os.json"));
const usersFile = path.resolve(process.env.RELATORIO_USERS_FILE || path.join(reportApp, "config", "usuarios_relatorio.json"));
const spreadsheetsDir = path.resolve(process.env.RELATORIO_PLANILHAS_DIR || path.join(root, "data", "planilhas"));
const outputDir = path.resolve(process.env.RELATORIO_OUTPUT_DIR || path.join(root, "data", "relatorio-os", "saida"));
const listenerLogDir = path.resolve(process.env.RELATORIO_LISTENER_LOG_DIR || path.join(root, "logs", "relatorio-os", "listener"));
const stateDir = path.join(root, "data", "relatorio-os", "state");
const lockFile = path.join(stateDir, "report.lock");
const motor = path.join(reportSrc, "motor_relatorio_os.py");
const listener = path.join(reportSrc, "COMANDO_WHATSAPP_RELATORIO_USUARIOS.py");
const postgresContainer = process.env.POSTGRES_CONTAINER || "evolution_postgres";
const postgresUser = process.env.POSTGRES_USER || "evolution";
const postgresDb = process.env.POSTGRES_DB || "evolution";
const evolutionBase = String(process.env.EVOLUTION_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const evolutionInstance = process.env.EVOLUTION_INSTANCE || "sgp-whatsapp";
const apiKey = process.env.AUTHENTICATION_API_KEY || process.env.EVOLUTION_API_KEY || "";
const workerUrl = String(process.env.RELATORIO_WORKER_URL || "").replace(/\/+$/, "");
const postgresHost = process.env.POSTGRES_HOST || "";
const postgresPort = String(process.env.POSTGRES_PORT || "5432");
const postgresPassword = process.env.POSTGRES_PASSWORD || "";

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return /^(1|true|yes|sim|on)$/i.test(raw);
}

function publicPath(p) {
  const rel = path.relative(root, p);
  return !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.replaceAll("\\", "/") : null;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

function groupValue(data, keys) {
  for (const key of keys) {
    const item = data?.[key];
    if (item && typeof item === "object") {
      const id = item.id || item.jid || item.group_id || "";
      if (id) return { id: String(id), name: String(item.name || item.nome || item.subject || "") };
    }
  }
  return null;
}

export async function getRelatorioConfig() {
  const data = await readJson(groupsFile, {});
  const origem = groupValue(data, ["origem", "origin", "source", "grupo_origem", "entrada"]);
  const destino = groupValue(data, ["destino", "dest", "destination", "grupo_destino", "saida"]);
  const users = await readJson(usersFile, { usuarios: [] });
  return {
    configured: Boolean(origem?.id && destino?.id),
    origem,
    destino,
    registeredUsers: Array.isArray(users?.usuarios) ? users.usuarios.filter(x => x?.ativo !== false).length : 0,
    webExecutionEnabled: boolEnv("RELATORIO_ALLOW_WEB_EXECUTION", false),
    paths: {
      planilhas: publicPath(spreadsheetsDir),
      saida: publicPath(outputDir),
      listenerLogs: publicPath(listenerLogDir)
    }
  };
}

export async function saveRelatorioGroups({ origem, destino } = {}) {
  const normalize = (value) => {
    const id = String(value?.id || value?.jid || "").trim();
    const name = String(value?.name || value?.subject || "").trim();
    if (!/^[0-9-]+@g\.us$/.test(id)) {
      throw Object.assign(new Error("Identificador de grupo inválido."), { statusCode: 400, code: "invalid_group_jid" });
    }
    return { id, name };
  };

  const next = { origem: normalize(origem), destino: normalize(destino) };
  await fs.mkdir(path.dirname(groupsFile), { recursive: true });
  await fs.writeFile(groupsFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function commandOk(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, { timeout: 12000, windowsHide: true, ...options });
    return { ok: true, stdout: String(result.stdout || "").trim(), stderr: String(result.stderr || "").trim() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), stdout: String(error?.stdout || "").trim(), stderr: String(error?.stderr || "").trim() };
  }
}

async function dockerHealth() {
  if (/^container$/i.test(process.env.DEPLOYMENT_MODE || "")) {
    return { ok: true, version: null, detail: "Runtime de containers gerenciado pelo host AWS" };
  }
  const info = await commandOk("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return { ok: info.ok, version: info.ok ? info.stdout : null, detail: info.ok ? "Docker Engine disponível" : info.error };
}

async function postgresHealth() {
  if (postgresHost) {
    const env = postgresPassword ? { ...process.env, PGPASSWORD: postgresPassword } : process.env;
    const ready = await commandOk("pg_isready", ["-h", postgresHost, "-p", postgresPort, "-U", postgresUser, "-d", postgresDb], { env });
    if (!ready.ok) return { ok: false, detail: ready.stderr || ready.error };
    const query = await commandOk("psql", ["-h", postgresHost, "-p", postgresPort, "-U", postgresUser, "-d", postgresDb, "-t", "-A", "-c", "SELECT 1;"], { env });
    return { ok: query.ok && query.stdout.trim() === "1", detail: query.ok ? "SELECT 1 confirmado" : query.error };
  }
  const ready = await commandOk("docker", ["exec", postgresContainer, "pg_isready", "-U", postgresUser, "-d", postgresDb]);
  if (!ready.ok) return { ok: false, detail: ready.stderr || ready.error };
  const query = await commandOk("docker", ["exec", postgresContainer, "psql", "-U", postgresUser, "-d", postgresDb, "-t", "-A", "-c", "SELECT 1;"]);
  return { ok: query.ok && query.stdout.trim() === "1", detail: query.ok ? "SELECT 1 confirmado" : query.error };
}

async function evolutionHttpHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(evolutionBase, { signal: controller.signal, headers: apiKey ? { apikey: apiKey } : {} });
    return { ok: true, httpStatus: response.status, detail: `Evolution respondeu HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error?.message || String(error) };
  } finally { clearTimeout(timer); }
}

export function normalizeConnectionState(payload) {
  const state = payload?.instance?.state ?? payload?.state ?? payload?.instance?.connectionStatus ?? payload?.connectionStatus ?? null;
  const value = state == null ? null : String(state).toLowerCase();
  return { state: value, connected: value === "open" || value === "connected" };
}

async function whatsappHealth() {
  if (!apiKey) return { ok: false, connected: false, state: null, detail: "AUTHENTICATION_API_KEY ausente" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${evolutionBase}/instance/connectionState/${encodeURIComponent(evolutionInstance)}`, {
      signal: controller.signal,
      headers: { apikey: apiKey }
    });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch {}
    const state = normalizeConnectionState(payload);
    return { ok: response.ok && state.connected, connected: state.connected, state: state.state, httpStatus: response.status, detail: state.connected ? "Instância conectada" : `Estado: ${state.state || "desconhecido"}` };
  } catch (error) {
    return { ok: false, connected: false, state: null, detail: error?.message || String(error) };
  } finally { clearTimeout(timer); }
}

async function listListenerProcesses() {
  if (process.platform === "win32") {
    const ps = "$p=Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^python(w)?\\.exe$') -and ($_.CommandLine -like '*COMANDO_WHATSAPP_RELATORIO_USUARIOS.py*') }; $p | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId; parentPid=$_.ParentProcessId; command=$_.CommandLine} } | ConvertTo-Json -Compress";
    const result = await commandOk("powershell.exe", ["-NoProfile", "-Command", ps], { maxBuffer: 1024 * 1024 });
    if (!result.ok || !result.stdout) return [];
    try {
      const parsed = JSON.parse(result.stdout);
      return independentListenerProcesses((Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean));
    } catch { return []; }
  }
  const result = await commandOk("ps", ["-eo", "pid=,ppid=,args="], { maxBuffer: 5 * 1024 * 1024 });
  if (!result.ok) return [];
  const listeners = result.stdout.split(/\r?\n/)
    .map(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), parentPid: Number(m[2]), command: m[3] } : null; })
    .filter(Boolean)
    .filter(item => {
      const command = String(item.command || "").trim();
      const executable = path.basename(command.split(/\s+/)[0] || "").toLowerCase();
      const isPython = /^python(?:w)?(?:\d+(?:\.\d+)*)?$/.test(executable);
      return isPython && command.includes("COMANDO_WHATSAPP_RELATORIO_USUARIOS.py");
    });
  return independentListenerProcesses(listeners);
}

export function independentListenerProcesses(processes) {
  const listenerPids = new Set(processes.map(item => Number(item?.pid)).filter(Number.isFinite));
  return processes.filter(item => !listenerPids.has(Number(item?.parentPid)));
}

async function listenerHealth() {
  if (workerUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${workerUrl}/health`, { signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      const running = Boolean(payload?.listener?.running);
      return {
        ok: response.ok && running,
        running,
        count: running ? 1 : 0,
        integrated: running,
        pid: payload?.listener?.pid || null,
        busy: Boolean(payload?.execution?.busy),
        detail: running ? "Listener integrado ativo no worker Python" : "Worker acessível, listener inativo"
      };
    } catch (error) {
      return { ok: false, running: false, count: 0, integrated: false, pid: null, detail: error?.message || String(error) };
    } finally { clearTimeout(timer); }
  }
  const processes = await listListenerProcesses();
  const integrated = processes.filter(p => String(p.command || "").toLowerCase().includes(reportSrc.toLowerCase()));
  return {
    ok: processes.length === 1,
    running: processes.length > 0,
    count: processes.length,
    integrated: integrated.length === 1,
    pid: processes[0]?.pid || null,
    detail: processes.length === 0 ? "Listener não encontrado" : processes.length === 1 ? (integrated.length ? "Listener integrado ativo" : "Listener externo/legado ativo; não iniciar outro") : "Mais de um listener detectado"
  };
}

async function newestFile(dir, predicate) {
  try {
    const names = await fs.readdir(dir);
    const rows = await Promise.all(names.filter(predicate).map(async name => {
      try { const stat = await fs.stat(path.join(dir, name)); return { name, mtimeMs: stat.mtimeMs, modifiedAt: stat.mtime.toISOString(), size: stat.size }; } catch { return null; }
    }));
    return rows.filter(Boolean).sort((a,b) => b.mtimeMs - a.mtimeMs)[0] || null;
  } catch { return null; }
}

async function latestReport() {
  const sent = await newestFile(outputDir, name => /^relatorio_envio_.*\.csv$/i.test(name));
  const preview = await newestFile(outputDir, name => /^relatorio_previa_.*\.(csv|txt)$/i.test(name));
  const listenerExec = await newestFile(listenerLogDir, name => /^execucao_.*\.txt$/i.test(name));
  const best = [sent, preview, listenerExec].filter(Boolean).sort((a,b) => b.mtimeMs - a.mtimeMs)[0] || null;
  return best ? { fileName: best.name, modifiedAt: best.modifiedAt, size: best.size, type: sent?.name === best.name ? "envio" : preview?.name === best.name ? "previa" : "execucao" } : null;
}

async function currentLock() {
  try {
    const stat = await fs.stat(lockFile);
    const data = await readJson(lockFile, {});
    const ageMs = Date.now() - stat.mtimeMs;
    return { active: ageMs < 6 * 60 * 60 * 1000, ageMs, ...data };
  } catch { return { active: false }; }
}

export async function getRelatorioStatus() {
  const [docker, postgres, evolution, whatsapp, listenerStatus, config, lastReport, lock] = await Promise.all([
    dockerHealth(), postgresHealth(), evolutionHttpHealth(), whatsappHealth(), listenerHealth(), getRelatorioConfig(), latestReport(), currentLock()
  ]);
  return {
    checkedAt: new Date().toISOString(),
    docker,
    postgres,
    evolution,
    whatsapp: { ...whatsapp, instance: evolutionInstance },
    listener: listenerStatus,
    config,
    lastReport,
    reportExecution: { locked: Boolean(lock.active), startedAt: lock.startedAt || null, fileName: lock.fileName || null },
    ready: Boolean(docker.ok && postgres.ok && evolution.ok && whatsapp.connected && listenerStatus.running && listenerStatus.count === 1 && config.configured)
  };
}

export async function listSpreadsheets() {
  await fs.mkdir(spreadsheetsDir, { recursive: true });
  const names = await fs.readdir(spreadsheetsDir);
  const rows = [];
  for (const name of names) {
    if (!/\.(csv|xlsx)$/i.test(name)) continue;
    const full = path.join(spreadsheetsDir, name);
    const stat = await fs.stat(full);
    if (stat.isFile()) rows.push({ name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  return rows.sort((a,b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

function safeSpreadsheetPath(fileName) {
  const base = path.basename(String(fileName || ""));
  if (!/\.(csv|xlsx)$/i.test(base)) throw Object.assign(new Error("Selecione uma planilha .csv ou .xlsx válida."), { statusCode: 400, code: "invalid_spreadsheet" });
  const full = path.resolve(spreadsheetsDir, base);
  if (path.dirname(full) !== spreadsheetsDir) throw Object.assign(new Error("Caminho de planilha inválido."), { statusCode: 400, code: "invalid_spreadsheet_path" });
  return full;
}

export async function saveSpreadsheetFile(fileName, buffer) {
  const target = safeSpreadsheetPath(fileName);
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw Object.assign(new Error("Arquivo de planilha vazio."), { statusCode: 400, code: "empty_spreadsheet" });
  }
  await fs.mkdir(spreadsheetsDir, { recursive: true });
  await fs.writeFile(target, buffer);
  return { name: path.basename(target), size: buffer.length };
}

function pythonExecutable() {
  if (process.env.RELATORIO_PYTHON) return process.env.RELATORIO_PYTHON;
  const candidate = process.platform === "win32" ? path.join(reportApp, ".venv", "Scripts", "python.exe") : path.join(reportApp, ".venv", "bin", "python");
  return fsSync.existsSync(candidate) ? candidate : (process.platform === "win32" ? "python" : "python3");
}

async function acquireLock(fileName) {
  await fs.mkdir(stateDir, { recursive: true });
  try {
    const handle = await fs.open(lockFile, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), fileName }, null, 2), "utf8");
    await handle.close();
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const lock = await currentLock();
  if (!lock.active) {
    await fs.rm(lockFile, { force: true });
    return acquireLock(fileName);
  }
  throw Object.assign(new Error("Já existe um relatório em execução."), { statusCode: 409, code: "report_running" });
}

async function releaseLock() { await fs.rm(lockFile, { force: true }).catch(() => {}); }

export async function executeReport({ fileName } = {}) {
  if (!boolEnv("RELATORIO_ALLOW_WEB_EXECUTION", false)) {
    throw Object.assign(new Error("Execução pelo painel está desativada. Ative RELATORIO_ALLOW_WEB_EXECUTION=true após validar o baseline manual."), { statusCode: 403, code: "web_execution_disabled" });
  }
  const config = await getRelatorioConfig();
  if (!config.configured) throw Object.assign(new Error("Configure grupo de origem e destino antes de executar."), { statusCode: 409, code: "groups_required" });
  const sheets = await listSpreadsheets();
  const selected = fileName ? safeSpreadsheetPath(fileName) : (sheets[0] ? safeSpreadsheetPath(sheets[0].name) : null);
  if (!selected || !(await exists(selected))) throw Object.assign(new Error("Nenhuma planilha disponível para o relatório."), { statusCode: 409, code: "spreadsheet_required" });
  await acquireLock(path.basename(selected));
  await fs.mkdir(outputDir, { recursive: true });
  try {
    const env = {
      ...process.env,
      CENTRAL_OS_ROOT: root,
      RELATORIO_PLANILHAS_DIR: spreadsheetsDir,
      RELATORIO_GROUPS_FILE: groupsFile,
      RELATORIO_USERS_FILE: usersFile,
      RELATORIO_OUTPUT_DIR: outputDir,
      RELATORIO_LISTENER_LOG_DIR: listenerLogDir
    };
    let result;
    if (workerUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30 * 60 * 1000);
      try {
        const response = await fetch(`${workerUrl}/execute`, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: path.basename(selected), grupoOrigem: config.origem.id, grupoDestino: config.destino.id })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          const error = new Error(payload?.detail || payload?.stderr || `Worker respondeu HTTP ${response.status}`);
          error.statusCode = response.status >= 400 ? response.status : 500;
          throw error;
        }
        result = { stdout: payload?.stdout || "", stderr: payload?.stderr || "" };
      } finally { clearTimeout(timer); }
    } else {
      result = await execFileAsync(pythonExecutable(), [motor, selected, "--grupo-origem", config.origem.id, "--grupo-destino", config.destino.id, "--saida", outputDir, "--executar"], {
        cwd: reportSrc,
        env,
        timeout: 30 * 60 * 1000,
        maxBuffer: 25 * 1024 * 1024,
        windowsHide: true
      });
    }
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const summary = {};
    for (const [key, regex] of Object.entries({ afterFilters: /OS\s+ap[oó]s\s+filtros\s*[:=]\s*(\d+)/i, found: /ENCONTRADAS?(?:\s+NO\s+GRUPO(?:\s+DE\s+ORIGEM)?)?\s*[:=]\s*(\d+)/i, review: /REVISAR\s*[:=]\s*(\d+)/i, notFound: /N[AÃ]O\s+ENCONTRADAS?\s*[:=]\s*(\d+)/i, sent: /ENVIO CONCLU[IÍ]DO\s*\|\s*(\d+) OS enviadas/i })) {
      const match = output.match(regex); if (match) summary[key] = Number(match[1]);
    }
    return { ok: true, fileName: path.basename(selected), summary, finishedAt: new Date().toISOString(), lastReport: await latestReport() };
  } finally { await releaseLock(); }
}

export async function getRelatorioLogs() {
  const dirs = [
    { area: "listener", dir: listenerLogDir },
    { area: "saida", dir: outputDir }
  ];
  const files = [];
  for (const { area, dir } of dirs) {
    try {
      for (const name of await fs.readdir(dir)) {
        if (!/\.(log|txt|csv)$/i.test(name)) continue;
        const stat = await fs.stat(path.join(dir, name));
        files.push({ area, name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
      }
    } catch {}
  }
  return files.sort((a,b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0, 50);
}

export const bridgePaths = { root, reportApp, reportSrc, groupsFile, usersFile, spreadsheetsDir, outputDir, listenerLogDir, motor, listener, lockFile };
