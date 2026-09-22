import type {
  AnalysisResponse,
  GroupInfo,
  HealthResponse,
  HistoryEntry,
  ImportSummary,
  RelatorioConfig,
  RelatorioStatus,
  SpreadsheetInfo,
  SummaryResponse
} from "./types";

const API_ROOT = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { error: text }; }
  }
  if (!response.ok) {
    throw new ApiError(payload?.error || `Falha HTTP ${response.status}`, response.status, payload?.code);
  }
  return payload as T;
}

export const api = {
  summary: () => request<SummaryResponse>("/api/resumo"),
  importStatus: () => request<ImportSummary>("/api/planilha/status"),
  importSpreadsheet: (fileName: string, dataBase64: string) =>
    request<ImportSummary & { ok?: boolean; message?: string }>("/api/planilha/importar", {
      method: "POST",
      body: JSON.stringify({ fileName, dataBase64 })
    }),
  processAnalysis: () => request<AnalysisResponse>("/api/analise/processar", { method: "POST" }),
  analysis: (days: 20 | 30 = 30) => request<AnalysisResponse>(`/api/analise?days=${days}`),
  possiblyClosed: (days: 20 | 30 = 30) => request<AnalysisResponse & { totalPossiblyClosed?: number }>(`/api/possivelmente-fechadas?days=${days}`),
  groups: () => request<{ groups: GroupInfo[] }>("/api/grupos"),
  history: () => request<{ history: HistoryEntry[] }>("/api/historico"),
  historyDetails: (id: string) => request<AnalysisResponse>(`/api/historico/${encodeURIComponent(id)}`),
  reportConfig: () => request<RelatorioConfig>("/api/relatorio/config"),
  reportStatus: () => request<RelatorioStatus>("/api/relatorio/status"),
  reportLogs: () => request<{ logs: string[] | string }>("/api/relatorio/logs"),
  spreadsheets: () => request<{ planilhas: SpreadsheetInfo[] }>("/api/relatorio/planilhas"),
  executeReport: (fileName: string) => request<any>("/api/relatorio/executar", {
    method: "POST",
    body: JSON.stringify({ fileName })
  }),
  health: () => request<HealthResponse>("/api/health")
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.readAsDataURL(file);
  });
}
