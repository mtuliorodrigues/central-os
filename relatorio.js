import { localApiFetch } from "/local-api.js";

const q = id => document.getElementById(id);
const daysEl = q("reportDays");

const n = value => Number(value || 0).toLocaleString("pt-BR");
const formatDate = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

function setSpreadsheet(data) {
  q("sidebarSpreadsheet").textContent = data?.import?.fileName || "Planilha importada";
  q("spreadsheetInfo").innerHTML =
    '<div class="status-row"><div><strong>Arquivo</strong><small>' + (data?.import?.fileName || "—") + '</small></div></div>' +
    '<div class="status-row"><div><strong>OS de referência</strong><small>Linhas válidas reconhecidas</small></div><span class="status-value">' + n(data.totalSpreadsheetOS) + '</span></div>' +
    '<div class="status-row"><div><strong>Importada em</strong><small>' + formatDate(data?.import?.importedAt) + '</small></div></div>' +
    '<div class="status-row"><div><strong>Grupo</strong><small>' + (data.groupName || "TÉC.PLAY") + '</small></div></div>';
}

function render(data) {
  const summary = data.summary || {};
  q("statSpreadsheet").textContent = n(data.totalSpreadsheetOS);
  q("statMatched").textContent = n(data.totalMatched);
  q("statDone").textContent = n(summary.possivelmente_realizada);
  q("statPending").textContent = n(summary.possivelmente_pendente);
  q("statReview").textContent = n(summary.revisao_manual);
  q("statMissing").textContent = n(data.totalUnmatched);

  q("reportBadge").textContent = "Análise concluída";
  q("reportBadge").className = "panel__badge";
  q("analysisStatus").textContent = n(data.totalMatched) + " localizadas";
  q("analysisStatus").className = "panel__badge";
  q("reportSubtitle").textContent = n(data.totalSpreadsheetOS) + " OS da planilha foram comparadas com " + n(data.totalMessages) + " mensagens do TÉC.PLAY nos últimos " + data.days + " dias.";

  setSpreadsheet(data);

  const rows = [
    ["Possivelmente realizada", summary.possivelmente_realizada, "Há indícios de execução ou conclusão no contexto relacionado."],
    ["Possivelmente pendente", summary.possivelmente_pendente, "Há mensagens indicando que o atendimento ainda exige ação."],
    ["Revisão manual", summary.revisao_manual, "Há sinais conflitantes ou insuficientes para concluir."],
    ["Sem evidência", summary.sem_evidencia, "A OS foi localizada, mas o contexto não sustentou uma conclusão."],
    ["Não localizada", summary.nao_localizada, "Nenhuma mensagem correspondente foi encontrada com segurança no período."]
  ];

  q("reportTableBody").innerHTML = rows.map(([label, value, detail]) =>
    "<tr><td>" + label + "</td><td>" + n(value) + "</td><td>" + detail + "</td></tr>"
  ).join("");
}

function showSpreadsheetRequired() {
  q("reportBadge").textContent = "Planilha obrigatória";
  q("reportBadge").className = "panel__badge warning";
  q("analysisStatus").textContent = "Aguardando planilha";
  q("analysisStatus").className = "panel__badge warning";
  q("spreadsheetInfo").innerHTML = '<div class="empty-state"><b>Importe a planilha primeiro.</b><p>Ela define quais OS entram neste relatório.</p><a class="primary-button" href="/importar-planilha">Importar Planilha</a></div>';
  q("reportTableBody").innerHTML = '<tr><td colspan="3">A análise começa depois da importação da planilha.</td></tr>';
}

async function load() {
  q("reportBadge").textContent = "Analisando";
  q("reportBadge").className = "panel__badge warning";
  q("analysisStatus").textContent = "Processando";
  const days = Number(daysEl.value);

  try {
    const data = await localApiFetch("/api/analise?days=" + days);
    render(data);
  } catch (error) {
    if (error?.code === "spreadsheet_required") {
      showSpreadsheetRequired();
      return;
    }
    q("reportBadge").textContent = "Motor local offline";
    q("reportBadge").className = "panel__badge danger";
    q("analysisStatus").textContent = "Indisponível";
    q("analysisStatus").className = "panel__badge danger";
    q("reportTableBody").innerHTML = '<tr><td colspan="3">Não foi possível acessar o motor local. Execute <code>npm run web</code> no computador da Central OS.</td></tr>';
  }
}

q("reportRefresh").addEventListener("click", load);
daysEl.addEventListener("change", load);
load();
