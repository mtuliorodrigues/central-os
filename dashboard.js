import { localApiFetch } from "/local-api.js";

const ids = {
  imported: "importedCount",
  analyzed: "analyzedCount",
  located: "locatedCount",
  notLocated: "missingCount",
  possiblyClosed: "closedCount",
  pending: "pendingCount"
};

function setCounts(counts = {}) {
  Object.entries(ids).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = Number(counts[key] || 0).toLocaleString("pt-BR");
  });
}

async function loadSummary() {
  const file = document.getElementById("dashboardFile");
  const updated = document.getElementById("dashboardUpdated");

  try {
    const data = await localApiFetch("/api/resumo");
    setCounts(data.counts);

    if (!data.imported) {
      file.textContent = "Nenhuma planilha carregada";
      updated.textContent = "Importe uma planilha para iniciar.";
      return;
    }

    file.textContent = data.import?.fileName || "Planilha importada";
    updated.textContent = data.lastAnalysis
      ? "Última análise: " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.lastAnalysis))
      : "Planilha pronta para análise.";
  } catch {
    setCounts({});
    file.textContent = "Resumo indisponível";
    updated.textContent = "Tente novamente em instantes.";
  }
}

loadSummary();
