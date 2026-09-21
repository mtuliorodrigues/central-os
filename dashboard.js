import { localApiFetch } from "/local-api.js";

const count = document.getElementById("planilhaCount");
const state = document.getElementById("planilhaState");

async function loadSpreadsheetStatus() {
  try {
    const data = await localApiFetch("/api/planilha/status");
    if (data?.imported) {
      count.textContent = Number(data.totalOS || 0).toLocaleString("pt-BR");
      state.textContent = `${data.fileName} • referência ativa`;
    } else {
      count.textContent = "0";
      state.textContent = "Importe uma planilha para iniciar o fluxo";
    }
  } catch {
    count.textContent = "—";
    state.textContent = "Motor local indisponível";
  }
}

loadSpreadsheetStatus();
