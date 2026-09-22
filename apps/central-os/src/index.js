import "dotenv/config";
import { EvolutionClient } from "./evolution.js";
import { readGroupHistoryFromDocker } from "./postgres-docker.js";
import { analyzeHistory } from "./analyzer.js";
import { saveRun } from "./store.js";

const group = process.env.SOURCE_GROUP_JID || "";
const groupName = process.env.SOURCE_GROUP_NAME || "TÉC.PLAY";
const limit = Number(process.env.HISTORY_LIMIT || 4114);
const source = process.env.HISTORY_SOURCE || "postgres-docker";

let messages;
console.log(`Central OS V1 — grupo piloto: ${groupName} (${group})`);

if (source === "postgres-docker") {
  messages = await readGroupHistoryFromDocker({
    groupJid: group,
    limit,
    container: process.env.POSTGRES_CONTAINER || "evolution_postgres",
    user: process.env.POSTGRES_USER || "evolution",
    database: process.env.POSTGRES_DB || "evolution"
  });
} else {
  const client = new EvolutionClient({
    baseUrl: process.env.EVOLUTION_BASE_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE
  });
  messages = await client.findMessages(group, limit);
}

console.log(`${messages.length} mensagens reais recebidas.`);
const analyses = analyzeHistory(messages, {
  before: Number(process.env.CONTEXT_BEFORE || 3),
  after: Number(process.env.CONTEXT_AFTER || 8)
});
const result = {
  generatedAt: new Date().toISOString(),
  source,
  groupName,
  group,
  messageCount: messages.length,
  osCount: analyses.length,
  summary: analyses.reduce((a,x) => ((a[x.classification] = (a[x.classification] || 0) + 1), a), {}),
  analyses
};
const path = await saveRun(result);
console.log("Resumo:", result.summary);
console.log(`Evidências gravadas em ${path}`);
