import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export const queryKeys = {
  summary: ["summary"] as const,
  reportStatus: ["report-status"] as const,
  reportConfig: ["report-config"] as const,
  spreadsheets: ["spreadsheets"] as const,
  history: ["history"] as const,
  groups: ["groups"] as const,
  health: ["health"] as const,
  analysis: (days: number, view: string) => ["analysis", days, view] as const
};

export function useSummary() {
  return useQuery({ queryKey: queryKeys.summary, queryFn: api.summary, staleTime: 10_000, retry: 1 });
}

export function useReportStatus(refetchInterval = 30_000) {
  return useQuery({
    queryKey: queryKeys.reportStatus,
    queryFn: api.reportStatus,
    staleTime: 8_000,
    retry: 1,
    refetchInterval
  });
}

export function useReportConfig() {
  return useQuery({ queryKey: queryKeys.reportConfig, queryFn: api.reportConfig, staleTime: 20_000, retry: 1 });
}

export function useSpreadsheets() {
  return useQuery({ queryKey: queryKeys.spreadsheets, queryFn: api.spreadsheets, staleTime: 10_000, retry: 1 });
}

export function useHistory() {
  return useQuery({ queryKey: queryKeys.history, queryFn: api.history, staleTime: 10_000, retry: 1 });
}

export function useGroups() {
  return useQuery({ queryKey: queryKeys.groups, queryFn: api.groups, staleTime: 30_000, retry: 1 });
}

export function useHealth(refetchInterval = 30_000) {
  return useQuery({ queryKey: queryKeys.health, queryFn: api.health, staleTime: 8_000, retry: 1, refetchInterval });
}
