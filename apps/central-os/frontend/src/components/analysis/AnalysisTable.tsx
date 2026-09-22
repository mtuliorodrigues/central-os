import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { formatDate, labelClassification } from "../../lib/format";
import type { AnalysisItem } from "../../lib/types";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../ui/Feedback";
import { Modal } from "../ui/Modal";

export type AnalysisView = "all" | "located" | "unmatched" | "closed" | "pending";

function toneFor(classification?: string): BadgeTone {
  if (classification === "nao_localizada") return "danger";
  if (classification === "possivelmente_realizada") return "success";
  if (classification === "possivelmente_pendente") return "warning";
  if (classification === "revisao_manual" || classification === "sem_evidencia") return "info";
  return "neutral";
}

function filterView(items: AnalysisItem[], view: AnalysisView) {
  if (view === "located") return items.filter((item) => item.classification !== "nao_localizada");
  if (view === "unmatched") return items.filter((item) => item.classification === "nao_localizada");
  if (view === "closed") return items.filter((item) => item.classification === "possivelmente_realizada");
  if (view === "pending") return items.filter((item) => !["nao_localizada", "possivelmente_realizada"].includes(String(item.classification)));
  return items;
}

function itemClient(item: AnalysisItem) {
  return item.client || item.reference?.client || "—";
}

export function AnalysisTable({ view }: { view: AnalysisView }) {
  const [days, setDays] = useState<20 | 30>(30);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem("centralOSPageSize") || 20));
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AnalysisItem | null>(null);

  const query = useQuery({
    queryKey: ["analysis", days, view],
    queryFn: () => view === "closed" ? api.possiblyClosed(days) : api.analysis(days),
    retry: 1,
    staleTime: 12_000
  });

  const filtered = useMemo(() => {
    const rows = filterView(query.data?.items || [], view);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => [
      itemClient(item),
      item.sender,
      item.groupName,
      labelClassification(item.classification),
      ...(item.evidence || []).map((entry) => entry.text)
    ].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [query.data, search, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [search, days, view, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  function changePageSize(value: number) {
    setPageSize(value);
    localStorage.setItem("centralOSPageSize", String(value));
  }

  return (
    <>
      <div className="sheet-toolbar">
        <div className="sheet-search"><Search className="h-4 w-4" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, remetente ou grupo..." /></div>
        <div className="sheet-filters"><label><span>PERÍODO</span><select value={days} onChange={(e) => setDays(Number(e.target.value) as 20 | 30)}><option value={20}>20 dias</option><option value={30}>30 dias</option></select></label><label><span>POR PÁGINA</span><select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>{[10,20,30,50].map(n => <option value={n} key={n}>{n}</option>)}</select></label><Button icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => query.refetch()} loading={query.isFetching}>Atualizar</Button></div>
      </div>

      <div className="sheet-summary-line"><strong>{filtered.length.toLocaleString("pt-BR")} resultado(s)</strong><span>{query.data?.totalSpreadsheetOS ? `${Number(query.data.totalSpreadsheetOS).toLocaleString("pt-BR")} OS na análise atual` : ""}</span></div>

      <div className="sheet-frame">
        {query.isLoading ? <LoadingState label="Carregando análise…" /> : query.isError ? <ErrorState message={(query.error as Error).message} /> : !rows.length ? <EmptyState title="Nenhuma OS nesta visão." description="Ajuste o período ou a busca para verificar outros registros." /> : (
          <table className="modern-table">
            <thead><tr><th>Cliente</th><th>Enviado por</th><th>Data</th><th>Status</th><th>Grupo</th><th>Evidência</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{rows.map((item, index) => {
              const evidence = item.evidence || [];
              const preview = evidence[0]?.text || item.originalText || "";
              return <tr key={`${itemClient(item)}-${item.date || index}-${index}`}><td><strong className="table-primary">{itemClient(item)}</strong>{item.reference?.osNumber ? <small>OS {item.reference.osNumber}</small> : item.reference?.contractId ? <small>ID {item.reference.contractId}</small> : null}</td><td>{item.sender || "—"}</td><td>{formatDate(item.date, "—")}</td><td><Badge tone={toneFor(item.classification)}>{labelClassification(item.classification)}</Badge>{item.confidence ? <small className="confidence-line">Confiança {item.confidence}</small> : null}</td><td>{item.groupName || "—"}</td><td>{preview ? <button className="evidence-link" onClick={() => setDetail(item)}>{view === "unmatched" ? "Ver detalhes" : "Ver mensagem"}<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="muted-cell">Nenhuma mensagem correspondente encontrada.</span>}</td><td className="text-right"><button className="table-action" onClick={() => setDetail(item)} aria-label="Ver detalhes">•••</button></td></tr>;
            })}</tbody>
          </table>
        )}
      </div>

      <div className="sheet-pagination"><span>Mostrando {filtered.length ? (page - 1) * pageSize + 1 : 0} a {Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>{Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        let value = i + 1;
        if (totalPages > 5 && page > 3) value = Math.min(totalPages - 4 + i, Math.max(1, page - 2 + i));
        return <button key={value} className={page === value ? "active" : ""} onClick={() => setPage(value)}>{value}</button>;
      })}<button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</button></div></div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? itemClient(detail) : "Detalhes"} description={detail ? `${labelClassification(detail.classification)}${detail.groupName ? ` • ${detail.groupName}` : ""}` : undefined} size="xl">
        {detail ? <div className="detail-grid"><div className="detail-meta"><div><span>Cliente</span><strong>{itemClient(detail)}</strong></div><div><span>Remetente</span><strong>{detail.sender || "—"}</strong></div><div><span>Data</span><strong>{formatDate(detail.date)}</strong></div><div><span>Grupo</span><strong>{detail.groupName || "—"}</strong></div><div><span>Status</span><strong>{labelClassification(detail.classification)}</strong></div><div><span>Confiança</span><strong>{detail.confidence || "—"}</strong></div></div><div className="evidence-stack">{(detail.evidence || []).length ? detail.evidence!.map((ev, i) => <article className="evidence-card" key={`${ev.messageId || i}-${i}`}><header><Badge tone="info">{ev.relation || "Evidência"}</Badge><span>{ev.sender || "—"}</span><time>{formatDate(ev.timestamp)}</time></header>{ev.reason ? <p>{ev.reason}</p> : null}{ev.signal ? <strong>Trecho identificado: “{ev.signal}”</strong> : null}<blockquote>{ev.text || "Sem conteúdo de mensagem."}</blockquote></article>) : <EmptyState title="Sem evidência associada" description="Nenhuma mensagem correspondente foi armazenada para este registro." />}</div></div> : null}
      </Modal>
    </>
  );
}
