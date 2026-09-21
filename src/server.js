import "dotenv/config";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGroupHistoryFromDocker } from "./postgres-docker.js";
import { analyzeSpreadsheetReferences, findPossiblyClosed } from "./possibly-closed.js";
import { parseSpreadsheetBuffer, publicImportSummary } from "./spreadsheet-import.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const importFile = path.join(dataDir, "current-import.json");
const port = Number(process.env.CENTRAL_OS_PORT || 8787);
const groupJid = process.env.SOURCE_GROUP_JID || "553497702861-1601827551@g.us";
const groupName = process.env.SOURCE_GROUP_NAME || "TÉC.PLAY";

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

async function saveImport(data) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(importFile, JSON.stringify(data, null, 2), "utf8");
}

async function getCurrentImport() {
  try {
    return JSON.parse(await readFile(importFile, "utf8"));
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

async function readMessages(days) {
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
  return readGroupHistoryFromDocker({
    groupJid,
    sinceUnix,
    limit: 20000,
    container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
    user: process.env.POSTGRES_USER || "evolution",
    database: process.env.POSTGRES_DB || "evolution"
  });
}

async function getAnalysis(days) {
  const currentImport = await requireImport();
  const messages = await readMessages(days);
  return {
    groupName,
    groupJid,
    import: publicImportSummary(currentImport, { preview: 0 }),
    ...analyzeSpreadsheetReferences(messages, currentImport.references, { days })
  };
}

async function getPossiblyClosed(days) {
  const currentImport = await requireImport();
  const messages = await readMessages(days);
  return {
    groupName,
    groupJid,
    import: publicImportSummary(currentImport, { preview: 0 }),
    ...findPossiblyClosed(messages, { days, references: currentImport.references })
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/ui.js", ["ui.js", "text/javascript; charset=utf-8"]],
  ["/dashboard.js", ["dashboard.js", "text/javascript; charset=utf-8"]],
  ["/relatorio", ["relatorio.html", "text/html; charset=utf-8"]],
  ["/relatorio.html", ["relatorio.html", "text/html; charset=utf-8"]],
  ["/relatorio.js", ["relatorio.js", "text/javascript; charset=utf-8"]],
  ["/importar-planilha", ["importar-planilha.html", "text/html; charset=utf-8"]],
  ["/importar-planilha.html", ["importar-planilha.html", "text/html; charset=utf-8"]],
  ["/importar-planilha.js", ["importar-planilha.js", "text/javascript; charset=utf-8"]],
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
      await saveImport(parsed);
      return json(res, 200, {
        ok: true,
        message: "Planilha importada e definida como referência principal das OS.",
        ...publicImportSummary(parsed)
      });
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
  console.log(`Central OS local: http://127.0.0.1:${port}`);
  console.log(`Importar planilha: http://127.0.0.1:${port}/importar-planilha`);
  console.log(`Possivelmente Fechadas: http://127.0.0.1:${port}/possivelmente-fechadas`);
});
