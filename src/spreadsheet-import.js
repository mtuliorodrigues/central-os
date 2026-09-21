import ExcelJS from "exceljs";

const FIELD_ALIASES = {
  client: [
    "cliente","nome cliente","nome do cliente","nome/razao social","nome razao social",
    "razao social","assinante","nome"
  ],
  cpf: ["cpf","cnpj","cpf/cnpj","cpf cnpj","documento"],
  osNumber: [
    "os","o.s","numero os","número os","n os","nº os","ordem de servico",
    "ordem de serviço","numero da os","número da os"
  ],
  contractId: [
    "id","cliente id","id cliente","contrato","id contrato","contrato id",
    "numero contrato","número contrato"
  ],
  login: ["login","usuario","usuário","pppoe","login pppoe"],
  service: ["servico","serviço","plano","tipo servico","tipo serviço","produto"],
  description: [
    "descricao","descrição","atendimento","ocorrencia","ocorrência",
    "motivo","detalhes","observacao","observação"
  ],
  date: [
    "data","data criacao","data criação","data abertura","abertura","criado em",
    "data os","data da os","created at"
  ]
};

const NORMALIZED_ALIAS = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, values]) => [
    field,
    new Set(values.map(normalizeHeader))
  ])
);

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[._/\\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.richText)) return value.richText.map(x => x.text || "").join("");
    if (value.result != null) return String(value.result);
    if (value.hyperlink && value.text) return String(value.text);
  }
  return String(value).trim();
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) count++;
  }
  return count;
}

function detectCsvDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 8);
  const candidates = [";", "\t", ","];
  let best = { delimiter: ";", score: -1 };

  for (const delimiter of candidates) {
    const counts = lines.map(line => countDelimiter(line, delimiter)).filter(count => count > 0);
    if (!counts.length) continue;
    const common = counts.reduce((acc, value) => acc + value, 0) / counts.length;
    const consistency = counts.length / Math.max(lines.length, 1);
    const score = common * consistency;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some(v => String(v).trim() !== "")) rows.push(row);
  return rows;
}

function detectHeaderRow(grid) {
  let best = { index: 0, score: -1, recognized: 0 };
  const max = Math.min(grid.length, 15);

  for (let i = 0; i < max; i++) {
    const headers = (grid[i] || []).map(normalizeHeader);
    let recognized = 0;
    for (const header of headers) {
      if (!header) continue;
      if (Object.values(NORMALIZED_ALIAS).some(set => set.has(header))) recognized++;
    }
    const nonEmpty = headers.filter(Boolean).length;
    const score = recognized * 10 + Math.min(nonEmpty, 8);
    if (score > best.score) best = { index: i, score, recognized };
  }
  return best;
}

function mapFields(headers) {
  const result = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    for (const [field, aliases] of Object.entries(NORMALIZED_ALIAS)) {
      if (result[field] == null && aliases.has(normalized)) {
        result[field] = index;
        break;
      }
    }
  });
  return result;
}

function cleanDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const raw = String(value).trim();
  if (!raw) return "";
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
    const date = new Date(year, Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function normalizeRows(grid, headerIndex) {
  const headers = (grid[headerIndex] || []).map(textValue);
  const fieldMap = mapFields(headers);
  const references = [];

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const raw = Object.fromEntries(headers.map((h, idx) => [h || `coluna_${idx + 1}`, textValue(row[idx])]));

    const ref = {
      rowNumber: i + 1,
      client: fieldMap.client != null ? textValue(row[fieldMap.client]) : "",
      cpf: fieldMap.cpf != null ? textValue(row[fieldMap.cpf]) : "",
      osNumber: fieldMap.osNumber != null ? textValue(row[fieldMap.osNumber]) : "",
      contractId: fieldMap.contractId != null ? textValue(row[fieldMap.contractId]) : "",
      login: fieldMap.login != null ? textValue(row[fieldMap.login]) : "",
      service: fieldMap.service != null ? textValue(row[fieldMap.service]) : "",
      description: fieldMap.description != null ? textValue(row[fieldMap.description]) : "",
      date: fieldMap.date != null ? cleanDate(row[fieldMap.date]) : "",
      raw
    };

    const useful = [ref.client, ref.osNumber, ref.contractId, ref.login, ref.description].some(Boolean);
    if (useful) references.push(ref);
  }

  return { headers, fieldMap, references };
}

async function xlsxToGrid(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find(ws => ws.actualRowCount > 0) || workbook.worksheets[0];
  if (!sheet) throw new Error("A planilha não possui nenhuma aba com dados.");

  const grid = [];
  const maxColumns = Math.max(sheet.actualColumnCount || 0, 1);
  for (let r = 1; r <= sheet.actualRowCount; r++) {
    const row = [];
    const excelRow = sheet.getRow(r);
    for (let c = 1; c <= maxColumns; c++) row.push(excelRow.getCell(c).value);
    grid.push(row);
  }
  return { grid, sheetName: sheet.name };
}

export async function parseSpreadsheetBuffer(buffer, fileName = "planilha.xlsx") {
  const ext = String(fileName).toLowerCase().split(".").pop();
  let grid;
  let sheetName = "Dados";

  if (ext === "csv" || ext === "txt") {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    grid = parseCsv(text);
    sheetName = "CSV";
  } else if (ext === "xlsx") {
    ({ grid, sheetName } = await xlsxToGrid(buffer));
  } else {
    throw new Error("Formato não suportado. Use .xlsx ou .csv.");
  }

  if (!grid?.length) throw new Error("A planilha está vazia.");
  const header = detectHeaderRow(grid);
  if (header.recognized === 0) {
    throw new Error("Não foi possível reconhecer as colunas da planilha. Inclua cabeçalhos como Cliente, ID, Login, Serviço ou Descrição.");
  }

  const normalized = normalizeRows(grid, header.index);
  if (!normalized.references.length) {
    throw new Error("Nenhuma ordem de serviço válida foi encontrada na planilha.");
  }

  return {
    fileName,
    sheetName,
    headerRow: header.index + 1,
    headers: normalized.headers,
    fieldMap: Object.fromEntries(
      Object.entries(normalized.fieldMap).map(([field, index]) => [field, normalized.headers[index] || null])
    ),
    importedAt: new Date().toISOString(),
    references: normalized.references
  };
}

export function maskCpfForDisplay(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return "***.***.***-**";
}

export function publicImportSummary(data, { preview = 8 } = {}) {
  if (!data) return { imported: false };
  return {
    imported: true,
    fileName: data.fileName,
    sheetName: data.sheetName,
    headerRow: data.headerRow,
    importedAt: data.importedAt,
    totalOS: data.references?.length || 0,
    headers: data.headers || [],
    fieldMap: data.fieldMap || {},
    preview: (data.references || []).slice(0, preview).map(ref => ({
      rowNumber: ref.rowNumber,
      client: ref.client,
      cpf: maskCpfForDisplay(ref.cpf),
      osNumber: ref.osNumber,
      contractId: ref.contractId,
      login: ref.login,
      service: ref.service,
      description: ref.description,
      date: ref.date
    }))
  };
}
