import { localApiFetch } from "/local-api.js";

const view = document.body.dataset.view || "analisadas";
const daysEl = document.getElementById("days");
const searchEl = document.getElementById("tableSearch");
const bodyEl = document.getElementById("analysisBody");
const countEl = document.getElementById("resultCount");
const statusEl = document.getElementById("pageStatus");
let sourceItems = [];

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
      '<div class="evidence-preview"><strong>Mensagem localizada</strong><p>' +
      escapeHtml(maskSensitive(item.originalText)) + '</p></div>'
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

function applyFilter() {
  const query = String(searchEl?.value || "").trim().toLowerCase();
  const items = query ? sourceItems.filter(item => {
    const ref = item.reference || {};
    const haystack = [
      item.client, ref.client, item.osNumber, item.contractId, ref.osNumber, ref.contractId,
      item.login, ref.login, item.service, ref.service, item.groupName, statusLabel(item.classification)
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  }) : sourceItems;

  countEl.textContent = items.length.toLocaleString("pt-BR") + " OS";
  bodyEl.innerHTML = items.length
    ? items.map(rowHtml).join("")
    : '<tr><td colspan="8"><div class="empty-state">Nenhuma OS encontrada com esse filtro.</div></td></tr>';
}

async function load() {
  const days = Number(daysEl?.value || 30);
  statusEl.textContent = "Atualizando";
  statusEl.className = "panel__badge warning";
  bodyEl.innerHTML = '<tr><td colspan="8"><div class="empty-state">Carregando ordens de serviço…</div></td></tr>';

  try {
    const data = await localApiFetch("/api/analise?days=" + days);
    sourceItems = selectItems(data.items || []);
    statusEl.textContent = "Atualizado";
    statusEl.className = "panel__badge";
    const subtitle = document.getElementById("analysisSubtitle");
    if (subtitle) subtitle.textContent = Number(data.totalSpreadsheetOS || 0).toLocaleString("pt-BR") +
      " OS da planilha • " + Number(data.totalMatched || 0).toLocaleString("pt-BR") + " localizadas";
    applyFilter();
  } catch (error) {
    sourceItems = [];
    if (error?.code === "spreadsheet_required") {
      statusEl.textContent = "Planilha necessária";
      bodyEl.innerHTML = '<tr><td colspan="8"><div class="empty-state"><b>Importe uma planilha para continuar.</b><p>Ela define quais ordens de serviço serão analisadas.</p><a class="primary-button" href="/importar-planilha">Importar Planilha</a></div></td></tr>';
      return;
    }
    statusEl.textContent = "Indisponível";
    statusEl.className = "panel__badge danger";
    bodyEl.innerHTML = '<tr><td colspan="8"><div class="empty-state error-state">Não foi possível atualizar a análise agora.</div></td></tr>';
  }
}

document.getElementById("refresh")?.addEventListener("click", load);
daysEl?.addEventListener("change", load);
searchEl?.addEventListener("input", applyFilter);
load();
