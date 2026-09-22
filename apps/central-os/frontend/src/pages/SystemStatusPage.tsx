import { ArrowLeft, CheckCircle2, CircleAlert, Database, FileSpreadsheet, MessageCircle, Radio, ServerCog, Send, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useHealth, useReportStatus } from "../hooks/useQueries";
import { formatDate } from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { LoadingState } from "../components/ui/Feedback";

function StatusCard({ icon: Icon, name, ok, state, detail }: { icon: any; name: string; ok?: boolean; state: string; detail?: string | null }) {
  return <Card tone={ok ? "green" : "amber"} className="system-status-card"><div className={`status-card-icon ${ok ? "ok" : "warn"}`}><Icon /></div><div><span>{name}</span><strong>{state}</strong><small>{detail || "—"}</small></div><span className={`status-light ${ok ? "ok" : "warn"}`} /></Card>;
}

export function SystemStatusPage() {
  const navigate = useNavigate();
  const health = useHealth(15_000);
  const status = useReportStatus(15_000);
  const r = status.data;
  const allGood = Boolean(r?.ready && health.data?.ok);

  return <div className="status-screen"><div className="status-screen-glow" />
    <header className="status-screen-header"><div><div className="status-logo"><span>▶</span><strong>Central <em>OS</em></strong></div><p>Status do Sistema</p></div><Button onClick={() => navigate(-1)} icon={<ArrowLeft className="h-4 w-4" />}>Voltar ao aplicativo</Button></header>
    <main className="status-screen-main">
      <div className="status-title-block"><div className={`status-title-icon ${allGood ? "ok" : "warn"}`}>{allGood ? <ShieldCheck /> : <CircleAlert />}</div><div><p className="eyebrow">MONITORAMENTO EM TEMPO REAL</p><h1>Status do Sistema</h1><p>Acompanhe o funcionamento dos serviços que sustentam a Central OS.</p></div><div className="status-checked"><span>Atualizado em</span><strong>{formatDate(r?.checkedAt || health.data?.checkedAt)}</strong></div></div>
      {status.isLoading ? <LoadingState label="Consultando serviços…" /> : <div className="system-status-grid">
        <StatusCard icon={ServerCog} name="Aplicação" ok={health.data?.ok} state={health.data?.ok ? "Online" : "Atenção"} detail={health.data?.service || "central-os-integrada"} />
        <StatusCard icon={Database} name="PostgreSQL" ok={r?.postgres?.ok} state={r?.postgres?.ok ? "Online" : "Atenção"} detail={r?.postgres?.detail} />
        <StatusCard icon={Radio} name="Evolution API" ok={r?.evolution?.ok} state={r?.evolution?.ok ? "Online" : "Atenção"} detail={r?.evolution?.detail} />
        <StatusCard icon={MessageCircle} name="WhatsApp" ok={r?.whatsapp?.connected} state={r?.whatsapp?.connected ? "Conectado" : "Desconectado"} detail={r?.whatsapp?.instance ? `${r.whatsapp.instance} • ${r.whatsapp.state || "—"}` : r?.whatsapp?.detail} />
        <StatusCard icon={Send} name="Listener" ok={r?.listener?.running && r?.listener?.count === 1} state={r?.listener?.running ? "Ativo" : "Inativo"} detail={r?.listener?.detail} />
        <StatusCard icon={FileSpreadsheet} name="Motor Relatório OS" ok={!r?.reportExecution?.locked} state={r?.reportExecution?.locked ? "Ocupado" : "Livre"} detail={r?.reportExecution?.locked ? `Processando ${r.reportExecution.fileName || "relatório"}` : "Pronto para processar"} />
      </div>}
      <Card tone={allGood ? "green" : "amber"} className="status-overview"><span className={allGood ? "ok" : "warn"}>{allGood ? <CheckCircle2 /> : <CircleAlert />}</span><div><strong>{allGood ? "Todos os serviços essenciais estão operacionais." : "Há pelo menos um serviço que merece atenção."}</strong><p>{r?.config?.configured ? `Origem: ${r.config.origem?.name || r.config.origem?.id || "—"} • Destino: ${r.config.destino?.name || r.config.destino?.id || "—"}` : "A configuração de grupos do Relatório OS ainda não está completa."}</p></div><Badge tone={allGood ? "success" : "warning"}>{r?.ready ? "Pronto" : "Verificar"}</Badge></Card>
    </main>
  </div>;
}
