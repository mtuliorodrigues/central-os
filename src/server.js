import "dotenv/config";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGroupHistoryFromDocker } from "./postgres-docker.js";
import { findPossiblyClosed } from "./possibly-closed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.CENTRAL_OS_PORT || 8787);
const groupJid = process.env.SOURCE_GROUP_JID || "553497702861-1601827551@g.us";
const groupName = process.env.SOURCE_GROUP_NAME || "TÉC.PLAY";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
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

async function getPossiblyClosed(days) {
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
  const messages = await readGroupHistoryFromDocker({
    groupJid,
    sinceUnix,
    limit: 20000,
    container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
    user: process.env.POSTGRES_USER || "evolution",
    database: process.env.POSTGRES_DB || "evolution"
  });
  return {
    groupName,
    groupJid,
    ...findPossiblyClosed(messages, { days })
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/ui.js", ["ui.js", "text/javascript; charset=utf-8"]],
  ["/relatorio", ["relatorio.html", "text/html; charset=utf-8"]],
  ["/relatorio.html", ["relatorio.html", "text/html; charset=utf-8"]],
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

    if (url.pathname === "/api/possivelmente-fechadas") {
      const requested = Number(url.searchParams.get("days") || 30);
      const days = requested === 20 ? 20 : 30;
      const result = await getPossiblyClosed(days);
      return json(res, 200, result);
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
    json(res, 500, {
      error: "Falha ao analisar o histórico local.",
      detail: error?.message || String(error)
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Central OS local: http://127.0.0.1:${port}`);
  console.log(`Possivelmente Fechadas: http://127.0.0.1:${port}/possivelmente-fechadas`);
});
