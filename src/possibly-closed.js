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
function senderOf(m) {
  const name = String(m?.pushName || "").trim();
  if (name) return name;

  const raw = String(m?.key?.participant || m?.participant || m?.sender || "").trim();
  if (!raw) return "Desconhecido";

  const local = raw.split("@")[0].split(":")[0].trim();
  return local || raw;
}
function groupNameOf(m) { return m?.__groupName || "Grupo"; }
function groupJidOf(m) { return m?.__groupJid || m?.key?.remoteJid || ""; }

function quotedText(ctx) {
  const q = ctx?.quotedMessage || {};
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption ||
    q.documentMessage?.caption || q.videoMessage?.caption || "";
}

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function numberTokens(text) {
  return new Set((String(text || "").match(/\d{2,}/g) || []).map(digits));
}

function wordSet(text) {
  return new Set(normalize(text).split(" ").filter(w => w.length >= 3));
}

function overlapRatio(a, b) {
  const left = wordSet(a);
  const right = wordSet(b);
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const word of left) if (right.has(word)) hit++;
  return hit / left.size;
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
    groupName: groupNameOf(m),
    relation: relationTo(root, m),
    text: textOf(m),
    signal,
    reason
  };
}

function safeReference(ref) {
  return {
    rowNumber: ref?.rowNumber || null,
    client: ref?.client || "",
    osNumber: ref?.osNumber || "",
    contractId: ref?.contractId || "",
    login: ref?.login || "",
    service: ref?.service || "",
    description: ref?.description || "",
    date: ref?.date || ""
  };
}

function scoreReferenceAgainstRoot(ref, root) {
  const text = textOf(root);
  const normalizedText = normalize(text);
  const numbers = numberTokens(text);
  const matchedFields = [];
  let score = 0;
  let strong = 0;

  const osNumber = digits(ref?.osNumber);
  if (osNumber && numbers.has(osNumber)) {
    score += 7; strong++; matchedFields.push("os");
  }

  const contractId = digits(ref?.contractId);
  if (contractId && numbers.has(contractId)) {
    score += 6; strong++; matchedFields.push("id");
  }

  const cpf = digits(ref?.cpf);
  if ((cpf.length === 11 || cpf.length === 14) && numbers.has(cpf)) {
    score += 6; strong++; matchedFields.push("cpf");
  }

  const login = normalize(ref?.login);
  if (login && login.length >= 3 && normalizedText.includes(login)) {
    score += 6; strong++; matchedFields.push("login");
  }

  const client = normalize(ref?.client);
  if (client && client.length >= 4) {
    if (normalizedText.includes(client)) {
      score += 4;
      matchedFields.push("cliente");
    } else {
      const ratio = overlapRatio(client, normalizedText);
      if (ratio >= 0.75) {
        score += 3;
        matchedFields.push("cliente");
      }
    }
  }

  const description = normalize(ref?.description);
  if (description.length >= 18) {
    const sample = description.slice(0, 90).trim();
    if (sample.length >= 18 && normalizedText.includes(sample)) {
      score += 5; strong++; matchedFields.push("descricao");
    } else {
      const ratio = overlapRatio(description, normalizedText);
      if (ratio >= 0.58) {
        score += 4; strong++; matchedFields.push("descricao");
      }
    }
  }

  const service = normalize(ref?.service);
  if (service.length >= 4 && normalizedText.includes(service)) {
    score += 1;
    matchedFields.push("servico");
  }

  const qualifies = (strong > 0 && score >= 5) || score >= 7;
  return { score, strong, matchedFields, qualifies };
}

function findBestRoot(reference, roots) {
  let best = null;
  for (const root of roots) {
    const match = scoreReferenceAgainstRoot(reference, root);
    if (!match.qualifies) continue;
    if (!best || match.score > best.score || (match.score === best.score && tsOf(root) > tsOf(best.root))) {
      best = { root, ...match };
    }
  }
  return best;
}

