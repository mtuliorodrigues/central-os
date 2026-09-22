import { Activity, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useReportStatus } from "../../hooks/useQueries";

export function SystemStatusButton() {
  const navigate = useNavigate();
  const status = useReportStatus(30_000);
  const ready = Boolean(status.data?.ready);
  const loading = status.isLoading;
  return (
    <button className="system-status-compact" onClick={() => navigate("/status")} title="Abrir status completo do sistema">
      <span className={`system-status-orb ${ready ? "ok" : loading ? "loading" : "warn"}`} />
      <span className="system-status-copy"><strong>{ready ? "Sistema online" : loading ? "Verificando" : "Atenção"}</strong><small>{ready ? "Serviços operacionais" : "Ver status"}</small></span>
      <Activity className="system-status-wave" />
      <ChevronRight className="system-status-chevron" />
    </button>
  );
}
