import { localApiFetch } from "/local-api.js";

const body = document.getElementById("historyBody");
const badge = document.getElementById("historyCount");
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

async function load() {
  try {
    const data = await localApiFetch("/api/historico");
    const history = data.history || [];
    badge.textContent = history.length + " registro(s)";
    body.innerHTML = history.length ? history.map(item => '<tr>' +
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
  } catch {
    badge.textContent = "Indisponível";
    badge.className = "panel__badge danger";
    body.innerHTML = '<tr><td colspan="10"><div class="empty-state error-state">Não foi possível carregar o histórico.</div></td></tr>';
  }
}

load();
