import { localApiFetch } from "/local-api.js";

const count = document.getElementById("planilhaCount");
const state = document.getElementById("planilhaState");
const flowState = document.getElementById("flowState");
const flowMeta = document.getElementById("flowMeta");

async function loadSpreadsheetStatus() {
  try {
    const data = await localApiFetch("/api/planilha/status");
    if (data?.imported) {
      count.textContent = Number(data.totalOS || 0).toLocaleString("pt-BR");
      state.textContent = data.fileName + " • referência ativa";
      flowState.textContent = "Pronto";
      flowMeta.textContent = "Planilha carregada; análise liberada";
    } else {
      count.textContent = "0";
      state.textContent = "Importe uma planilha para iniciar o fluxo";
      flowState.textContent = "Aguardando";
      flowMeta.textContent = "Etapa 01 ainda não concluída";
    }
  } catch {
    count.textContent = "—";
    state.textContent = "Motor local indisponível";
    flowState.textContent = "Offline";
    flowMeta.textContent = "Execute npm run web no computador operacional";
  }
}

loadSpreadsheetStatus();
