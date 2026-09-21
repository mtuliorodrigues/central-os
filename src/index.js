import "dotenv/config";
import { EvolutionClient } from "./evolution.js";
import { analyzeHistory } from "./analyzer.js";
import { saveRun } from "./store.js";

const group = process.env.SOURCE_GROUP_JID;
if (!group) throw new Error("Configure SOURCE_GROUP_JID no .env.");

const client = new EvolutionClient({
  baseUrl: process.env.EVOLUTION_BASE_URL,
  apiKey: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE
});

console.log("Central OS V1 — lendo histórico do grupo...");
const messages = await client.findMessages(group, Number(process.env.HISTORY_LIMIT || 1000));
console.log(`${messages.length} mensagens recebidas.`);

const analyses = analyzeHistory(messages, {
  before: Number(process.env.CONTEXT_BEFORE || 3),
  after: Number(process.env.CONTEXT_AFTER || 8)
});

const result = {
  generatedAt: new Date().toISOString(),
  group,
  messageCount: messages.length,
  osCount: analyses.length,
  summary: analyses.reduce((a,x) => ((a[x.classification] = (a[x.classification] || 0) + 1), a), {}),
  analyses
};

const path = await saveRun(result);
console.log("Resumo:", result.summary);
console.log(`Evidências gravadas em ${path}`);
