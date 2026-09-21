import { localApiFetch } from "/local-api.js";

const body = document.getElementById("historyBody");
const badge = document.getElementById("historyCount");
const tableWrap = document.querySelector(".analysis-table-wrap");
const modal = document.getElementById("historyDetailModal");
const modalTitle = document.getElementById("historyModalTitle");
const modalSubtitle = document.getElementById("historyModalSubtitle");
const modalBody = document.getElementById("historyModalBody");

const PAGE_SIZE = 10;
const DETAIL_PAGE_SIZE = 12;

let historyItems = [];
let currentPage = 1;
let detailItems = [];
let filteredDetailItems = [];
let detailPage = 1;

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

function n(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function statusLabel(value) {
  return {
    possivelmente_realizada: "Possivelmente fechada",
    possivelmente_pendente: "Pendente",
    revisao_manual: "Em análise",
    sem_evidencia: "Sem evidência",
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
      if (parts[parts.length - 1] !== '<span class="pagination__ellipsis">…</span>') {
        parts.push('<span class="pagination__ellipsis">…</span>');
      }
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
  body.innerHTML = pageItems.length ? pageItems.map(item => '<tr class="history-row" data-history-id="' + escapeHtml(item.id) + '">' +
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
    '<td><button class="history-detail-button" type="button" data-history-id="' + escapeHtml(item.id) + '">Ver detalhes</button></td>' +
  '</tr>').join("") :
    '<tr><td colspan="11"><div class="empty-state">Nenhuma análise anterior registrada.</div></td></tr>';

  renderPagination();
}

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
      '<td><span class="skeleton-pill"></span></td>' +
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

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("history-modal-open");
  detailItems = [];
  filteredDetailItems = [];
  detailPage = 1;
}

function evidenceHtml(item) {
  const parts = [];
  if (item.originalText) {
    parts.push(
      '<div class="history-evidence"><strong>Mensagem localizada' +
      (item.sender ? " • " + escapeHtml(item.sender) : "") +
      (item.groupName ? " • " + escapeHtml(item.groupName) : "") +
      '</strong><p>' + escapeHtml(maskSensitive(item.originalText)) + '</p></div>'
    );
  }

  (item.evidence || []).forEach(ev => {
    parts.push(
      '<div class="history-evidence"><strong>' +
      escapeHtml(ev.relation || "Evidência") +
      (ev.sender ? " • " + escapeHtml(ev.sender) : "") +
      (ev.groupName ? " • " + escapeHtml(ev.groupName) : "") +
      '</strong><p>' + escapeHtml(maskSensitive(ev.text || "")) + '</p></div>'
    );
  });

  return parts.length
    ? '<details class="table-details"><summary>Ver mensagens</summary><div class="table-details__content">' + parts.join("") + '</div></details>'
    : '<span class="muted">Sem evidência registrada.</span>';
}

function renderDetailTable() {
  const tableBody = document.getElementById("historyDetailBody");
  const pageLabel = document.getElementById("historyDetailPageLabel");
  const prev = document.getElementById("historyDetailPrev");
  const next = document.getElementById("historyDetailNext");
  if (!tableBody) return;

  const totalPages = Math.max(1, Math.ceil(filteredDetailItems.length / DETAIL_PAGE_SIZE));
  detailPage = Math.min(Math.max(detailPage, 1), totalPages);
  const start = (detailPage - 1) * DETAIL_PAGE_SIZE;
  const pageItems = filteredDetailItems.slice(start, start + DETAIL_PAGE_SIZE);

  tableBody.innerHTML = pageItems.length ? pageItems.map(item => {
    const ref = item.reference || {};
    const identification = item.osNumber || item.contractId || ref.osNumber || ref.contractId || "—";
    return '<tr>' +
      '<td><strong>' + escapeHtml(item.client || ref.client || "—") + '</strong></td>' +
      '<td>' + escapeHtml(identification) + '</td>' +
      '<td>' + escapeHtml(item.login || ref.login || "—") + '</td>' +
      '<td>' + escapeHtml(item.sender || "—") + '</td>' +
      '<td>' + escapeHtml(formatDate(ref.date || item.date)) + '</td>' +
      '<td><span class="status-pill ' + statusClass(item.classification) + '">' + escapeHtml(statusLabel(item.classification)) + '</span></td>' +
      '<td>' + escapeHtml(item.groupName || "—") + '</td>' +
      '<td class="evidence-column">' + evidenceHtml(item) + '</td>' +
    '</tr>';
  }).join("") : '<tr><td colspan="8"><div class="empty-state">Nenhuma OS encontrada neste filtro.</div></td></tr>';

  pageLabel.textContent = filteredDetailItems.length
    ? "Página " + detailPage + " de " + totalPages + " • " + n(filteredDetailItems.length) + " OS"
    : "0 OS";
  prev.disabled = detailPage <= 1;
  next.disabled = detailPage >= totalPages;
}

function applyDetailFilters() {
  const search = String(document.getElementById("historyDetailSearch")?.value || "").trim().toLowerCase();
  const status = document.getElementById("historyDetailStatus")?.value || "all";

  filteredDetailItems = detailItems.filter(item => {
    if (status !== "all" && item.classification !== status) return false;
    if (!search) return true;

    const ref = item.reference || {};
    const haystack = [
      item.client, ref.client, item.osNumber, item.contractId, ref.osNumber, ref.contractId,
      item.login, ref.login, item.sender, item.groupName, statusLabel(item.classification)
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });

  detailPage = 1;
  renderDetailTable();
}

function renderSnapshot(snapshot) {
  const analysis = snapshot.analysis || {};
  const summary = analysis.summary || {};
  detailItems = analysis.items || [];
  filteredDetailItems = [...detailItems];
  detailPage = 1;

  modalTitle.textContent = snapshot.fileName || "Detalhes da análise";
  modalSubtitle.textContent = formatDate(snapshot.analyzedAt || analysis.generatedAt) +
    " • " + n(analysis.totalSpreadsheetOS || detailItems.length) + " OS • " +
    ((snapshot.groups || []).join(", ") || "Grupos registrados");

  modalBody.innerHTML = `
    <section class="history-modal__stats">
      <article><span>OS analisadas</span><strong>${n(analysis.totalSpreadsheetOS || detailItems.length)}</strong></article>
      <article><span>Localizadas</span><strong>${n(analysis.totalMatched)}</strong></article>
      <article><span>Não localizadas</span><strong>${n(analysis.totalUnmatched)}</strong></article>
      <article><span>Possivelmente fechadas</span><strong>${n(summary.possivelmente_realizada)}</strong></article>
      <article><span>Pendentes</span><strong>${n(Number(summary.possivelmente_pendente || 0) + Number(summary.revisao_manual || 0) + Number(summary.sem_evidencia || 0))}</strong></article>
    </section>

    <section class="history-modal__filters">
      <input id="historyDetailSearch" class="search-input" type="search" placeholder="Buscar cliente, ID, login, remetente ou grupo">
      <select id="historyDetailStatus">
        <option value="all">Todos os status</option>
        <option value="possivelmente_realizada">Possivelmente fechadas</option>
        <option value="possivelmente_pendente">Pendentes</option>
        <option value="revisao_manual">Em análise</option>
        <option value="sem_evidencia">Sem evidência</option>
        <option value="nao_localizada">Não localizadas</option>
      </select>
    </section>

    <div class="history-modal__table-wrap">
      <table class="data-table history-detail-table">
        <thead><tr><th>Cliente</th><th>OS / ID</th><th>Login</th><th>Enviado por</th><th>Data</th><th>Status</th><th>Grupo</th><th>Evidência</th></tr></thead>
        <tbody id="historyDetailBody"></tbody>
      </table>
    </div>

    <footer class="history-modal__pagination">
      <button id="historyDetailPrev" type="button" class="secondary-button">Anterior</button>
      <span id="historyDetailPageLabel"></span>
      <button id="historyDetailNext" type="button" class="secondary-button">Próxima</button>
    </footer>
  `;

  document.getElementById("historyDetailSearch")?.addEventListener("input", applyDetailFilters);
  document.getElementById("historyDetailStatus")?.addEventListener("change", applyDetailFilters);
  document.getElementById("historyDetailPrev")?.addEventListener("click", () => {
    if (detailPage > 1) {
      detailPage--;
      renderDetailTable();
    }
  });
  document.getElementById("historyDetailNext")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredDetailItems.length / DETAIL_PAGE_SIZE));
    if (detailPage < totalPages) {
      detailPage++;
      renderDetailTable();
    }
  });

  renderDetailTable();
}

