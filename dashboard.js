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
      flowMeta.textContent = "Planilha carregada";
    } else {
      count.textContent = "0";
      state.textContent = "Importe uma planilha para iniciar";
      flowState.textContent = "Aguardando";
      flowMeta.textContent = "Nenhuma planilha importada";
    }
  } catch {
    count.textContent = "—";
    state.textContent = "Conexão indisponível";
    flowState.textContent = "Indisponível";
    flowMeta.textContent = "Abra a Central OS neste computador e tente novamente";
  }
}

loadSpreadsheetStatus();
