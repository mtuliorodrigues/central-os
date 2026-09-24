import type {
  AnalysisResponse,
  GroupInfo,
  GroupsResponse,
  HealthResponse,
  HistoryEntry,
  ImportSummary,
  RelatorioConfig,
  RelatorioStatus,
  SpreadsheetInfo,
  SummaryResponse
} from "./types";
import { targetAddressSpaceFor } from "./network";

export type AppMode = "integrated" | "local-runtime";

const configuredMode = String(import.meta.env.VITE_APP_MODE || "integrated").toLowerCase();
export const APP_MODE: AppMode = configuredMode === "local-runtime" ? "local-runtime" : "integrated";
const configuredApiRoot = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const API_ROOT = configuredApiRoot || (APP_MODE === "local-runtime" ? "http://127.0.0.1:8788" : "");

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

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) { unauthorizedHandler = handler; }

type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: "local";
};

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("central_os_session_token");
  const targetAddressSpace = APP_MODE === "local-runtime" ? targetAddressSpaceFor(`${API_ROOT}${path}`) : undefined;
  const requestInit: LocalNetworkRequestInit = {
    cache: "no-store",
    ...(targetAddressSpace ? { targetAddressSpace } : {}),
    ...init,
    signal: init.signal || AbortSignal.timeout(15_000),
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  };
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, requestInit);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "Backend local indisponível.", 0, "backend_unavailable");
  }
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { error: text }; }
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/auth/login")) unauthorizedHandler?.();
    throw new ApiError(payload?.error || `Falha HTTP ${response.status}`, response.status, payload?.code);
  }
  return payload as T;
}

export const api = {
  login: (username: string, password: string) => request<{ token: string; expiresAt: string; user: import("./types").AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<{ user: import("./types").AuthUser; expiresAt: string }>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateProfile: (payload: { name: string; avatar?: string }) => request<{ user: import("./types").AuthUser }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: boolean; revokedCurrent: boolean }>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  adminUsers: () => request<import("./types").AdminUsersResponse>("/api/admin/users"),
  adminCreateUser: (payload: { name: string; username: string; password: string; avatar?: string }) => request<{ user: import("./types").AuthUser }>("/api/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateUser: (id: string, payload: { name: string; avatar?: string }) => request<{ user: import("./types").AuthUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminSetUserActive: (id: string, active: boolean) => request<{ user: import("./types").AuthUser }>(`/api/admin/users/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
  adminResetPassword: (id: string, password: string) => request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  summary: () => request<SummaryResponse>("/api/resumo"),
  importStatus: () => request<ImportSummary>("/api/planilha/status"),
  importSpreadsheet: (fileName: string, dataBase64: string) =>
    request<ImportSummary & { ok?: boolean; message?: string }>("/api/planilha/importar", {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ fileName, dataBase64 })
    }),
  processAnalysis: () => request<AnalysisResponse>("/api/analise/processar", { method: "POST", signal: AbortSignal.timeout(120_000) }),
  analysis: (days: 20 | 30 = 30) => request<AnalysisResponse>(`/api/analise?days=${days}`),
  possiblyClosed: (days: 20 | 30 = 30) => request<AnalysisResponse & { totalPossiblyClosed?: number }>(`/api/possivelmente-fechadas?days=${days}`),
  groups: () => request<GroupsResponse>("/api/grupos", { signal: AbortSignal.timeout(130_000) }),
  saveGroups: (origemJid: string, destinoJid: string) => request<{ ok: boolean; origem: GroupInfo; destino: GroupInfo }>("/api/grupos/config", {
    method: "POST",
    body: JSON.stringify({ origemJid, destinoJid })
  }),
  history: () => request<{ history: HistoryEntry[] }>("/api/historico"),
  historyDetails: (id: string) => request<AnalysisResponse>(`/api/historico/${encodeURIComponent(id)}`),
  reportConfig: () => request<RelatorioConfig>("/api/relatorio/config"),
  reportStatus: () => request<RelatorioStatus>("/api/relatorio/status"),
  reportLogs: () => request<{ logs: string[] | string }>("/api/relatorio/logs"),
  spreadsheets: () => request<{ planilhas: SpreadsheetInfo[] }>("/api/relatorio/planilhas"),
  executeReport: (fileName: string) => request<any>("/api/relatorio/executar", {
    method: "POST",
    signal: AbortSignal.timeout(30 * 60 * 1000),
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
