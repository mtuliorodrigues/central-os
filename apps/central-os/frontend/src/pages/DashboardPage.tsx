import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Layers3,
  MapPin,
  MessageCircle,
  Upload,
  XCircle
} from "lucide-react";
import { useHistory, useReportStatus, useSummary } from "../hooks/useQueries";
import { formatDate, relativeTime } from "../lib/format";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/dashboard/StatCard";
import { ImportDialog } from "../components/dashboard/ImportDialog";
import { ReportPanel } from "../components/dashboard/ReportPanel";
import { LoadingState } from "../components/ui/Feedback";

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(params.get("import") === "1");
  const summary = useSummary();
  const report = useReportStatus(30_000);
  const history = useHistory();
  const c = summary.data?.counts || {};

  const activity = useMemo(() => {
    const rows = (history.data?.history || []).slice(0, 4).map((item) => ({
      id: item.id || `${item.fileName}-${item.importedAt}`,
      title: item.analyzedAt ? "Análise concluída" : "Planilha importada",
      detail: `${item.fileName || "Planilha"}${item.totalOS ? ` • ${item.totalOS} OS` : ""}`,
      time: item.analyzedAt || item.importedAt,
      icon: item.analyzedAt ? CheckCircle2 : FileSpreadsheet
    }));
    if (report.data?.lastReport?.modifiedAt) rows.unshift({ id: `report-${report.data.lastReport.modifiedAt}`, title: "Relatório OS registrado", detail: report.data.lastReport.fileName || "Relatório concluído", time: report.data.lastReport.modifiedAt, icon: FileCheck2 });
    return rows.sort((a, b) => String(b.time || "").localeCompare(String(a.time || ""))).slice(0, 4);
  }, [history.data, report.data]);

  function closeImport() {
    setImportOpen(false);
    if (params.has("import")) {
      const next = new URLSearchParams(params);
      next.delete("import");
      setParams(next, { replace: true });
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="CENTRAL OS" title={<>Início</>} description="Acompanhe as ordens de serviço e os dois motores integrados em um único painel." />

      <Card tone="green" className="hero-integrated">
        <div className="hero-copy">
          <p className="eyebrow">MÓDULO INTEGRADO</p>
          <h2>Central OS + Relatório OS</h2>
          <p>{summary.data?.imported ? `Planilha ativa: ${summary.data.import?.fileName || "importada"}.` : "Importe a planilha do SGP para iniciar uma nova análise."}</p>
          <div className="hero-actions"><Button variant="primary" size="lg" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importar planilha</Button>{summary.data?.lastAnalysis ? <span>Última análise: {formatDate(summary.data.lastAnalysis)}</span> : null}</div>
        </div>
        <div className="hero-visual" aria-hidden="true"><span className="hero-ring ring-a" /><span className="hero-ring ring-b" /><div className="hero-window"><div className="hero-window-top"><i /><i /><i /></div><div className="hero-window-body"><Layers3 /><span /><span /><span /></div></div><div className="hero-orbit-card"><Database /></div><div className="hero-orbit-card second"><MessageCircle /></div></div>
        <div className="hero-status-list">
          <div><span className={report.data?.postgres?.ok ? "ok" : "warn"}><Database /></span><div><strong>PostgreSQL</strong><small>{report.data?.postgres?.ok ? "Online" : "Atenção"}</small></div></div>
          <div><span className={report.data?.evolution?.ok ? "ok" : "warn"}><Activity /></span><div><strong>Evolution</strong><small>{report.data?.evolution?.ok ? "Online" : "Atenção"}</small></div></div>
          <div><span className={report.data?.whatsapp?.connected ? "ok" : "warn"}><MessageCircle /></span><div><strong>WhatsApp</strong><small>{report.data?.whatsapp?.connected ? "Conectado" : "Desconectado"}</small></div></div>
        </div>
      </Card>

      <section>
        <div className="section-heading compact"><div><h2>Resumo das análises</h2><p>Dados reais da análise atual e do histórico registrado.</p></div></div>
        {summary.isLoading ? <LoadingState label="Carregando resumo…" /> : (
          <div className="dashboard-stats-grid">
            <StatCard label="Relatórios gerados" value={c.reportsGenerated} detail="Análises disponíveis no histórico" icon={FileSpreadsheet} tone="blue" to="/historico" />
            <StatCard label="OS analisadas" value={c.analyzed} detail="Ordens processadas na análise atual" icon={Database} tone="cyan" to="/os-analisadas" />
            <StatCard label="Localizadas" value={c.located} detail="Encontradas nos grupos consultados" icon={MapPin} tone="green" to="/localizadas" />
            <StatCard label="Não localizadas" value={c.notLocated} detail="Sem correspondência encontrada" icon={XCircle} tone="red" to="/nao-localizadas" />
            <StatCard label="Possivelmente fechadas" value={c.possiblyClosed} detail="Com indícios de conclusão" icon={CheckCircle2} tone="amber" to="/possivelmente-fechadas" />
            <StatCard label="Pendentes" value={c.pending} detail="Ainda sem evidência suficiente" icon={Clock3} tone="violet" to="/pendentes" />
          </div>
        )}
      </section>

      <div className="dashboard-lower-grid">
        <Card className="activity-panel">
          <div className="section-heading compact"><div><h2>Atividade recente</h2><p>Importações, análises e relatórios registrados.</p></div></div>
          <div className="activity-list">{activity.length ? activity.map((item) => { const Icon = item.icon; return <div className="activity-item" key={item.id}><span className="activity-icon"><Icon className="h-4 w-4" /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time title={formatDate(item.time)}>{relativeTime(item.time)}</time></div>; }) : <div className="empty-inline">Nenhuma atividade registrada ainda.</div>}</div>
        </Card>
        <ReportPanel />
      </div>

      <ImportDialog open={importOpen} onClose={closeImport} />
    </div>
  );
}
