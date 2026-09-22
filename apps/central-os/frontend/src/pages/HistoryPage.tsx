import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
import type { HistoryEntry } from "../lib/types";
import { useHistory } from "../hooks/useQueries";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";

export function HistoryPage() {
  const history = useHistory();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const details = useQuery({ queryKey: ["history-details", selected?.id], queryFn: () => api.historyDetails(selected!.id!), enabled: Boolean(selected?.id), retry: false });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (history.data?.history || []).filter((item) => !q || [item.fileName, ...(item.groups || [])].join(" ").toLowerCase().includes(q));
  }, [history.data, search]);

  return <div className="page-stack"><PageHeader eyebrow="ANÁLISES ANTERIORES" title="Histórico" description="Importações e resultados registrados ao longo do uso da Central OS." />
    <Card tone="cyan" className="history-hero"><div><span className="history-hero-icon"><History /></span><div><p className="eyebrow">CONTROLE E RASTREABILIDADE</p><h2>Análises e importações em um só lugar</h2><p>Consulte o que já foi processado sem alterar o histórico operacional atual.</p></div></div><Badge tone="info">{rows.length} registro(s)</Badge></Card>
    <Card className="sheet-card"><div className="sheet-toolbar"><div className="sheet-search"><Search className="h-4 w-4" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no histórico..." /></div></div>
      <div className="sheet-frame">{history.isLoading ? <LoadingState /> : history.isError ? <ErrorState message={(history.error as Error).message} /> : !rows.length ? <EmptyState title="Sem histórico" description="As análises concluídas aparecerão aqui." /> : <table className="modern-table"><thead><tr><th>Importada em</th><th>Planilha</th><th>OS</th><th>Localizadas</th><th>Não localizadas</th><th>Fechadas</th><th>Pendentes</th><th>Analisada em</th><th>Ações</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id || `${item.fileName}-${item.importedAt}`}><td><strong className="table-primary">{formatDate(item.importedAt)}</strong></td><td>{item.fileName || "—"}</td><td>{formatNumber(item.totalOS)}</td><td>{formatNumber(item.totalMatched)}</td><td>{formatNumber(item.totalUnmatched)}</td><td>{formatNumber(item.possiblyClosed)}</td><td>{formatNumber(item.pendingOrReview)}</td><td>{formatDate(item.analyzedAt)}</td><td><button className="outline-action" onClick={() => setSelected(item)} disabled={!item.id}>Ver detalhes</button></td></tr>)}</tbody></table>}</div>
    </Card>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Detalhes da análise" description={selected?.fileName} size="xl">{details.isLoading ? <LoadingState label="Carregando detalhes armazenados…" /> : details.isError ? <ErrorState message={(details.error as Error).message} /> : details.data ? <div className="history-detail-grid"><div><span>OS processadas</span><strong>{formatNumber(details.data.totalSpreadsheetOS)}</strong></div><div><span>Localizadas</span><strong>{formatNumber(details.data.totalMatched)}</strong></div><div><span>Não localizadas</span><strong>{formatNumber(details.data.totalUnmatched)}</strong></div><div><span>Período</span><strong>{details.data.days || 30} dias</strong></div></div> : null}</Modal>
  </div>;
}
