import { localApiFetch } from "/local-api.js";

const el = id => document.getElementById(id);
const daysEl = el("days");
const resultsEl = el("results");
const tableWrap = el("closedTableWrap");
const statusEl = el("agentStatus");
const pageSizeEl = el("closedPageSize");
const modal = el("closedDetailModal");
const modalTitle = el("closedModalTitle");
const modalSubtitle = el("closedModalSubtitle");
const modalBody = el("closedModalBody");
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20];
const savedPageSize = Number(localStorage.getItem("centralOSPageSize") || 10);

let pageSize = PAGE_SIZE_OPTIONS.includes(savedPageSize) ? savedPageSize : 10;
let items = [];
let currentPage = 1;

if (pageSizeEl) pageSizeEl.value = String(pageSize);

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

const confidenceLabel = value => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "alta") return "Alta";
  if (normalized === "media" || normalized === "média") return "Média";
  if (normalized === "baixa") return "Baixa";
  return value ? String(value) : "Não definida";
};

function evidenceHtml(ev) {
  return [
    '<div class="evidence-item">',
      '<div class="evidence-meta">',
        '<span class="relation">' + escapeHtml(ev.relation || "Evidência") + '</span>',
        '<span>' + escapeHtml(ev.sender || "—") + '</span>',
        ev.groupName ? '<span>' + escapeHtml(ev.groupName) + '</span>' : '',
        '<time>' + escapeHtml(formatDate(ev.timestamp)) + '</time>',
      '</div>',
      ev.reason ? '<p class="evidence-reason">' + escapeHtml(ev.reason) + '</p>' : '',
      ev.signal ? '<p class="signal">Trecho identificado: “' + escapeHtml(ev.signal) + '”</p>' : '',
      '<blockquote>' + displayText(ev.text || "") + '</blockquote>',
    '</div>'
  ].join("");
}

function rowHtml(item, absoluteIndex) {
  const ref = item.reference || {};
  const client = item.client || ref.client || "Cliente não identificado";
  const confidence = String(item.confidence || "media").toLowerCase();

  return [
    '<tr>',
      '<td><strong>' + escapeHtml(client) + '</strong></td>',
      '<td>' + escapeHtml(formatDate(item.date || ref.date)) + '</td>',
      '<td>' + escapeHtml(item.groupName || "—") + '</td>',
      '<td>' + escapeHtml(item.sender || "—") + '</td>',
      '<td><div class="closed-status-cell">',
        '<span class="status-pill success">Possivelmente fechada</span>',
        '<span class="confidence ' + escapeHtml(confidence) + '">Confiança ' + escapeHtml(confidenceLabel(item.confidence)) + '</span>',
      '</div></td>',
      '<td><button class="history-detail-button" type="button" data-closed-index="' + absoluteIndex + '">Ver detalhes</button></td>',
    '</tr>'
  ].join("");
}

