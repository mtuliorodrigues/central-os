import { localApiFetch } from "/local-api.js";

const el = id => document.getElementById(id);
const daysEl = el("days");
const resultsEl = el("results");
const statusEl = el("agentStatus");

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const maskCpfForDisplay = value => String(value ?? "")
  .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**")
  .replace(/\b\d{11}\b/g, "***.***.***-**");

const displayText = value => escapeHtml(maskCpfForDisplay(value));

const formatDate = ts => {
  if (!ts) return "Data não identificada";
  const date = typeof ts === "number" || /^\d+$/.test(String(ts))
    ? new Date(Number(ts) * 1000)
    : new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

function evidenceHtml(ev) {
  return [
    '<div class="evidence-item">',
      '<div class="evidence-meta">',
        '<span class="relation">' + escapeHtml(ev.relation) + '</span>',
        '<span>' + escapeHtml(ev.sender) + '</span>',
        '<time>' + formatDate(ev.timestamp) + '</time>',
      '</div>',
      '<p class="evidence-reason">' + escapeHtml(ev.reason) + '</p>',
      ev.signal ? '<p class="signal">Sinal detectado: “' + escapeHtml(ev.signal) + '”</p>' : '',
      '<blockquote>' + displayText(ev.text) + '</blockquote>',
    '</div>'
  ].join("");
}

function itemHtml(item, index) {
  const ref = item.reference || {};
  const idLabel = item.osNumber
    ? "OS " + escapeHtml(item.osNumber)
    : item.contractId
      ? "ID/Contrato " + escapeHtml(item.contractId)
      : escapeHtml(item.osIdentification || ref.osNumber || ref.contractId || "—");

  const matchedFields = item.match?.matchedFields?.length
    ? item.match.matchedFields.join(", ")
    : "correspondência textual";

  return [
    '<article class="os-card">',
      '<div class="os-card__head"><div>',
        '<span class="candidate-number">PLANILHA • LINHA ' + escapeHtml(ref.rowNumber || "—") + '</span>',
        '<h3>' + escapeHtml(item.client || ref.client || "Cliente não identificado") + '</h3>',
        '<div class="meta-line">',
          '<span>' + idLabel + '</span>',
          '<span>' + formatDate(item.date) + '</span>',
          '<span class="confidence ' + escapeHtml(item.confidence) + '">Confiança ' + escapeHtml(item.confidence) + '</span>',
          '<span>Match: ' + escapeHtml(matchedFields) + '</span>',
        '</div>',
      '</div></div>',

      '<div class="detail-grid">',
        '<div><label>Cliente</label><p>' + escapeHtml(item.client || ref.client || "—") + '</p></div>',
        '<div><label>Identificação</label><p>' + idLabel + '</p></div>',
        '<div><label>Login</label><p>' + escapeHtml(item.login || ref.login || "—") + '</p></div>',
        '<div><label>Serviço</label><p>' + escapeHtml(item.service || ref.service || "—") + '</p></div>',
      '</div>',

      '<div class="description-box">',
        '<label>Descrição da OS</label>',
        '<p>' + displayText(item.description || ref.description || "Descrição não identificada.") + '</p>',
      '</div>',

      '<details class="original-message">',
        '<summary>Ver mensagem localizada no WhatsApp</summary>',
        '<pre>' + displayText(item.originalText) + '</pre>',
      '</details>',

      '<div class="evidence-section">',
        '<h4>Evidências que indicam possível conclusão</h4>',
        '<p class="score-line">Pontuação de conclusão: <b>' + (item.scores?.done ?? 0) + '</b> • Pendência: <b>' + (item.scores?.pending ?? 0) + '</b></p>',
        '<div class="evidence-list">',
          (item.evidence || []).map(evidenceHtml).join("") || '<div class="empty-state">Sem evidências detalhadas.</div>',
        '</div>',
      '</div>',
    '</article>'
  ].join("");
}

function render(data) {
  el("periodValue").textContent = data.days + " dias";
  el("spreadsheetCount").textContent = Number(data.totalSpreadsheetOS || 0).toLocaleString("pt-BR");
  el("matchedCount").textContent = Number(data.totalMatched || 0).toLocaleString("pt-BR");
  el("matchedMeta").textContent = Number(data.totalMessages || 0).toLocaleString("pt-BR") + " mensagens verificadas";
  el("closedCount").textContent = Number(data.totalPossiblyClosed || 0).toLocaleString("pt-BR");
  el("closedHeroText").textContent = (data.import?.fileName || "Planilha importada") + " definiu " + Number(data.totalSpreadsheetOS || 0).toLocaleString("pt-BR") + " OS de referência. A busca foi feita no TÉC.PLAY.";

  statusEl.textContent = "Motor local conectado";
  statusEl.className = "status-badge online-state";

  if (!data.items?.length) {
    resultsEl.innerHTML = '<div class="empty-state">Nenhuma OS da planilha apresentou evidência suficiente de conclusão neste período.</div>';
    return;
  }

  resultsEl.innerHTML = data.items.map(itemHtml).join("");
}

function showSpreadsheetRequired() {
  el("spreadsheetCount").textContent = "0";
  el("matchedCount").textContent = "0";
  el("closedCount").textContent = "0";
  statusEl.textContent = "Planilha obrigatória";
  statusEl.className = "status-badge loading";
  resultsEl.innerHTML = '<div class="empty-state"><b>Importe a planilha antes da análise.</b><p>A planilha é a referência principal das OS que serão procuradas no grupo.</p><a class="primary-button" href="/importar-planilha">Importar Planilha</a></div>';
}

async function load() {
  const days = Number(daysEl.value);
  statusEl.textContent = "Analisando OS da planilha…";
  statusEl.className = "status-badge loading";
  resultsEl.innerHTML = '<div class="empty-state">Localizando as OS da planilha no TÉC.PLAY e relacionando evidências…</div>';

  try {
    const data = await localApiFetch("/api/possivelmente-fechadas?days=" + days);
    render(data);
  } catch (error) {
    if (error?.code === "spreadsheet_required") {
      showSpreadsheetRequired();
      return;
    }
    statusEl.textContent = "Motor local indisponível";
    statusEl.className = "status-badge offline";
    resultsEl.innerHTML = '<div class="empty-state error-state"><b>Não foi possível acessar o motor local.</b><p>No computador que possui a Evolution API, abra a pasta Central OS e execute <code>npm run web</code>. Depois atualize esta página.</p></div>';
  }
}

el("refresh").addEventListener("click", load);
daysEl.addEventListener("change", load);
load();
