import { localApiFetch } from "/local-api.js";

const page = document.body.dataset.page || "dashboard";
if (page !== "importar") {
  const actions = document.querySelector(".topbar__actions");
  if (actions && !actions.querySelector("[data-import-planilha]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button global-import-button";
    button.dataset.importPlanilha = "";
    button.textContent = "Importar planilha";
    actions.appendChild(button);
  }
}

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
fileInput.hidden = true;
fileInput.id = "globalSpreadsheetFile";
document.body.appendChild(fileInput);

const modal = document.createElement("div");
modal.className = "processing-modal";
modal.hidden = true;
modal.innerHTML = `
  <div class="processing-modal__backdrop"></div>
  <section class="processing-modal__card" role="dialog" aria-modal="true" aria-labelledby="processingTitle">
    <div class="processing-spinner" aria-hidden="true"><span></span></div>
    <span class="panel__kicker">Central OS</span>
    <h2 id="processingTitle">Processando planilha</h2>
    <p id="processingFile" class="processing-modal__file"></p>
    <div class="processing-steps" id="processingSteps">
      <div data-step="0"><span>01</span><strong>Carregando planilha...</strong></div>
      <div data-step="1"><span>02</span><strong>Lendo ordens de serviço...</strong></div>
      <div data-step="2"><span>03</span><strong>Procurando informações nos grupos...</strong></div>
      <div data-step="3"><span>04</span><strong>Analisando contexto...</strong></div>
      <div data-step="4"><span>05</span><strong>Gerando relatório...</strong></div>
      <div data-step="5"><span>06</span><strong>Finalizando...</strong></div>
    </div>
    <div class="processing-progress"><span id="processingProgress"></span></div>
    <p class="processing-modal__status" id="processingStatus">Preparando...</p>
    <button type="button" class="secondary-button processing-close" id="processingClose" hidden>Fechar</button>
  </section>
`;
document.body.appendChild(modal);

const status = modal.querySelector("#processingStatus");
const progress = modal.querySelector("#processingProgress");
const fileName = modal.querySelector("#processingFile");
const closeButton = modal.querySelector("#processingClose");
const stepEls = [...modal.querySelectorAll("[data-step]")];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function setStep(index, message) {
  stepEls.forEach((element, current) => {
    element.classList.toggle("is-active", current === index);
    element.classList.toggle("is-done", current < index);
  });
  progress.style.width = Math.max(5, ((index + 1) / stepEls.length) * 100) + "%";
  status.textContent = message || stepEls[index]?.querySelector("strong")?.textContent || "Processando...";
}

function openModal(file) {
  fileName.textContent = file?.name || "";
  closeButton.hidden = true;
  modal.hidden = false;
  document.body.classList.add("processing-open");
  setStep(0, "Carregando planilha...");
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove("processing-open");
}

function validateFile(file) {
  const ext = file?.name?.toLowerCase().split(".").pop();
  if (!file || !["xlsx", "csv"].includes(ext)) throw new Error("Selecione uma planilha .xlsx ou .csv.");
  if (file.size > 15 * 1024 * 1024) throw new Error("A planilha ultrapassa o limite de 15 MB.");
}

async function processFile(file) {
  openModal(file);

  try {
    validateFile(file);
    const dataBase64 = await fileToBase64(file);

    setStep(1, "Lendo ordens de serviço...");
    const imported = await localApiFetch("/api/planilha/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, dataBase64 })
    });

    setStep(2, "Procurando informações nos grupos...");
    let analysisDone = false;
    const analysisPromise = localApiFetch("/api/analise/processar", { method: "POST" }).finally(() => { analysisDone = true; });

    await new Promise(resolve => setTimeout(resolve, 450));
    if (!analysisDone) setStep(3, "Analisando contexto...");
    await new Promise(resolve => setTimeout(resolve, 550));
    if (!analysisDone) setStep(4, "Gerando relatório...");

    const analysis = await analysisPromise;
    setStep(5, "Finalizando...");
    status.textContent = `${Number(analysis.totalSpreadsheetOS || imported.totalOS || 0).toLocaleString("pt-BR")} OS processadas. Atualizando a Central OS...`;

    await new Promise(resolve => setTimeout(resolve, 650));
    closeModal();
    window.location.reload();
  } catch (error) {
    stepEls.forEach(element => element.classList.remove("is-active"));
    status.textContent = error?.message || "Não foi possível concluir o processamento.";
    status.classList.add("is-error");
    closeButton.hidden = false;
  } finally {
    fileInput.value = "";
  }
}

document.addEventListener("click", event => {
  const trigger = event.target.closest("[data-import-planilha]");
  if (!trigger) return;
  event.preventDefault();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) processFile(file);
});

closeButton.addEventListener("click", () => {
  status.classList.remove("is-error");
  closeModal();
});
