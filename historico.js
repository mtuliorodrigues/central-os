import { localApiFetch } from "/local-api.js";

const body = document.getElementById("historyBody");
const badge = document.getElementById("historyCount");
const tableWrap = document.querySelector(".analysis-table-wrap");
const PAGE_SIZE = 10;
let historyItems = [];
let currentPage = 1;

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function n(value) { return Number(value || 0).toLocaleString("pt-BR"); }

function ensurePagination() {
  let pagination = document.getElementById("historyPagination");
  if (pagination) return pagination;
  pagination = document.createElement("div");
  pagination.id = "historyPagination";
  pagination.className = "pagination";
  tableWrap?.insertAdjacentElement("afterend", pagination);
  return pagination;
}

function renderPagination() {
  const pagination = ensurePagination();
  const totalPages = Math.max(1, Math.ceil(historyItems.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  if (totalPages <= 1) {
    pagination.hidden = true;
    pagination.innerHTML = "";
    return;
  }

  pagination.hidden = false;
  const parts = [
    `<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Anterior</button>`
  ];
  for (let page = 1; page <= totalPages; page++) {
    if (totalPages > 7 && page > 2 && page < totalPages - 1 && Math.abs(page - currentPage) > 1) {
      if (parts[parts.length - 1] !== '<span class="pagination__ellipsis">…</span>') parts.push('<span class="pagination__ellipsis">…</span>');
      continue;
    }
    parts.push(`<button type="button" data-page="${page}" class="${page === currentPage ? "active" : ""}">${page}</button>`);
  }
  parts.push(`<button type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Próxima</button>`);
  pagination.innerHTML = parts.join("");
}

function renderPage() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = historyItems.slice(start, start + PAGE_SIZE);
  badge.textContent = historyItems.length + " registro(s)";
  body.innerHTML = pageItems.length ? pageItems.map(item => '<tr>' +
    '<td><strong>' + escapeHtml(formatDate(item.importedAt)) + '</strong></td>' +
    '<td>' + escapeHtml(item.fileName || "—") + '</td>' +
    '<td>' + n(item.totalOS) + '</td>' +
    '<td>' + n(item.totalMatched) + '</td>' +
    '<td>' + n(item.totalUnmatched) + '</td>' +
    '<td>' + n(item.possiblyClosed) + '</td>' +
    '<td>' + n(item.pendingOrReview) + '</td>' +
    '<td>' + escapeHtml(item.days ? item.days + " dias" : "—") + '</td>' +
    '<td>' + escapeHtml((item.groups || []).join(", ") || "—") + '</td>' +
    '<td>' + escapeHtml(formatDate(item.analyzedAt)) + '</td>' +
  '</tr>').join("") :
  '<tr><td colspan="10"><div class="empty-state">Nenhuma análise anterior registrada.</div></td></tr>';
  renderPagination();
}

ensurePagination().addEventListener("click", event => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page || 1);
  renderPage();
  tableWrap?.scrollTo({ top: 0, behavior: "smooth" });
});

function loadingRows() {
  return Array.from({ length: 7 }, () =>
    '<tr class="skeleton-row">' +
      '<td><span class="skeleton-block w-70"></span></td>' +
      '<td><span class="skeleton-block w-80"></span></td>' +
      '<td><span class="skeleton-block w-35"></span></td>' +
      '<td><span class="skeleton-block w-35"></span></td>' +
      '<td><span class="skeleton-block w-35"></span></td>' +
      '<td><span class="skeleton-block w-35"></span></td>' +
      '<td><span class="skeleton-block w-35"></span></td>' +
      '<td><span class="skeleton-block w-45"></span></td>' +
      '<td><span class="skeleton-block w-80"></span></td>' +
      '<td><span class="skeleton-block w-70"></span></td>' +
    '</tr>'
  ).join("");
}

async function getHistory(force = false) {
  const shared = window.CentralOS?.data;
  const cached = !force ? shared?.peekHistory?.() : null;
  if (cached) return cached;
  if (shared?.getHistory) return shared.getHistory({ force });
  return localApiFetch("/api/historico");
}

async function load() {
  const immediate = window.CentralOS?.data?.peekHistory?.();
  if (!immediate) {
    body.innerHTML = loadingRows();
    badge.textContent = "Carregando";
    badge.className = "panel__badge info";
  }
  try {
    const data = immediate || await getHistory(false);
    historyItems = data.history || [];
    currentPage = 1;
    renderPage();
  } catch {
    badge.textContent = "Indisponível";
    badge.className = "panel__badge danger";
    body.innerHTML = '<tr><td colspan="10"><div class="empty-state error-state">Não foi possível carregar o histórico.</div></td></tr>';
    ensurePagination().hidden = true;
  }
}

load();
