const DONE = [
  /\bj[aá]\s+foi\s+feit[oa]\b/i,
  /\bfoi\s+feit[oa]\b/i,
  /\bfeit[oa]\b/i,
  /\bfinalizei\b/i,
  /\bfinalizad[oa]\b/i,
  /\bconclu[ií]d[oa]\b/i,
  /\bresolvid[oa]\b/i,
  /\bnormalizad[oa]\b/i,
  /\bservi[cç]o\s+realizad[oa]\b/i,
  /\batendimento\s+realizad[oa]\b/i,
  /\bcliente\s+ok\b/i
];

const PENDING = [
  /\bpendente\b/i,
  /\bn[aã]o\s+foi\s+feit[oa]\b/i,
  /\bn[aã]o\s+realizad[oa]\b/i,
  /\breagendar\b/i,
  /\baguardando\b/i,
  /\bn[aã]o\s+atendeu\b/i,
  /\bsem\s+acesso\b/i,
  /\bsolicitando\s+previs[aã]o\b/i,
  /\bprevis[aã]o\s+da\s+ordem\b/i
];

function textOf(m) {
  const x = m?.message ?? m;
  return x?.conversation || x?.extendedTextMessage?.text || x?.imageMessage?.caption ||
    x?.documentMessage?.caption || x?.videoMessage?.caption || m?.text || "";
}

function ctxOf(m) {
  const x = m?.message ?? m;
  return m?.contextInfo || x?.extendedTextMessage?.contextInfo || x?.imageMessage?.contextInfo ||
    x?.documentMessage?.contextInfo || x?.videoMessage?.contextInfo || {};
}

function idOf(m) { return m?.key?.id || m?.id || ""; }
function tsOf(m) { return Number(m?.messageTimestamp || m?.timestamp || 0); }
function senderOf(m) { return m?.pushName || m?.key?.participant || m?.participant || "Desconhecido"; }

function quotedText(ctx) {
  const q = ctx?.quotedMessage || {};
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption ||
    q.documentMessage?.caption || q.videoMessage?.caption || "";
}

