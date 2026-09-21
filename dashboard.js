import { localApiFetch } from "/local-api.js";

const ids = {
  reportsGenerated: "reportsCount",
  analyzed: "analyzedCount",
  located: "locatedCount",
  notLocated: "missingCount",
  possiblyClosed: "closedCount",
  pending: "pendingCount"
};

function setLoading(loading) {
  Object.values(ids).forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle("skeleton-number", loading);
    if (loading) element.textContent = "";
  });
}

function setCounts(counts = {}) {
  Object.entries(ids).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.remove("skeleton-number");
      element.textContent = Number(counts[key] || 0).toLocaleString("pt-BR");
    }
  });
}

async function getSummary(force = false) {
  const shared = window.CentralOS?.data;
  const cached = !force ? shared?.peekSummary?.() : null;
  if (cached) return cached;
  if (shared?.getSummary) return shared.getSummary({ force });
  return localApiFetch("/api/resumo");
}

async function loadSummary() {
  const file = document.getElementById("dashboardFile");
  const updated = document.getElementById("dashboardUpdated");
  const immediate = window.CentralOS?.data?.peekSummary?.();

  if (!immediate) setLoading(true);

  try {
    const data = immediate || await getSummary(false);
    setCounts(data.counts);

    if (!data.imported) {
      file.textContent = "Nenhuma planilha carregada";
      updated.textContent = "Importe uma planilha para iniciar.";
      return;
    }

    file.textContent = "Planilha atual: " + (data.import?.fileName || "Planilha importada");
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