async function openDetails(id) {
  if (!id) return;
  modal.hidden = false;
  document.body.classList.add("history-modal-open");
  modalTitle.textContent = "Detalhes da execução";
  modalSubtitle.textContent = "Carregando informações…";
  modalBody.innerHTML = '<div class="history-modal__loading"><span class="processing-spinner"><span></span></span><strong>Carregando análise…</strong></div>';

  try {
    const snapshot = await localApiFetch("/api/historico/" + encodeURIComponent(id));
    renderSnapshot(snapshot);
  } catch (error) {
    modalBody.innerHTML = '<div class="empty-state error-state"><b>Detalhes completos indisponíveis.</b><p>' +
      escapeHtml(error?.message || "Esta análise foi registrada antes do histórico detalhado estar disponível.") +
      '</p></div>';
  }
}

ensurePagination().addEventListener("click", event => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page || 1);
  renderPage();
  tableWrap?.scrollTo({ top: 0, behavior: "smooth" });
});

body.addEventListener("click", event => {
  const button = event.target.closest("[data-history-id]");
  if (!button) return;
  openDetails(button.dataset.historyId);
});

modal?.addEventListener("click", event => {
  if (event.target.closest("[data-history-close]")) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal?.hidden) closeModal();
});

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
    body.innerHTML = '<tr><td colspan="11"><div class="empty-state error-state">Não foi possível carregar o histórico.</div></td></tr>';
    ensurePagination().hidden = true;
  }
}

load();
