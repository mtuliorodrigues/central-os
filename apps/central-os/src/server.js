import "./integrated-env.js";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGroupHistoryFromDocker, listWhatsAppGroupsFromDocker } from "./postgres-docker.js";
import { analyzeSpreadsheetReferences } from "./possibly-closed.js";
import { parseSpreadsheetBuffer, publicImportSummary } from "./spreadsheet-import.js";
import { centralDatabaseHealth } from "./db/health.js";
import { authenticated, bearerToken } from "./auth/middleware.js";
import { login, logout } from "./auth/service.js";
import {
  getRelatorioStatus,
  getRelatorioConfig,
  saveRelatorioGroups,
  saveSpreadsheetFile,
  getRelatorioLogs,
  listSpreadsheets,
  executeReport
} from "./relatorio-bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.resolve(process.env.CENTRAL_OS_DATA_DIR || path.join(root, "data"));
const importFile = path.join(dataDir, "current-import.json");
const analysisFile = path.join(dataDir, "current-analysis.json");
const historyFile = path.join(dataDir, "analysis-history.json");
const historyDetailsDir = path.join(dataDir, "history-details");
const port = Number(process.env.CENTRAL_OS_PORT || 8787);
const frontendDist = path.join(root, "frontend", "dist");
const forceLegacyUi = /^(1|true|yes|sim|on)$/i.test(String(process.env.CENTRAL_OS_LEGACY_UI || ""));
const modernFrontendEnabled = !forceLegacyUi && existsSync(path.join(frontendDist, "index.html"));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const defaultGroupNames = [
  "TÉC.PLAY",
  "ORDEM DE SERVIÇO - PLAY SOLUÇÕES",
  "Rede Play",
  "O.S DIARIA",
  "ADMINISTRATIVO - PLAY SOLUÇÕES"
];
const configuredGroupNames = (process.env.SOURCE_GROUP_NAMES || defaultGroupNames.join("|"))
  .split("|")
  .map(x => x.trim())
  .filter(Boolean);

const importantGroupNames = [
  "TechPlay",
  "Rede Play",
  "ORDEM DE SERVIÇO - PLAY SOLUÇÕES",
  "OS Diário",
  "Administrativo Soluções"
];

let evolutionGroupsCache = { at: 0, groups: null, error: null, pending: null };

const allowedOrigins = new Set(
  String(process.env.CENTRAL_OS_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,https://central-os-lake.vercel.app")
    .split(",").map(origin => origin.trim()).filter(Boolean)
);

function cors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && allowedOrigins.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

function requestIp(req) {
  return String(req.socket?.remoteAddress || "local").slice(0, 100);
}

function rateLimitKey(req, username) {
  return `${requestIp(req)}:${String(username || "").trim().toLowerCase().slice(0, 128)}`;
}

function checkLoginRateLimit(key) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, failures: 0 });
    return;
  }
  if (current.failures >= LOGIN_MAX_FAILURES) {
    throw Object.assign(new Error("Muitas tentativas. Tente novamente mais tarde."), { code: "login_rate_limited", statusCode: 429 });
  }
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.startedAt >= LOGIN_WINDOW_MS) loginAttempts.set(key, { startedAt: now, failures: 1 });
  else current.failures += 1;
}

function clearLoginFailures(key) { loginAttempts.delete(key); }

