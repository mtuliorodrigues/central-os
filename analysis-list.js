import { localApiFetch } from "/local-api.js";

const view = document.body.dataset.view || "analisadas";
const daysEl = document.getElementById("days");
const searchEl = document.getElementById("tableSearch");
const bodyEl = document.getElementById("analysisBody");
const countEl = document.getElementById("resultCount");
const statusEl = document.getElementById("pageStatus");
const tableWrap = document.querySelector(".analysis-table-wrap");
const PAGE_SIZE = 12;

let sourceItems = [];
let filteredItems = [];
let currentPage = 1;

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const maskSensitive = value => String(value ?? "")
  .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**")
  .replace(/\b\d{11}\b/g, "***.***.***-**");

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value === "number" || /^\d+$/.test(String(value))
    ? new Date(Number(value) * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusLabel(value) {
  return {
    possivelmente_realizada: "Possivelmente fechada",
    possivelmente_pendente: "Pendente",
    revisao_manual: "Em análise",
    sem_evidencia: "Sem evidência de fechamento",
    nao_localizada: "Não localizada"
  }[value] || value || "—";
}

function statusClass(value) {
  return {
    possivelmente_realizada: "success",
    possivelmente_pendente: "warning",
    revisao_manual: "info",
    sem_evidencia: "neutral",
    nao_localizada: "danger"
  }[value] || "neutral";
}

function selectItems(items) {
  if (view === "localizadas") return items.filter(item => item.classification !== "nao_localizada");
  if (view === "nao-localizadas") return items.filter(item => item.classification === "nao_localizada");
  if (view === "pendentes") return items.filter(item =>
    item.classification !== "nao_localizada" &&
    item.classification !== "possivelmente_realizada"
  );
  return items;
}

function evidenceCell(item) {
  if (item.classification === "nao_localizada") return '<span class="muted">Nenhuma mensagem correspondente encontrada.</span>';

  const evidence = item.evidence || [];
  const pieces = [];
  if (item.originalText) {
    pieces.push(
      '<div class="evidence-preview"><strong>Mensagem localizada' +
      (item.groupName ? " • " + escapeHtml(item.groupName) : "") +
      '</strong><p>' + escapeHtml(maskSensitive(item.originalText)) + '</p></div>'
    );
  }
  evidence.forEach(ev => {
    pieces.push(
      '<div class="evidence-preview"><strong>' +
      escapeHtml(ev.relation || "Evidência") +
      (ev.groupName ? " • " + escapeHtml(ev.groupName) : "") +
      '</strong><p>' + escapeHtml(maskSensitive(ev.text || "")) + '</p></div>'
    );
  });

  if (!pieces.length) return '<span class="muted">Sem evidência de fechamento.</span>';
  return '<details class="table-details"><summary>' +
    (evidence.length ? evidence.length + " evidência(s)" : "Ver mensagem") +
    '</summary><div class="table-details__content">' + pieces.join("") + '</div></details>';
}

function rowHtml(item) {
  const ref = item.reference || {};
  const identification = item.osNumber || item.contractId || ref.osNumber || ref.contractId || "—";
  const client = item.client || ref.client || "—";
  const login = item.login || ref.login || "—";
  const service = item.service || ref.service || "—";
  const date = ref.date || item.date;
  const group = item.groupName || "—";

  return '<tr>' +
    '<td><strong>' + escapeHtml(client) + '</strong></td>' +
    '<td>' + escapeHtml(identification) + '</td>' +
    '<td>' + escapeHtml(login) + '</td>' +
    '<td>' + escapeHtml(service) + '</td>' +
    '<td>' + escapeHtml(formatDate(date)) + '</td>' +
    '<td><span class="status-pill ' + statusClass(item.classification) + '">' + escapeHtml(statusLabel(item.classification)) + '</span></td>' +
    '<td>' + escapeHtml(group) + '</td>' +
    '<td class="evidence-column">' + evidenceCell(item) + '</td>' +
  '</tr>';
}

function ensurePagination() {
  let pagination = document.getElementById("analysisPagination");
  if (pagination) return pagination;

  pagination = document.createElement("div");
  pagination.id = "analysisPagination";
  pagination.className = "pagination";
  tableWrap?.insertAdjacentElement("afterend", pagination);
  return pagination;
}

function renderPagination() {
  const pagination = ensurePagination();
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  if (totalPages <= 1) {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }

  pagination.hidden = false;
  const buttons = [];
  buttons.push(`<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Anterior</button>`);

  const visible = new Set([1, totalPages, currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2]
    .filter(page => page >= 1 && page <= totalPages));
  let previous = 0;
  [...visible].sort((a,b) => a-b).forEach(page => {
    if (previous && page - previous > 1) buttons.push('<span class="pagination__ellipsis">…</span>');
    buttons.push(`<button type="button" data-page="${page}" class="${page === currentPage ? "active" : ""}">${page}</button>`);
    previous = page;
  });

  buttons.push(`<button type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Próxima</button>`);
  pagination.innerHTML = buttons.join("");
}

function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);
  countEl.textContent = filteredItems.length.toLocaleString("pt-BR") + " OS";
  bodyEl.innerHTML = pageItems.length
    ? pageItems.map(rowHtml).join("")
    : '<tr><td colspan="8"><div class="empty-state">Nenhuma OS encontrada com esse filtro.</div></td></tr>';
  renderPagination();
  tableWrap?.scrollTo({ top: 0, behavior: "smooth" });
}

