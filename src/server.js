import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGroupHistoryFromDocker, listWhatsAppGroupsFromDocker } from "./postgres-docker.js";
import { analyzeSpreadsheetReferences, findPossiblyClosed } from "./possibly-closed.js";
import { parseSpreadsheetBuffer, publicImportSummary } from "./spreadsheet-import.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const importFile = path.join(dataDir, "current-import.json");
const historyFile = path.join(dataDir, "analysis-history.json");
const port = Number(process.env.CENTRAL_OS_PORT || 8787);

const primaryGroupJid = process.env.SOURCE_GROUP_JID || "553497702861-1601827551@g.us";
const primaryGroupName = process.env.SOURCE_GROUP_NAME || "TÉC.PLAY";
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

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(res, status, data) {
  cors(res);
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

async function saveImport(data) {
  const prepared = {
    ...data,
    importId: data.importId || randomUUID()
  };
  await writeCurrentImport(prepared);
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

async function discoverGroupConfiguration() {
  let available = [];
  try {
    available = await listWhatsAppGroupsFromDocker({
      container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
      user: process.env.POSTGRES_USER || "evolution",
      database: process.env.POSTGRES_DB || "evolution"
    });
  } catch {
    available = [];
  }

  const byNormalizedName = new Map();
  for (const group of available) {
    const normalized = normalizeName(group.name);
    if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, group);
  }

  const result = [];
  const seenJids = new Set();

  const primary = available.find(group => group.remoteJid === primaryGroupJid);
  result.push({
    name: primary?.name || primaryGroupName,
    jid: primaryGroupJid,
    available: true
  });
  seenJids.add(primaryGroupJid);

  for (const wanted of configuredGroupNames) {
    const match = byNormalizedName.get(normalizeName(wanted));
    if (match?.remoteJid && !seenJids.has(match.remoteJid)) {
      result.push({ name: match.name || wanted, jid: match.remoteJid, available: true });
      seenJids.add(match.remoteJid);
    } else if (normalizeName(wanted) !== normalizeName(primaryGroupName)) {
      result.push({ name: wanted, jid: null, available: false });
    }
  }

  return result;
}

async function readMessages(days) {
  const configured = await discoverGroupConfiguration();
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

async function getAnalysis(days) {
  const currentImport = await requireImport();
  const { configured, groups, messages } = await readMessages(days);
  const analysis = analyzeSpreadsheetReferences(messages, currentImport.references, { days });
  const history = await recordAnalysis(currentImport, analysis, groups, days);

  return {
    groups,
    configuredGroups: configured,
    import: publicImportSummary(currentImport, { preview: 0 }),
    history,
    ...analysis
  };
}

async function getPossiblyClosed(days) {
  const currentImport = await requireImport();
  const { configured, groups, messages } = await readMessages(days);
  const result = findPossiblyClosed(messages, { days, references: currentImport.references });
  await recordAnalysis(currentImport, result, groups, days);

  return {
    groups,
    configuredGroups: configured,
    import: publicImportSummary(currentImport, { preview: 0 }),
    ...result
  };
}

async function getSummary() {
  const current = await getCurrentImport();
  if (!current) return { imported: false, counts: {} };
  const history = await readHistory();
  const currentHistory = history.find(item => item.id === current.importId) || null;
  return {
    imported: true,
    import: publicImportSummary(current, { preview: 0 }),
    counts: {
      imported: current.references?.length || 0,
      analyzed: currentHistory?.totalAnalyzed || 0,
      located: currentHistory?.totalMatched || 0,
      notLocated: currentHistory?.totalUnmatched || 0,
      possiblyClosed: currentHistory?.possiblyClosed || 0,
      pending: currentHistory?.pendingOrReview || 0
    },
    lastAnalysis: currentHistory?.analyzedAt || null
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/ui.js", ["ui.js", "text/javascript; charset=utf-8"]],
  ["/local-api.js", ["local-api.js", "text/javascript; charset=utf-8"]],
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
    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

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
      const saved = await saveImport(parsed);
      return json(res, 200, {
        ok: true,
        message: "Planilha importada e definida como referência principal das OS.",
        ...publicImportSummary(saved)
      });
    }

    if (url.pathname === "/api/resumo" && req.method === "GET") {
      return json(res, 200, await getSummary());
    }

    if (url.pathname === "/api/grupos" && req.method === "GET") {
      return json(res, 200, { groups: await discoverGroupConfiguration() });
    }

    if (url.pathname === "/api/historico" && req.method === "GET") {
      return json(res, 200, { history: await readHistory() });
    }

    if (url.pathname === "/api/analise" && req.method === "GET") {
      const requested = Number(url.searchParams.get("days") || 30);
      const days = requested === 20 ? 20 : 30;
      return json(res, 200, await getAnalysis(days));
    }

    if (url.pathname === "/api/possivelmente-fechadas" && req.method === "GET") {
      const requested = Number(url.searchParams.get("days") || 30);
      const days = requested === 20 ? 20 : 30;
      return json(res, 200, await getPossiblyClosed(days));
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

server.listen(port, "127.0.0.1", () => {
  console.log(`Central OS: http://127.0.0.1:${port}`);
});
