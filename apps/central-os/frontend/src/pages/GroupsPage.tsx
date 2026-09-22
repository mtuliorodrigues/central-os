import { CircleDot, MessageCircle, Send, UsersRound } from "lucide-react";
import { useGroups, useReportConfig } from "../hooks/useQueries";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { PageHeader } from "../components/ui/PageHeader";

export function GroupsPage() {
  const groups = useGroups();
  const config = useReportConfig();
  const list = groups.data?.groups || [];
  return <div className="page-stack"><PageHeader eyebrow="FONTES DE CONTEXTO" title="Grupos" description="Grupos consultados pelo motor Central OS e configuração atual do Relatório OS." />
    <div className="group-config-grid"><Card tone="green" className="group-config-card"><span className="group-big-icon"><MessageCircle /></span><div><p className="eyebrow">GRUPO DE ORIGEM</p><h2>{config.data?.origem?.name || config.data?.origem?.id || "Não configurado"}</h2><p>Fonte de mensagens usada pelo Relatório OS.</p></div></Card><Card tone="cyan" className="group-config-card"><span className="group-big-icon"><Send /></span><div><p className="eyebrow">GRUPO DE DESTINO</p><h2>{config.data?.destino?.name || config.data?.destino?.id || "Não configurado"}</h2><p>Destino atualmente configurado para o envio.</p></div></Card></div>
    <Card className="sheet-card"><div className="section-heading"><div><p className="eyebrow">GRUPOS DESCOBERTOS</p><h2>Disponibilidade atual</h2><p>Esta lista vem diretamente da configuração e da infraestrutura consultada pelo backend.</p></div><Badge tone="info">{list.filter((g) => g.available).length} disponível(is)</Badge></div>{groups.isLoading ? <LoadingState /> : groups.isError ? <ErrorState message={(groups.error as Error).message} /> : !list.length ? <EmptyState title="Nenhum grupo encontrado" /> : <div className="groups-grid">{list.map((group, index) => <article className="group-row-card" key={group.jid || group.id || `${group.name}-${index}`}><span className="group-avatar"><UsersRound /></span><div><strong>{group.name || "Grupo"}</strong><small>{group.jid || group.id || "Identificador não exibido"}</small></div><Badge tone={group.available ? "success" : "neutral"}>{group.available ? "Disponível" : "Indisponível"}</Badge><CircleDot className={`h-4 w-4 ${group.available ? "text-emerald-300" : "text-slate-500"}`} /></article>)}</div>}</Card>
  </div>;
}