function analyzeMatchedRoot(ordered, root, { maxAdjacent = 8, maxAdjacentMinutes = 20 } = {}) {
  const rootId = idOf(root);
  const rootTs = tsOf(root);
  const rootGroup = groupJidOf(root);
  const groupOrdered = ordered.filter(m => groupJidOf(m) === rootGroup);
  const rootIndex = groupOrdered.indexOf(root);
  const nextRootIndex = groupOrdered.findIndex((m, idx) => idx > rootIndex && isStructuredOS(textOf(m)));
  const hardEnd = nextRootIndex >= 0 ? nextRootIndex : groupOrdered.length;

  const direct = groupOrdered.filter(m => {
    if (m === root) return false;
    const c = ctxOf(m);
    return (c?.stanzaId && c.stanzaId === rootId) ||
      (quotedText(c) && normalize(quotedText(c)) === normalize(textOf(root)));
  });

  const adjacent = [];
  for (let i = rootIndex + 1; i < Math.min(hardEnd, rootIndex + 1 + maxAdjacent); i++) {
    const m = groupOrdered[i];
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

  let classification = "sem_evidencia";
  let confidence = "baixa";
  if (doneScore > pendingScore && doneScore >= 2) {
    classification = "possivelmente_realizada";
    confidence = doneScore >= 4 && pendingScore === 0 ? "alta" : "media";
  } else if (pendingScore > doneScore && pendingScore >= 2) {
    classification = "possivelmente_pendente";
    confidence = pendingScore >= 4 && doneScore === 0 ? "alta" : "media";
  } else if (doneScore && pendingScore) {
    classification = "revisao_manual";
    confidence = "media";
  }

  return {
    classification,
    confidence,
    scores: { done: doneScore, pending: pendingScore },
    evidence: evidence.sort((a,b) => a.timestamp - b.timestamp)
  };
}

export function analyzeSpreadsheetReferences(messages, references, {
  days = 30,
  maxAdjacent = 8,
  maxAdjacentMinutes = 20
} = {}) {
  const ordered = [...messages].sort((a,b) => tsOf(a) - tsOf(b));
  const roots = ordered.filter(m => isStructuredOS(textOf(m)));
  const items = [];

  for (const reference of references || []) {
    const best = findBestRoot(reference, roots);

    if (!best) {
      items.push({
        reference: safeReference(reference),
        classification: "nao_localizada",
        confidence: "baixa",
        match: null,
        evidence: []
      });
      continue;
    }

    const root = best.root;
    const context = analyzeMatchedRoot(ordered, root, { maxAdjacent, maxAdjacentMinutes });
    const details = extractDetails(root);

    items.push({
      reference: safeReference(reference),
      osMessageId: idOf(root),
      groupName: groupNameOf(root),
      groupJid: groupJidOf(root),
      sender: senderOf(root),
      date: tsOf(root),
      ...details,
      originalText: textOf(root),
      match: {
        score: best.score,
        matchedFields: best.matchedFields
      },
      ...context
    });
  }

  const summary = items.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {});

  const matched = items.filter(item => item.classification !== "nao_localizada").length;

  return {
    days,
    generatedAt: new Date().toISOString(),
    totalMessages: messages.length,
    totalStructuredOS: roots.length,
    totalSpreadsheetOS: references?.length || 0,
    totalMatched: matched,
    totalUnmatched: (references?.length || 0) - matched,
    summary,
    items
  };
}

export function findPossiblyClosed(messages, {
  days = 30,
  references = [],
  maxAdjacent = 8,
  maxAdjacentMinutes = 20
} = {}) {
  const analysis = analyzeSpreadsheetReferences(messages, references, {
    days,
    maxAdjacent,
    maxAdjacentMinutes
  });
  const items = analysis.items
    .filter(item => item.classification === "possivelmente_realizada")
    .sort((a,b) => (b.date || 0) - (a.date || 0));

  return {
    ...analysis,
    totalPossiblyClosed: items.length,
    items
  };
}