function normalize(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isStructuredOS(text) {
  if (!text || text.length < 35) return false;
  let score = 0;
  if (/\*?Cliente:\*?|Nome\/Raz[aã]o Social:/i.test(text)) score++;
  if (/\bCliente ID:|\bID\s*:\s*\d+/i.test(text)) score++;
  if (/\bLogin\s*:/i.test(text)) score++;
  if (/\*?Servi[cç]o:\*?|\bPlano\s*:/i.test(text)) score++;
  if (/Descri[cç][aã]o|ATENDIMENTO\s*:/i.test(text)) score++;
  return score >= 2;
}

function relationTo(root, m) {
  const c = ctxOf(m);
  if (c?.stanzaId && c.stanzaId === idOf(root)) return "resposta";
  const qt = normalize(quotedText(c));
  if (qt && qt === normalize(textOf(root))) return "resposta";
  if (c?.isForwarded || Number(c?.forwardingScore || 0) > 0) return "encaminhada";
  if (Array.isArray(c?.mentionedJid) && c.mentionedJid.length) return "marcada";
  return "contexto";
}

function matchAny(text, rules) {
  for (const rule of rules) {
    const m = String(text || "").match(rule);
    if (m) return m[0];
  }
  return null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const m = String(text || "").match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractDescription(text) {
  const raw = String(text || "");
  const m = raw.match(/(?:Descri[cç][aã]o|ATENDIMENTO)\s*:\s*([\s\S]+)/i);
  if (!m) return raw.trim();
  return m[1]
    .split(/\n(?:Contato|CONTATO|Att\b|ATT\b|Solicitado por|Solicitante)\s*:?/i)[0]
    .replace(/^\*+|\*+$/g, "")
    .trim();
}

function extractDetails(root) {
  const text = textOf(root);
  const client = firstMatch(text, [
    /\*?Cliente:\*?\s*([^\n]+)/i,
    /Nome\/Raz[aã]o Social:\s*([^\n]+)/i,
    /Nome:\s*([^\n]+)/i
  ]);
  const osNumber = firstMatch(text, [
    /\bO\.?S\.?\s*(?:n[º°o.]?\s*)?[:#-]?\s*(\d{2,})\b/i,
    /\bOrdem de Servi[cç]o\s*(?:n[º°o.]?\s*)?[:#-]?\s*(\d{2,})\b/i
  ]);
  const contractId = firstMatch(text, [
    /\bCliente ID:\s*(\d+)/i,
    /\*?ID:\*?\s*(\d+)/i,
    /\bID\s*:\s*(\d+)/i,
    /\bContrato ID\s*(\d+)/i
  ]);
  const login = firstMatch(text, [/\bLogin\s*:\s*([^\s\n]+)/i]);
  const service = firstMatch(text, [
    /\*?Servi[cç]o:\*?\s*([^\n]+)/i,
    /\bPlano\s*:\s*([^\n]+)/i
  ]);

  return {
    client: client || "Cliente não identificado",
    osIdentification: osNumber || contractId || idOf(root),
    osNumber: osNumber || null,
    contractId: contractId || null,
    login: login || null,
    service: service || null,
    description: extractDescription(text)
  };
}

function evidenceOf(m, root, reason, signal = null) {
  return {
    messageId: idOf(m),
    timestamp: tsOf(m),
    sender: senderOf(m),
    relation: relationTo(root, m),
    text: textOf(m),
    signal,
    reason
  };
}

export function findPossiblyClosed(messages, { days = 30, maxAdjacent = 8, maxAdjacentMinutes = 20 } = {}) {
  const ordered = [...messages].sort((a,b) => tsOf(a) - tsOf(b));
  const roots = ordered.filter(m => isStructuredOS(textOf(m)));
  const results = [];

  for (const root of roots) {
    const rootId = idOf(root);
    const rootTs = tsOf(root);
    const rootIndex = ordered.indexOf(root);
    const nextRootIndex = ordered.findIndex((m, idx) => idx > rootIndex && isStructuredOS(textOf(m)));
    const hardEnd = nextRootIndex >= 0 ? nextRootIndex : ordered.length;

    const direct = ordered.filter(m => {
      if (m === root) return false;
      const c = ctxOf(m);
      return (c?.stanzaId && c.stanzaId === rootId) ||
        (quotedText(c) && normalize(quotedText(c)) === normalize(textOf(root)));
    });

    const adjacent = [];
    for (let i = rootIndex + 1; i < Math.min(hardEnd, rootIndex + 1 + maxAdjacent); i++) {
      const m = ordered[i];
      if (isStructuredOS(textOf(m))) break;
      if (tsOf(m) - rootTs > maxAdjacentMinutes * 60) break;
      adjacent.push(m);
    }

    const uniq = new Map();
    for (const m of [...direct, ...adjacent]) {
      const k = idOf(m) || `${tsOf(m)}:${senderOf(m)}:${textOf(m)}`;
      uniq.set(k, m);
    }

    let doneScore = 0;
    let pendingScore = 0;
    const evidence = [];

    for (const m of uniq.values()) {
      const text = textOf(m);
      if (!text || isStructuredOS(text)) continue;

      const doneSignal = matchAny(text, DONE);
      const pendingSignal = matchAny(text, PENDING);
      const relation = relationTo(root, m);
      const weight = relation === "resposta" ? 4 : 2;

      if (doneSignal) {
        doneScore += weight;
        evidence.push(evidenceOf(
          m, root,
          relation === "resposta"
            ? "Resposta diretamente vinculada à OS indica conclusão."
            : "Mensagem logo após a OS contém indício de conclusão.",
          doneSignal
        ));
      }
      if (pendingSignal) {
        pendingScore += weight;
        evidence.push(evidenceOf(
          m, root,
          "Mensagem relacionada contém indício de pendência.",
          pendingSignal
        ));
      }
    }

    if (doneScore < 2 || doneScore <= pendingScore) continue;

    const details = extractDetails(root);
    results.push({
      osMessageId: rootId,
      date: rootTs,
      confidence: doneScore >= 4 && pendingScore === 0 ? "alta" : "media",
      scores: { done: doneScore, pending: pendingScore },
      ...details,
      originalText: textOf(root),
      evidence: evidence.sort((a,b) => a.timestamp - b.timestamp)
    });
  }

  return {
    days,
    generatedAt: new Date().toISOString(),
    totalMessages: messages.length,
    totalStructuredOS: roots.length,
    totalPossiblyClosed: results.length,
    items: results.sort((a,b) => b.date - a.date)
  };
}
