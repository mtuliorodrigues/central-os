const DONE = [
  /\bfeito\b/i, /\bfeito hoje\b/i, /\bconclu[ií]d[oa]\b/i, /\bfinalizad[oa]\b/i,
  /\bresolvid[oa]\b/i, /\bnormalizad[oa]\b/i, /\bfoi feito\b/i, /\bfoi realizado\b/i,
  /\brealizad[oa]\b/i, /\btrocad[oa]\b/i, /\binstalad[oa]\b/i, /\bcliente ok\b/i
];
const PENDING = [
  /\bpendente\b/i, /\bn[aã]o foi feito\b/i, /\bn[aã]o realizado\b/i,
  /\breagendar\b/i, /\bsem acesso\b/i, /\bn[aã]o atendeu\b/i, /\baguardando\b/i
];

function textOf(m) {
  const x = m?.message ?? m;
  return x?.conversation || x?.extendedTextMessage?.text || x?.imageMessage?.caption ||
    x?.documentMessage?.caption || x?.videoMessage?.caption || m?.text || "";
}
function ctxOf(m) {
  const x = m?.message ?? m;
  return x?.extendedTextMessage?.contextInfo || x?.imageMessage?.contextInfo ||
    x?.documentMessage?.contextInfo || x?.videoMessage?.contextInfo || {};
}
function idOf(m) { return m?.key?.id || m?.id || ""; }
function tsOf(m) { return Number(m?.messageTimestamp || m?.timestamp || 0); }
function senderOf(m) { return m?.pushName || m?.key?.participant || m?.participant || ""; }
function quotedText(ctx) {
  const q = ctx?.quotedMessage || {};
  return q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption ||
    q.documentMessage?.caption || "";
}
function looksLikeOS(text) {
  return /(?:\bOS\b|ordem de servi[cç]o|\*Cliente:\*|\bCliente:\s|\*Servi[cç]o:\*)/i.test(text);
}
function relation(m) {
  const c = ctxOf(m);
  if (c?.stanzaId || c?.quotedMessage) return "resposta";
  if (c?.isForwarded || Number(c?.forwardingScore || 0) > 0) return "encaminhada";
  if (Array.isArray(c?.mentionedJid) && c.mentionedJid.length) return "marcada";
  return null;
}
function evidence(m, reason, type = relation(m) || "contexto") {
  return { messageId: idOf(m), timestamp: tsOf(m), sender: senderOf(m), type, text: textOf(m), reason };
}

export function analyzeHistory(messages, { before = 3, after = 8 } = {}) {
  const ordered = [...messages].sort((a,b) => tsOf(a) - tsOf(b));
  const osIndexes = ordered.map((m,i) => looksLikeOS(textOf(m)) ? i : -1).filter(i => i >= 0);

  return osIndexes.map(i => {
    const root = ordered[i];
    const rootText = textOf(root);
    const rootId = idOf(root);
    const window = ordered.slice(Math.max(0, i-before), Math.min(ordered.length, i+after+1));
    const linked = window.filter(m => {
      if (m === root) return false;
      const c = ctxOf(m);
      return c?.stanzaId === rootId || quotedText(c) === rootText || relation(m) || true;
    });

    const ev = [evidence(root, "Mensagem identificada como possível OS.", relation(root) || "os")];
    let done = 0, pending = 0;
    for (const m of linked) {
      const t = textOf(m);
      if (!t) continue;
      const d = DONE.some(r => r.test(t));
      const p = PENDING.some(r => r.test(t));
      const rel = relation(m);
      if (d) { done += 2; ev.push(evidence(m, "Indício textual de serviço realizado.", rel || "contexto")); }
      else if (p) { pending += 2; ev.push(evidence(m, "Indício textual de pendência.", rel || "contexto")); }
      else if (rel) ev.push(evidence(m, `Mensagem relacionada à OS por ${rel}.`, rel));
    }

    let classification = "sem_evidencia";
    let confidence = "baixa";
    if (done > pending && done >= 2) { classification = "possivelmente_realizada"; confidence = done >= 4 ? "alta" : "media"; }
    else if (pending > done && pending >= 2) { classification = "possivelmente_pendente"; confidence = pending >= 4 ? "alta" : "media"; }
    else if (done && pending) { classification = "revisao_manual"; confidence = "media"; }

    return {
      osMessageId: rootId,
      osText: rootText,
      osTimestamp: tsOf(root),
      classification,
      confidence,
      evidence: ev
    };
  });
}