function applyFilter(resetPage = true) {
  const query = String(searchEl?.value || "").trim().toLowerCase();
  filteredItems = query ? sourceItems.filter(item => {
    const ref = item.reference || {};
    const haystack = [
      item.client, ref.client, item.osNumber, item.contractId, ref.osNumber, ref.contractId,
      item.login, ref.login, item.service, ref.service, item.groupName, statusLabel(item.classification)
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }) : [...sourceItems];

  if (resetPage) currentPage = 1;
  renderPage();
}

ensurePagination().addEventListener("click", event => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page || 1);
  renderPage();
});

function loadingRows() {
  return Array.from({ length: 8 }, () =>
    '<tr class="skeleton-row">' +
      '<td><span class="skeleton-block w-70"></span></td>' +
      '<td><span class="skeleton-block w-50"></span></td>' +
      '<td><span class="skeleton-block w-55"></span></td>' +
      '<td><span class="skeleton-block w-80"></span></td>' +
      '<td><span class="skeleton-block w-60"></span></td>' +
      '<td><span class="skeleton-pill"></span></td>' +
      '<td><span class="skeleton-block w-70"></span></td>' +
      '<td><span class="skeleton-block w-90"></span></td>' +
    '</tr>'
  ).join("");
}

async function getAnalysis(days, force = false) {
  const shared = window.CentralOS?.data;
  const cached = !force ? shared?.peekAnalysis?.(days) : null;
  if (cached) return { data: cached, cached: true };
  if (shared?.getAnalysis) return { data: await shared.getAnalysis(days, { force }), cached: false };
  return { data: await localApiFetch("/api/analise?days=" + days), cached: false };
}

async function load(force = false) {
  const days = Number(daysEl?.value || 30);
  const immediate = !force ? window.CentralOS?.data?.peekAnalysis?.(days) : null;

  statusEl.textContent = immediate ? "Atualizado" : "Atualizando";
  statusEl.className = immediate ? "panel__badge" : "panel__badge warning";
  if (!immediate) bodyEl.innerHTML = loadingRows();

  try {
    const { data } = await getAnalysis(days, force);
    sourceItems = selectItems(data.items || []);
    statusEl.textContent = "Atualizado";
    statusEl.className = "panel__badge";
    const subtitle = document.getElementById("analysisSubtitle");
    if (subtitle) subtitle.textContent = Number(data.totalSpreadsheetOS || 0).toLocaleString("pt-BR") +
      " OS da planilha • " + Number(data.totalMatched || 0).toLocaleString("pt-BR") + " localizadas";
    applyFilter(true);
  } catch (error) {
    sourceItems = [];
    filteredItems = [];
    if (error?.code === "spreadsheet_required") {
      statusEl.textContent = "Planilha necessária";
      bodyEl.innerHTML = '<tr><td colspan="8"><div class="empty-state"><b>Importe uma planilha para continuar.</b><p>Ela define quais ordens de serviço serão analisadas.</p><button class="primary-button" data-import-planilha type="button">Importar Planilha</button></div></td></tr>';
      ensurePagination().hidden = true;
      return;
    }
    statusEl.textContent = "Indisponível";
    statusEl.className = "panel__badge danger";
    bodyEl.innerHTML = '<tr><td colspan="8"><div class="empty-state error-state">Não foi possível atualizar a análise agora.</div></td></tr>';
    ensurePagination().hidden = true;
  }
}

document.getElementById("refresh")?.addEventListener("click", () => load(true));
daysEl?.addEventListener("change", () => load(false));
searchEl?.addEventListener("input", () => applyFilter(true));
load();
