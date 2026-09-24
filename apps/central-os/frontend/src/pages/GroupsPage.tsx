import { CircleDot, MessageCircle, Send, UsersRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { queryKeys, useGroups, useReportConfig } from "../hooks/useQueries";
import { api } from "../lib/api";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/Feedback";
import { PageHeader } from "../components/ui/PageHeader";

export function GroupsPage() {
  const groups = useGroups();
  const config = useReportConfig();
  const queryClient = useQueryClient();
  const [origemJid, setOrigemJid] = useState("");
  const [destinoJid, setDestinoJid] = useState("");
  const [feedback, setFeedback] = useState("");
  const list = useMemo(() => groups.data?.groups || [], [groups.data?.groups]);
  const available = useMemo(() => list.filter((group) => group.available && (group.jid || group.id)), [list]);
  useEffect(() => {
    if (!origemJid && config.data?.origem?.id) setOrigemJid(config.data.origem.id);
    if (!destinoJid && config.data?.destino?.id) setDestinoJid(config.data.destino.id);
  }, [config.data?.origem?.id, config.data?.destino?.id, destinoJid, origemJid]);
  const save = useMutation({
    mutationFn: () => api.saveGroups(origemJid, destinoJid),
    onSuccess: async () => {
      setFeedback("Origem e destino salvos com os JIDs retornados pela Evolution.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reportConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reportStatus })
      ]);
    },
    onError: (error: Error) => setFeedback(error.message)
  });
  return <div className="page-stack"><PageHeader eyebrow="FONTES DE CONTEXTO" title="Grupos" description="Grupos consultados pelo motor Central OS e configuração atual do Relatório OS." />
    <div className="group-config-grid"><Card tone="green" className="group-config-card"><span className="group-big-icon"><MessageCircle /></span><div><p className="eyebrow">GRUPO DE ORIGEM</p><h2>{config.data?.origem?.name || config.data?.origem?.id || "Não configurado"}</h2><p>Fonte de mensagens usada pelo Relatório OS.</p></div></Card><Card tone="cyan" className="group-config-card"><span className="group-big-icon"><Send /></span><div><p className="eyebrow">GRUPO DE DESTINO</p><h2>{config.data?.destino?.name || config.data?.destino?.id || "Não configurado"}</h2><p>Destino atualmente configurado para o envio.</p></div></Card></div>
    <Card className="sheet-card"><div className="section-heading"><div><p className="eyebrow">CONFIGURAÇÃO OPERACIONAL</p><h2>Origem e destino</h2><p>Selecione grupos disponíveis na Evolution. O JID exibido é o identificador real usado pelos dois motores.</p></div></div><div className="group-selection-grid"><label><span>Grupo de origem</span><select value={origemJid} onChange={(event) => setOrigemJid(event.target.value)} disabled={!available.length}><option value="">Selecione a origem</option>{available.map((group) => <option key={group.jid || group.id || ""} value={group.jid || group.id || ""}>{group.name} — {group.jid || group.id}</option>)}</select></label><label><span>Grupo de destino</span><select value={destinoJid} onChange={(event) => setDestinoJid(event.target.value)} disabled={!available.length}><option value="">Selecione o destino</option>{available.map((group) => <option key={group.jid || group.id || ""} value={group.jid || group.id || ""}>{group.name} — {group.jid || group.id}</option>)}</select></label><button className="ui-button ui-button--primary" disabled={!origemJid || !destinoJid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Salvando…" : "Salvar configuração"}</button></div>{feedback ? <p className="inline-feedback">{feedback}</p> : null}</Card>
    <Card className="sheet-card"><div className="section-heading"><div><p className="eyebrow">GRUPOS DESCOBERTOS</p><h2>Disponibilidade atual</h2><p>Lista consultada na instância WhatsApp pela Evolution API.</p></div><Badge tone="info">{list.filter((g) => g.available).length} disponível(is)</Badge></div>{groups.isLoading ? <LoadingState /> : groups.isError ? <ErrorState message={(groups.error as Error).message} /> : !list.length ? <EmptyState title="Nenhum grupo encontrado" /> : <div className="groups-grid">{list.map((group, index) => <article className="group-row-card" key={group.jid || group.id || `${group.name}-${index}`}><span className="group-avatar"><UsersRound /></span><div><strong>{group.name || "Grupo"}</strong><small>{group.jid || group.id || "Identificador não exibido"}</small>{group.reason ? <small className="group-row-reason">{group.reason}</small> : null}</div><Badge tone={group.available ? "success" : "neutral"}>{group.available ? "Disponível" : "Indisponível"}</Badge><CircleDot className={`h-4 w-4 ${group.available ? "text-emerald-300" : "text-slate-500"}`} /></article>)}</div>}</Card>
  </div>;
}