function json(res, status, data) {
  cors(res.__centralRequest || { headers: {} }, res);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonBody(req, maxBytes = 24 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Arquivo muito grande. O limite atual é de aproximadamente 15 MB por planilha.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Corpo JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

async function readHistory() {
  try {
    const data = JSON.parse(await readFile(historyFile, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeHistory(history) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(historyFile, JSON.stringify(history.slice(0, 50), null, 2), "utf8");
}

async function upsertImportHistory(data) {
  const history = await readHistory();
  const id = data.importId;
  const previous = history.find(item => item.id === id);
  const entry = {
    id,
    fileName: data.fileName,
    importedAt: data.importedAt,
    totalOS: data.references?.length || 0,
    analyzedAt: previous?.analyzedAt || null,
    days: previous?.days || null,
    totalAnalyzed: previous?.totalAnalyzed || 0,
    totalMatched: previous?.totalMatched || 0,
    totalUnmatched: previous?.totalUnmatched || 0,
    possiblyClosed: previous?.possiblyClosed || 0,
    pendingOrReview: previous?.pendingOrReview || 0,
    groups: previous?.groups || []
  };
  const next = [entry, ...history.filter(item => item.id !== id)]
    .sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")));
  await writeHistory(next);
}

async function recordAnalysis(data, analysis, groups, days) {
  const history = await readHistory();
  const summary = analysis.summary || {};
  const pendingOrReview =
    Number(summary.possivelmente_pendente || 0) +
    Number(summary.revisao_manual || 0) +
    Number(summary.sem_evidencia || 0);

  const entry = {
    id: data.importId,
    fileName: data.fileName,
    importedAt: data.importedAt,
    totalOS: data.references?.length || 0,
    analyzedAt: new Date().toISOString(),
    days,
    totalAnalyzed: analysis.totalSpreadsheetOS || 0,
    totalMatched: analysis.totalMatched || 0,
    totalUnmatched: analysis.totalUnmatched || 0,
    possiblyClosed: Number(summary.possivelmente_realizada || 0),
    pendingOrReview,
    groups: groups.map(group => group.name)
  };

  const next = [entry, ...history.filter(item => item.id !== data.importId)]
    .sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")));
  await writeHistory(next);
  return entry;
}

async function writeCurrentImport(data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(importFile, JSON.stringify(data, null, 2), "utf8");
}

async function clearAnalysisCache() {
  try {
    await rm(analysisFile, { force: true });
  } catch {}
}

async function saveImport(data) {
  await archiveCurrentAnalysis();
  const prepared = { ...data, importId: data.importId || randomUUID() };
  await writeCurrentImport(prepared);
  await clearAnalysisCache();
  await upsertImportHistory(prepared);
  return prepared;
}

async function getCurrentImport() {
  try {
    const data = JSON.parse(await readFile(importFile, "utf8"));
    if (!data.importId) {
      data.importId = randomUUID();
      await writeCurrentImport(data);
      await upsertImportHistory(data);
    }
    return data;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function requireImport() {
  const current = await getCurrentImport();
  if (!current?.references?.length) {
    const error = new Error("Importe uma planilha antes de iniciar a análise.");
    error.statusCode = 409;
    error.code = "spreadsheet_required";
    throw error;
  }
  return current;
}

async function readAnalysisCache() {
  try {
    return JSON.parse(await readFile(analysisFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeAnalysisCache(cache) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(analysisFile, JSON.stringify(cache, null, 2), "utf8");
}

function safeHistoryId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{6,128}$/.test(id) ? id : null;
}

async function writeHistorySnapshot(importId, full) {
  const id = safeHistoryId(importId);
  if (!id || !full) return;
  await mkdir(historyDetailsDir, { recursive: true });
  await writeFile(
    path.join(historyDetailsDir, `${id}.json`),
    JSON.stringify({
      id,
      fileName: full?.import?.fileName || "",
      importedAt: full?.import?.importedAt || "",
      analyzedAt: new Date().toISOString(),
      days: full?.days || 30,
      groups: (full?.groups || []).map(group => group.name),
      analysis: full
    }, null, 2),
    "utf8"
  );
}

async function archiveCurrentAnalysis() {
  try {
    const currentImport = await getCurrentImport();
    const cache = await readAnalysisCache();
    if (currentImport?.importId && cache?.importId === currentImport.importId && cache?.full) {
      await writeHistorySnapshot(currentImport.importId, cache.full);
    }
  } catch {}
}

async function readHistorySnapshot(importId) {
  const id = safeHistoryId(importId);
  if (!id) return null;

  try {
    return JSON.parse(await readFile(path.join(historyDetailsDir, `${id}.json`), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const currentImport = await getCurrentImport();
  const cache = await readAnalysisCache();
  if (currentImport?.importId === id && cache?.importId === id && cache?.full) {
    return {
      id,
      fileName: cache.full?.import?.fileName || currentImport.fileName || "",
      importedAt: cache.full?.import?.importedAt || currentImport.importedAt || "",
      analyzedAt: cache.generatedAt || cache.full?.generatedAt || "",
      days: cache.full?.days || 30,
      groups: (cache.full?.groups || []).map(group => group.name),
      analysis: cache.full
    };
  }

  return null;
}

async function fetchEvolutionGroups() {
  const now = Date.now();
  if (evolutionGroupsCache.groups && now - evolutionGroupsCache.at < 5 * 60 * 1000) {
    return evolutionGroupsCache.groups;
  }
  if (evolutionGroupsCache.pending) return evolutionGroupsCache.pending;

  const base = String(process.env.EVOLUTION_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
  const instance = process.env.EVOLUTION_INSTANCE || "sgp-whatsapp";
  const apiKey = process.env.AUTHENTICATION_API_KEY || process.env.EVOLUTION_API_KEY || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  evolutionGroupsCache.pending = fetch(`${base}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`, {
    headers: apiKey ? { apikey: apiKey } : {},
    signal: controller.signal
  }).then(async response => {
    if (!response.ok) throw new Error(`Evolution respondeu HTTP ${response.status} ao listar grupos.`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload?.groups || payload?.data || [];
    return rows.map(group => ({
      name: group.subject || group.name || group.pushName || "Grupo sem nome",
      jid: group.id || group.remoteJid || group.jid || null,
      available: Boolean(group.id || group.remoteJid || group.jid),
      source: "evolution",
      size: group.size ?? group.participants?.length ?? null
    })).filter(group => group.jid && /@g\.us$/.test(group.jid));
  }).then(groups => {
    evolutionGroupsCache = { at: Date.now(), groups, error: null, pending: null };
    return groups;
  }).catch(error => {
    evolutionGroupsCache = { ...evolutionGroupsCache, error: error?.message || String(error), pending: null };
    throw error;
  }).finally(() => clearTimeout(timer));
  return evolutionGroupsCache.pending;
}

async function discoverGroupConfiguration() {
  let available = [];
  let source = "evolution";
  let error = null;
  try {
    available = await fetchEvolutionGroups();
  } catch (evolutionError) {
    error = evolutionError?.message || String(evolutionError);
    source = "postgres-fallback";
    try {
      available = (await listWhatsAppGroupsFromDocker({
        container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
        user: process.env.POSTGRES_USER || "evolution",
        database: process.env.POSTGRES_DB || "evolution"
      })).map(group => ({ name: group.name || "Grupo sem nome", jid: group.remoteJid, available: true, source }));
    } catch {}
  }

  const byNormalizedName = new Map();
  for (const group of available) {
    const normalized = normalizeName(group.name);
    if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, group);
  }

  const result = available.map(group => ({ ...group, reason: null }));
  const seenJids = new Set(result.map(group => group.jid));
  const configured = await getRelatorioConfig();
  const selected = [configured.origem, configured.destino].filter(Boolean);
  for (const group of selected) {
    if (group.id && !seenJids.has(group.id)) {
      result.push({ name: group.name || group.id, jid: group.id, available: false, source: "configured", reason: "Configurado localmente, mas não retornado pela Evolution." });
      seenJids.add(group.id);
    }
  }

  for (const wanted of importantGroupNames) {
    const aliases = wanted === "TechPlay" ? ["TechPlay", "TÉC.PLAY"]
      : wanted === "OS Diário" ? ["OS Diário", "O.S DIARIA", "O.S DIÁRIO"]
      : wanted === "Administrativo Soluções" ? ["Administrativo Soluções", "ADMINISTRATIVO - PLAY SOLUÇÕES"]
      : [wanted];
    const match = aliases.map(normalizeName).map(name => byNormalizedName.get(name)).find(Boolean);
    if (match?.jid) {
      if (!result.some(group => group.jid === match.jid)) result.push({ ...match, reason: null });
    } else if (!result.some(group => normalizeName(group.name) === normalizeName(wanted))) {
      result.push({ name: wanted, jid: null, available: false, source, reason: error || "Não retornado pela Evolution para esta instância." });
    }
  }

  return result.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
}

async function analysisGroups() {
  const available = await discoverGroupConfiguration();
  const configured = await getRelatorioConfig();
  const selectedOrigin = configured.origem?.id;
  const names = new Set(configuredGroupNames.map(normalizeName));
  if (configured.origem?.name) names.add(normalizeName(configured.origem.name));
  return available.filter(group => group.available && group.jid && (group.jid === selectedOrigin || names.has(normalizeName(group.name))));
}

async function readMessages(days = 30) {
  const configured = await analysisGroups();
  const groups = configured.filter(group => group.available && group.jid);
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;

  const batches = await Promise.all(groups.map(async group => {
    const messages = await readGroupHistoryFromDocker({
      groupJid: group.jid,
      sinceUnix,
      limit: 20000,
      container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
      user: process.env.POSTGRES_USER || "evolution",
      database: process.env.POSTGRES_DB || "evolution"
    });
    return messages.map(message => ({
      ...message,
      __groupName: group.name,
      __groupJid: group.jid
    }));
  }));

  return { configured, groups, messages: batches.flat() };
}

function rebuildSummary(items) {
  return items.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {});
}

function viewForDays(full, requestedDays) {
  const days = requestedDays === 20 ? 20 : 30;
  if (days === 30) return { ...full, days: 30 };

  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const items = (full.items || []).map(item => {
    if (item.classification === "nao_localizada") return item;
    if (Number(item.date || 0) >= cutoff) {
      return {
        ...item,
        evidence: (item.evidence || []).filter(ev => !ev.timestamp || Number(ev.timestamp) >= cutoff)
      };
    }
    return {
      reference: item.reference,
      classification: "nao_localizada",
      confidence: "baixa",
      match: null,
      evidence: []
    };
  });

  const summary = rebuildSummary(items);
  const totalMatched = items.filter(item => item.classification !== "nao_localizada").length;

  return {
    ...full,
    days,
    summary,
    items,
    totalMatched,
    totalUnmatched: items.length - totalMatched
  };
}

async function processAnalysis() {
  const currentImport = await requireImport();
  const { configured, groups, messages } = await readMessages(30);
  const analysis = analyzeSpreadsheetReferences(messages, currentImport.references, { days: 30 });
  const history = await recordAnalysis(currentImport, analysis, groups, 30);

  const full = {
    groups,
    configuredGroups: configured,
    import: publicImportSummary(currentImport, { preview: 0 }),
    history,
    ...analysis,
    days: 30
  };

  const view20 = viewForDays(full, 20);

  await writeAnalysisCache({
    version: 3,
    importId: currentImport.importId,
    generatedAt: new Date().toISOString(),
    full,
    views: {
      "20": view20,
      "30": full
    }
  });

  await writeHistorySnapshot(currentImport.importId, full);
  return full;
}

async function getCachedAnalysis(days = 30, { processIfMissing = false } = {}) {
  const currentImport = await requireImport();
  const cache = await readAnalysisCache();

  if (cache?.version === 3 && cache?.importId === currentImport.importId && cache?.full) {
    const normalized = days === 20 ? 20 : 30;
    return cache?.views?.[String(normalized)] || viewForDays(cache.full, normalized);
  }

  if (!processIfMissing) {
    const error = new Error("A análise ainda não foi concluída.");
    error.statusCode = 409;
    error.code = "analysis_required";
    throw error;
  }

  const full = await processAnalysis();
  return viewForDays(full, days);
}

async function getPossiblyClosed(days) {
  const analysis = await getCachedAnalysis(days, { processIfMissing: false });
  const items = (analysis.items || [])
    .filter(item => item.classification === "possivelmente_realizada")
    .sort((a, b) => Number(b.date || 0) - Number(a.date || 0));

  return {
    ...analysis,
    totalPossiblyClosed: items.length,
    items
  };
}

async function getSummary() {
  const current = await getCurrentImport();
  const history = await readHistory();
  const reportsGenerated = history.filter(item => item?.analyzedAt).length;

  if (!current) {
    return {
      imported: false,
      counts: {
        reportsGenerated,
        analyzed: 0,
        located: 0,
        notLocated: 0,
        possiblyClosed: 0,
        pending: 0
      }
    };
  }

  const cache = await readAnalysisCache();
  if (cache?.version !== 3 || cache?.importId !== current.importId || !cache?.full) {
    return {
      imported: true,
      import: publicImportSummary(current, { preview: 0 }),
      counts: {
        reportsGenerated,
        imported: current.references?.length || 0,
        analyzed: 0,
        located: 0,
        notLocated: 0,
        possiblyClosed: 0,
        pending: 0
      },
      lastAnalysis: null
    };
  }

  const full = cache?.views?.["30"] || cache.full;
  const summary = full.summary || {};
  return {
    imported: true,
    import: publicImportSummary(current, { preview: 0 }),
    counts: {
      reportsGenerated,
      imported: current.references?.length || 0,
      analyzed: full.totalSpreadsheetOS || 0,
      located: full.totalMatched || 0,
      notLocated: full.totalUnmatched || 0,
      possiblyClosed: Number(summary.possivelmente_realizada || 0),
      pending:
        Number(summary.possivelmente_pendente || 0) +
        Number(summary.revisao_manual || 0) +
        Number(summary.sem_evidencia || 0)
    },
    lastAnalysis: cache.generatedAt || full.generatedAt || null
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/assets/central-os-logo.svg", ["assets/central-os-logo.svg", "image/svg+xml; charset=utf-8"]],
  ["/ui.js", ["ui.js", "text/javascript; charset=utf-8"]],
  ["/local-api.js", ["local-api.js", "text/javascript; charset=utf-8"]],
  ["/global-import.js", ["global-import.js", "text/javascript; charset=utf-8"]],
  ["/dashboard.js", ["dashboard.js", "text/javascript; charset=utf-8"]],
  ["/analysis-list.js", ["analysis-list.js", "text/javascript; charset=utf-8"]],
  ["/historico.js", ["historico.js", "text/javascript; charset=utf-8"]],
  ["/grupos.js", ["grupos.js", "text/javascript; charset=utf-8"]],
  ["/importar-planilha", ["importar-planilha.html", "text/html; charset=utf-8"]],
  ["/importar-planilha.html", ["importar-planilha.html", "text/html; charset=utf-8"]],
  ["/importar-planilha.js", ["importar-planilha.js", "text/javascript; charset=utf-8"]],
  ["/os-analisadas", ["os-analisadas.html", "text/html; charset=utf-8"]],
  ["/os-analisadas.html", ["os-analisadas.html", "text/html; charset=utf-8"]],
  ["/localizadas", ["localizadas.html", "text/html; charset=utf-8"]],
  ["/localizadas.html", ["localizadas.html", "text/html; charset=utf-8"]],
  ["/nao-localizadas", ["nao-localizadas.html", "text/html; charset=utf-8"]],
  ["/nao-localizadas.html", ["nao-localizadas.html", "text/html; charset=utf-8"]],
  ["/pendentes", ["pendentes.html", "text/html; charset=utf-8"]],
  ["/pendentes.html", ["pendentes.html", "text/html; charset=utf-8"]],
  ["/historico", ["historico.html", "text/html; charset=utf-8"]],
  ["/historico.html", ["historico.html", "text/html; charset=utf-8"]],
  ["/relatorio", ["os-analisadas.html", "text/html; charset=utf-8"]],
  ["/relatorio.html", ["os-analisadas.html", "text/html; charset=utf-8"]],
  ["/grupos", ["grupos.html", "text/html; charset=utf-8"]],
  ["/grupos.html", ["grupos.html", "text/html; charset=utf-8"]],
  ["/configuracoes", ["configuracoes.html", "text/html; charset=utf-8"]],
  ["/configuracoes.html", ["configuracoes.html", "text/html; charset=utf-8"]],
  ["/possivelmente-fechadas", ["possivelmente-fechadas.html", "text/html; charset=utf-8"]],
  ["/possivelmente-fechadas.html", ["possivelmente-fechadas.html", "text/html; charset=utf-8"]],
  ["/possivelmente-fechadas.js", ["possivelmente-fechadas.js", "text/javascript; charset=utf-8"]]
]);

const server = http.createServer(async (req, res) => {
  try {
    res.__centralRequest = req;
    if (req.method === "OPTIONS") {
      cors(req, res);
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req, 32 * 1024);
      const username = String(body?.username || "").trim();
      const key = rateLimitKey(req, username);
      checkLoginRateLimit(key);
      try {
        const result = await login({
          username,
          password: body?.password,
          metadata: { ip: requestIp(req), userAgent: req.headers["user-agent"] }
        });
        clearLoginFailures(key);
        return json(res, 200, result);
      } catch (error) {
        if (error?.code === "invalid_credentials") recordLoginFailure(key);
        throw error;
      }
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const auth = await authenticated(req);
      if (!auth) throw Object.assign(new Error("Autenticação necessária."), { code: "unauthorized", statusCode: 401 });
      return json(res, 200, { user: auth.user, expiresAt: auth.expiresAt });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const auth = await authenticated(req);
      if (!auth) throw Object.assign(new Error("Autenticação necessária."), { code: "unauthorized", statusCode: 401 });
      await logout(bearerToken(req));
      return json(res, 200, { ok: true });
    }

    const publicApi = (url.pathname === "/api/health" || url.pathname === "/api/persistence/health") && req.method === "GET";
    if (url.pathname.startsWith("/api/") && !publicApi) {
      const auth = await authenticated(req);
      if (!auth) throw Object.assign(new Error("Autenticação necessária."), { code: "unauthorized", statusCode: 401 });
    }

    if (url.pathname === "/api/relatorio/status" && req.method === "GET") {
      return json(res, 200, await getRelatorioStatus());
    }

    if (url.pathname === "/api/relatorio/config" && req.method === "GET") {
      return json(res, 200, await getRelatorioConfig());
    }

    if (url.pathname === "/api/relatorio/logs" && req.method === "GET") {
      return json(res, 200, { logs: await getRelatorioLogs() });
    }

    if (url.pathname === "/api/relatorio/planilhas" && req.method === "GET") {
      return json(res, 200, { planilhas: await listSpreadsheets() });
    }

    if (url.pathname === "/api/relatorio/executar" && req.method === "POST") {
      const body = await readJsonBody(req, 1024 * 1024);
      return json(res, 200, await executeReport({ fileName: body?.fileName }));
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      const persistence = await centralDatabaseHealth();
      const healthAuth = bearerToken(req) ? await authenticated(req) : null;
      if (!healthAuth) {
        return json(res, 200, {
          ok: persistence.ok,
          service: "central-os-integrada",
          checkedAt: new Date().toISOString(),
          persistence: { ok: persistence.ok, configured: persistence.configured }
        });
      }
      const relatorio = await getRelatorioStatus();
      return json(res, 200, {
        ok: true,
        service: "central-os-integrada",
        checkedAt: new Date().toISOString(),
        relatorio,
        persistence
      });
    }

    if (url.pathname === "/api/persistence/health" && req.method === "GET") {
      const health = await centralDatabaseHealth();
      return json(res, 200, { ok: health.ok, configured: health.configured });
    }

    if (url.pathname === "/api/planilha/status" && req.method === "GET") {
      return json(res, 200, publicImportSummary(await getCurrentImport()));
    }

    if (url.pathname === "/api/planilha/importar" && req.method === "POST") {
      const body = await readJsonBody(req);
      const fileName = String(body.fileName || "").trim();
      const dataBase64 = String(body.dataBase64 || "");

      if (!fileName || !dataBase64) {
        return json(res, 400, { error: "Selecione uma planilha .xlsx ou .csv." });
      }

      const buffer = Buffer.from(dataBase64, "base64");
      if (!buffer.length) return json(res, 400, { error: "O arquivo enviado está vazio." });
      if (buffer.length > 15 * 1024 * 1024) {
        return json(res, 413, { error: "A planilha ultrapassa o limite de 15 MB." });
      }

      const parsed = await parseSpreadsheetBuffer(buffer, fileName);
      await saveSpreadsheetFile(fileName, buffer);
      const saved = await saveImport(parsed);
      return json(res, 200, {
        ok: true,
        message: "Planilha importada e definida como referência principal das OS.",
        ...publicImportSummary(saved)
      });
    }

    if (url.pathname === "/api/analise/processar" && req.method === "POST") {
      return json(res, 200, await processAnalysis());
    }

    if (url.pathname === "/api/resumo" && req.method === "GET") {
      return json(res, 200, await getSummary());
    }

    if (url.pathname === "/api/grupos" && req.method === "GET") {
      const groups = await discoverGroupConfiguration();
      return json(res, 200, {
        groups,
        source: groups.some(group => group.source === "evolution") ? "evolution" : "postgres-fallback",
        fetchedAt: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/grupos/config" && req.method === "POST") {
      const body = await readJsonBody(req, 64 * 1024);
      const groups = await discoverGroupConfiguration();
      const available = new Map(groups.filter(group => group.available && group.jid).map(group => [group.jid, group]));
      const origemJid = String(body?.origemJid || body?.origem?.id || body?.origem?.jid || "").trim();
      const destinoJid = String(body?.destinoJid || body?.destino?.id || body?.destino?.jid || "").trim();
      const origem = available.get(origemJid);
      const destino = available.get(destinoJid);
      if (!origem || !destino) {
        const error = new Error("Selecione grupos que estejam disponíveis na Evolution.");
        error.statusCode = 400;
        throw error;
      }
      const saved = await saveRelatorioGroups({ origem, destino });
      return json(res, 200, { ok: true, ...saved });
    }

    if (url.pathname === "/api/historico" && req.method === "GET") {
      return json(res, 200, { history: await readHistory() });
    }

    if (url.pathname.startsWith("/api/historico/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/historico/".length));
      const snapshot = await readHistorySnapshot(id);
      if (!snapshot) {
        return json(res, 404, {
          error: "Os detalhes completos desta análise não foram armazenados.",
          code: "history_details_unavailable"
        });
      }
      return json(res, 200, snapshot);
    }

    if (url.pathname === "/api/analise" && req.method === "GET") {
      const requested = Number(url.searchParams.get("days") || 30);
      const days = requested === 20 ? 20 : 30;
      return json(res, 200, await getCachedAnalysis(days, { processIfMissing: false }));
    }

    if (url.pathname === "/api/possivelmente-fechadas" && req.method === "GET") {
      const requested = Number(url.searchParams.get("days") || 30);
      const days = requested === 20 ? 20 : 30;
      return json(res, 200, await getPossiblyClosed(days));
    }

    if (modernFrontendEnabled && req.method === "GET") {
      const pathname = decodeURIComponent(url.pathname);
      const candidate = path.resolve(frontendDist, `.${pathname}`);
      const allowedRoot = `${path.resolve(frontendDist)}${path.sep}`;
      const isSafeAsset = candidate.startsWith(allowedRoot) && existsSync(candidate) && statSync(candidate).isFile();
      const file = isSafeAsset ? candidate : path.join(frontendDist, "index.html");
      const type = contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream";
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": type,
        "cache-control": isSafeAsset && /\.[a-f0-9]{8,}\./i.test(path.basename(file)) ? "public, max-age=31536000, immutable" : "no-store"
      });
      return res.end(body);
    }

    const entry = staticFiles.get(url.pathname);
    if (!entry) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    const [file, type] = entry;
    const body = await readFile(path.join(root, file));
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  } catch (error) {
    console.error(error);
    json(res, Number(error?.statusCode || 500), {
      error: error?.message || "Falha interna.",
      code: error?.code || "internal_error"
    });
  }
});

const host = process.env.CENTRAL_OS_HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Central OS: http://${host}:${port}`);
});
