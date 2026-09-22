export function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR");
}

export function formatDate(value?: string | number | null, fallback = "—") {
  if (!value) return fallback;
  let date: Date;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    date = new Date(n < 10_000_000_000 ? n * 1000 : n);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatBytes(bytes?: number | null) {
  const n = Number(bytes || 0);
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeTime(value?: string | number | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatDate(value);
  const delta = d.getTime() - Date.now();
  const abs = Math.abs(delta);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60_000) return "agora";
  if (abs < 3_600_000) return rtf.format(Math.round(delta / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(delta / 3_600_000), "hour");
  return rtf.format(Math.round(delta / 86_400_000), "day");
}

export const classificationLabel: Record<string, string> = {
  possivelmente_realizada: "Possivelmente fechada",
  possivelmente_pendente: "Pendente",
  revisao_manual: "Em análise",
  sem_evidencia: "Sem evidência de fechamento",
  nao_localizada: "Não localizada"
};

export function labelClassification(value?: string | null) {
  return classificationLabel[String(value || "")] || value || "—";
}
