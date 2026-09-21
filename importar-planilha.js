import { localApiFetch } from "/local-api.js";

const fileInput = document.getElementById("spreadsheetFile");
const importButton = document.getElementById("importButton");
const selectedFile = document.getElementById("selectedFile");
const importStatus = document.getElementById("importStatus");
const dropzone = document.getElementById("dropzone");
const engineBadge = document.getElementById("engineBadge");

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function renderCurrent(data) {
  const imported = Boolean(data?.imported);
  document.getElementById("currentBadge").textContent = imported ? "Pronta" : "Não importada";
  document.getElementById("currentBadge").className = imported ? "panel__badge" : "panel__badge warning";
  document.getElementById("currentFile").textContent = imported ? data.fileName : "Nenhuma planilha ativa";
  document.getElementById("currentCount").textContent = imported ? Number(data.totalOS || 0).toLocaleString("pt-BR") : "0";
  document.getElementById("currentDate").textContent = imported ? formatDate(data.importedAt) : "—";

  if (imported && data.preview?.length) renderResult(data);
}

function renderResult(data) {
  document.getElementById("importResult").hidden = false;
  document.getElementById("resultBadge").textContent = `${Number(data.totalOS || 0).toLocaleString("pt-BR")} OS`;

  const labels = {
    client: "Cliente",
    cpf: "CPF/CNPJ",
    osNumber: "Número da OS",
    contractId: "ID / Contrato",
    login: "Login",
    service: "Serviço",
    description: "Descrição",
    date: "Data"
  };
  const detected = Object.entries(data.fieldMap || {}).filter(([, value]) => value);
  document.getElementById("mapping").innerHTML = detected.length
    ? detected.map(([field, header]) => `<div class="mapping-item"><span>${escapeHtml(labels[field] || field)}</span><strong>${escapeHtml(header)}</strong></div>`).join("")
    : '<div class="empty-state">Nenhuma coluna reconhecida.</div>';

  document.getElementById("previewBody").innerHTML = (data.preview || []).map(row => {
    const identification = row.osNumber || row.contractId || "—";
    return `<tr>
      <td>${escapeHtml(row.rowNumber)}</td>
      <td>${escapeHtml(row.client || "—")}</td>
      <td>${escapeHtml(row.cpf || "—")}</td>
      <td>${escapeHtml(identification)}</td>
      <td>${escapeHtml(row.login || "—")}</td>
      <td>${escapeHtml(row.service || "—")}</td>
    </tr>`;
  }).join("");
}

async function loadStatus() {
  try {
    const data = await localApiFetch("/api/planilha/status");
    engineBadge.textContent = "Motor local conectado";
    engineBadge.className = "panel__badge";
    renderCurrent(data);
  } catch {
    engineBadge.textContent = "Motor local indisponível";
    engineBadge.className = "panel__badge danger";
    document.getElementById("currentBadge").textContent = "Offline";
    document.getElementById("currentBadge").className = "panel__badge danger";
  }
}

function selectFile(file) {
  if (!file) return;
  const ext = file.name.toLowerCase().split(".").pop();
  if (!["xlsx", "csv"].includes(ext)) {
    importStatus.textContent = "Formato inválido. Selecione um arquivo .xlsx ou .csv.";
    importStatus.className = "inline-status is-error";
    fileInput.value = "";
    importButton.disabled = true;
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    importStatus.textContent = "O arquivo ultrapassa o limite de 15 MB.";
    importStatus.className = "inline-status is-error";
    fileInput.value = "";
    importButton.disabled = true;
    return;
  }

  selectedFile.hidden = false;
  selectedFile.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${(file.size / 1024).toFixed(1)} KB</span>`;
  importButton.disabled = false;
  importStatus.textContent = "Arquivo pronto para importação.";
  importStatus.className = "inline-status";
}

fileInput.addEventListener("change", () => selectFile(fileInput.files?.[0]));

["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
}));
dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  selectFile(file);
});

importButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  importButton.disabled = true;
  importButton.textContent = "Importando…";
  importStatus.textContent = "Lendo a planilha e identificando as OS…";
  importStatus.className = "inline-status is-loading";

  try {
    const dataBase64 = await fileToBase64(file);
    const data = await localApiFetch("/api/planilha/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, dataBase64 })
    });

    importStatus.textContent = `Planilha importada com sucesso. ${data.totalOS} OS agora são a referência principal da Central OS.`;
    importStatus.className = "inline-status is-success";
    renderCurrent(data);
  } catch (error) {
    importStatus.textContent = error?.message || "Falha ao importar a planilha.";
    importStatus.className = "inline-status is-error";
  } finally {
    importButton.disabled = false;
    importButton.textContent = "Importar e usar como referência";
  }
});

loadStatus();