function detailHtml(item) {
  const ref = item.reference || {};
  const client = item.client || ref.client || "Cliente não identificado";
  const description = item.description || ref.description || "Descrição não identificada.";
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const identification = item.osNumber || ref.osNumber || item.contractId || ref.contractId || item.osIdentification || "—";
  const service = item.service || ref.service || "—";
  const login = item.login || ref.login || "—";
  const matchedFields = Array.isArray(item.match?.matchedFields) && item.match.matchedFields.length
    ? item.match.matchedFields.join(", ")
    : "—";
  const matchScore = item.match?.score ?? "—";

  return [
    '<div class="closed-modal-detail">',
      '<div class="closed-modal-summary">',
        '<span class="status-pill success">Possivelmente fechada</span>',
        '<span class="confidence ' + escapeHtml(String(item.confidence || "media").toLowerCase()) + '">Confiança ' + escapeHtml(confidenceLabel(item.confidence)) + '</span>',
      '</div>',

      '<div class="detail-grid closed-detail-grid">',
        '<div><label>Cliente</label><p>' + escapeHtml(client) + '</p></div>',
        '<div><label>Enviado por</label><p>' + escapeHtml(item.sender || "—") + '</p></div>',
        '<div><label>Grupo</label><p>' + escapeHtml(item.groupName || "—") + '</p></div>',
        '<div><label>Data</label><p>' + escapeHtml(formatDate(item.date || ref.date)) + '</p></div>',
        '<div><label>OS / ID</label><p>' + escapeHtml(identification) + '</p></div>',
        '<div><label>Serviço</label><p>' + escapeHtml(service) + '</p></div>',
        '<div><label>Login</label><p>' + escapeHtml(login) + '</p></div>',
        '<div><label>Pontuação da correspondência</label><p>' + escapeHtml(matchScore) + '</p></div>',
        '<div><label>Campos correspondentes</label><p>' + escapeHtml(matchedFields) + '</p></div>',
        '<div><label>Classificação</label><p>Possivelmente fechada</p></div>',
      '</div>',

      '<div class="description-box">',
        '<label>Descrição da OS</label>',
        '<p>' + displayText(description) + '</p>',
      '</div>',

      '<details class="original-message" open>',
        '<summary>Mensagem relacionada</summary>',
        '<pre>' + displayText(item.originalText || "Mensagem não identificada.") + '</pre>',
      '</details>',

      '<div class="evidence-section">',
        '<h4>Evidências encontradas</h4>',
        '<div class="evidence-list">',
          evidence.map(evidenceHtml).join("") || '<div class="empty-state">Sem evidências detalhadas.</div>',
        '</div>',
      '</div>',
    '</div>'
  ].join("");
}

function openDetails(index) {
  const item = items[index];
  if (!item || !modal || !modalBody) return;

  const ref = item.reference || {};
  const client = item.client || ref.client || "Cliente não identificado";
  modalTitle.textContent = client;
  modalSubtitle.textContent = [item.groupName || "Grupo não identificado", formatDate(item.date || ref.date)].join(" • ");
  modalBody.innerHTML = detailHtml(item);
  modal.hidden = false;
  document.body.classList.add("history-modal-open");
}

function closeDetails() {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("history-modal-open");
}

function ensurePagination() {
  let pagination = document.getElementById("closedPagination");
  if (pagination) return pagination;
  pagination = document.createElement("div");
  pagination.id = "closedPagination";
  pagination.className = "pagination";
  tableWrap?.insertAdjacentElement("afterend", pagination);
  pagination.addEventListener("click", event => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page || 1);
    renderPage();
    tableWrap?.scrollTo({ top: 0, behavior: "smooth" });
  });
  return pagination;
}

function renderPagination() {
  const pagination = ensurePagination();
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  if (totalPages <= 1) {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }

  pagination.hidden = false;
  const parts = [`<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Anterior</button>`];
  const visible = new Set([1, totalPages, currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2].filter(p => p >= 1 && p <= totalPages));
  let prev = 0;

  [...visible].sort((a,b) => a-b).forEach(page => {
    if (prev && page - prev > 1) parts.push('<span class="pagination__ellipsis">…</span>');
    parts.push(`<button type="button" data-page="${page}" class="${page === currentPage ? "active" : ""}">${page}</button>`);
    prev = page;
  });

  parts.push(`<button type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Próxima</button>`);
  pagination.innerHTML = parts.join("");
}

function renderPage() {
  if (!items.length) {
    resultsEl.innerHTML = '<tr><td colspan="6"><div class="empty-state">Nenhuma OS da planilha apresentou evidência suficiente de conclusão neste período.</div></td></tr>';
    ensurePagination().hidden = true;
    return;
  }

  const start = (currentPage - 1) * pageSize;
  resultsEl.innerHTML = items.slice(start, start + pageSize)
    .map((item, index) => rowHtml(item, start + index))
    .join("");
  renderPagination();
}

function render(data) {
  el("periodValue").textContent = data.days + " dias";
  el("spreadsheetCount").textContent = Number(data.totalSpreadsheetOS || 0).toLocaleString("pt-BR");
  el("matchedCount").textContent = Number(data.totalMatched || 0).toLocaleString("pt-BR");
  el("matchedMeta").textContent = "Referências encontradas no período";
  el("closedCount").textContent = Number(data.totalPossiblyClosed || 0).toLocaleString("pt-BR");
  el("closedHeroText").textContent = Number(data.totalPossiblyClosed || 0).toLocaleString("pt-BR") + " OS com indícios de conclusão.";

  statusEl.textContent = "Atualizado";
  statusEl.className = "status-badge online-state";
  items = data.items || [];
  currentPage = 1;
  renderPage();
}

