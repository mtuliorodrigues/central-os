import { CheckCircle2, Clock3, FileSpreadsheet, MapPin, XCircle } from "lucide-react";
import { useSummary } from "../hooks/useQueries";
import { AnalysisTable, type AnalysisView } from "../components/analysis/AnalysisTable";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/dashboard/StatCard";

const meta: Record<AnalysisView, { eyebrow: string; title: string; description: string }> = {
  all: { eyebrow: "ANÁLISE COMPLETA", title: "OS Analisadas", description: "Todas as ordens de serviço da planilha processadas na análise atual." },
  located: { eyebrow: "MENSAGENS ENCONTRADAS", title: "Localizadas nos Grupos", description: "Ordens da planilha que possuem correspondência nas conversas consultadas." },
  unmatched: { eyebrow: "SEM CORRESPONDÊNCIA", title: "Não Localizadas", description: "Ordens procuradas que não tiveram mensagem correspondente encontrada." },
  closed: { eyebrow: "CONFERÊNCIA", title: "Possivelmente Fechadas", description: "Ordens com mensagens que indicam execução ou conclusão." },
  pending: { eyebrow: "ACOMPANHAMENTO", title: "Pendentes / Em análise", description: "Ordens localizadas que ainda não apresentam evidência suficiente de fechamento." }
};

export function AnalysisPage({ view }: { view: AnalysisView }) {
  const summary = useSummary();
  const c = summary.data?.counts || {};
  const m = meta[view];
  return (
    <div className="page-stack">
      <PageHeader eyebrow={m.eyebrow} title={m.title} description={m.description} />
      <div className="analysis-summary-grid">
        <StatCard label="OS na planilha" value={c.imported || c.analyzed} detail="Referência da análise atual" icon={FileSpreadsheet} tone="blue" />
        <StatCard label="Localizadas nos grupos" value={c.located} detail="Com correspondência encontrada" icon={MapPin} tone="green" />
        {view === "unmatched" ? <StatCard label="Não localizadas" value={c.notLocated} detail="Sem mensagem correspondente" icon={XCircle} tone="red" /> : view === "closed" ? <StatCard label="Possivelmente fechadas" value={c.possiblyClosed} detail="Aguardando conferência" icon={CheckCircle2} tone="green" /> : view === "pending" ? <StatCard label="Pendentes" value={c.pending} detail="Sem evidência suficiente" icon={Clock3} tone="amber" /> : null}
      </div>
      <Card tone={view === "unmatched" ? "red" : view === "closed" ? "green" : view === "pending" ? "amber" : "cyan"} className="sheet-card">
        <AnalysisTable view={view} />
      </Card>
    </div>
  );
}
