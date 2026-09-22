const trimSlash = (v) => String(v || "").replace(/\/+$/, "");

export class EvolutionClient {
  constructor({ baseUrl, apiKey, instance }) {
    this.baseUrl = trimSlash(baseUrl);
    this.apiKey = apiKey;
    this.instance = instance;
  }

  async findMessages(remoteJid, limit = 1000) {
    if (!this.baseUrl || !this.apiKey || !this.instance) {
      throw new Error("Configure EVOLUTION_BASE_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.");
    }
    const url = `${this.baseUrl}/chat/findMessages/${encodeURIComponent(this.instance)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ where: { key: { remoteJid } }, limit })
    });
    if (!res.ok) throw new Error(`Evolution API respondeu ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const rows = json?.messages?.records ?? json?.messages ?? json?.records ?? json;
    return Array.isArray(rows) ? rows : [];
  }
}