function showSpreadsheetRequired() {
  el("spreadsheetCount").textContent = "0";
  el("matchedCount").textContent = "0";
  el("closedCount").textContent = "0";
  statusEl.textContent = "Planilha necessária";
  statusEl.className = "status-badge loading";
  resultsEl.innerHTML = '<tr><td colspan="6"><div class="empty-state"><b>Nenhuma análise disponível.</b><p>Volte ao Dashboard para importar e processar uma planilha.</p><a class="primary-button" href="/">Ir ao Dashboard</a></div></td></tr>';
  ensurePagination().hidden = true;
}

function loadingRows() {
  return Array.from({ length: 6 }, () =>
    '<tr class="skeleton-row">' +
      '<td><span class="skeleton-block w-70"></span></td>' +
      '<td><span class="skeleton-block w-55"></span></td>' +
      '<td><span class="skeleton-block w-70"></span></td>' +
      '<td><span class="skeleton-block w-55"></span></td>' +
      '<td><span class="skeleton-pill"></span></td>' +
      '<td><span class="skeleton-pill"></span></td>' +
    '</tr>'
  ).join("");
}

async function getClosedData(days, force = false) {
  const shared = window.CentralOS?.data;
  const cached = !force ? shared?.peekAnalysis?.(days) : null;
  const analysis = cached || (shared?.getAnalysis
    ? await shared.getAnalysis(days, { force })
    : await localApiFetch("/api/analise?days=" + days));

  const closedItems = (analysis.items || [])
    .filter(item => item.classification === "possivelmente_realizada")
    .sort((a, b) => Number(b.date || 0) - Number(a.date || 0));

  return { ...analysis, totalPossiblyClosed: closedItems.length, items: closedItems };
}

async function load(force = false) {
  const days = Number(daysEl.value);
  const immediate = !force ? window.CentralOS?.data?.peekAnalysis?.(days) : null;

  statusEl.textContent = immediate ? "Atualizado" : "Atualizando…";
  statusEl.className = immediate ? "status-badge online-state" : "status-badge loading";
  if (!immediate) resultsEl.innerHTML = loadingRows();

  try {
    const data = await getClosedData(days, force);
    render(data);
  } catch (error) {
    items = [];
    if (error?.code === "spreadsheet_required" || error?.code === "analysis_required") {
      showSpreadsheetRequired();
      statusEl.textContent = error?.code === "analysis_required" ? "Análise necessária" : "Planilha necessária";
      return;
    }
    statusEl.textContent = "Indisponível";
    statusEl.className = "status-badge offline";
    resultsEl.innerHTML = '<tr><td colspan="6"><div class="empty-state error-state"><b>Não foi possível atualizar a análise agora.</b><p>Tente novamente em instantes.</p></div></td></tr>';
    ensurePagination().hidden = true;
  }
}

resultsEl?.addEventListener("click", event => {
  const button = event.target.closest("[data-closed-index]");
  if (!button) return;
  openDetails(Number(button.dataset.closedIndex));
});

modal?.addEventListener("click", event => {
  if (event.target.closest("[data-closed-close]")) closeDetails();
});

if (window.CentralOSClosedDetailKeyHandler) {
  document.removeEventListener("keydown", window.CentralOSClosedDetailKeyHandler);
}
window.CentralOSClosedDetailKeyHandler = event => {
  if (event.key === "Escape" && modal && !modal.hidden) closeDetails();
};
document.addEventListener("keydown", window.CentralOSClosedDetailKeyHandler);

el("refresh").addEventListener("click", () => load(true));
daysEl.addEventListener("change", () => load(false));
pageSizeEl?.addEventListener("change", () => {
  const next = Math.min(20, Math.max(5, Number(pageSizeEl.value || 10)));
  pageSize = PAGE_SIZE_OPTIONS.includes(next) ? next : 10;
  localStorage.setItem("centralOSPageSize", String(pageSize));
  currentPage = 1;
  renderPage();
});

load();
