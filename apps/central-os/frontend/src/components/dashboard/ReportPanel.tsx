import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, MessageCircle, Play, RefreshCw, Radio, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useReportStatus, useSpreadsheets } from "../../hooks/useQueries";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";

function ServiceLine({ icon: Icon, label, ok, detail }: { icon: any; label: string; ok?: boolean; detail?: string | null }) {
  return <div className="service-line"><span className={`service-icon ${ok ? "ok" : "warn"}`}><Icon className="h-4 w-4" /></span><div><strong>{label}</strong><small>{detail || "—"}</small></div><span className={`service-dot ${ok ? "ok" : "warn"}`} /></div>;
}

export function ReportPanel() {
  const status = useReportStatus(30_000);
  const sheets = useSpreadsheets();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const options = sheets.data?.planilhas || [];
  const selectedName = selected || options[0]?.name || "";
  const r = status.data;
  const enabled = Boolean(r?.config?.webExecutionEnabled && r?.config?.configured && selectedName && !r?.reportExecution?.locked);

  const execute = useMutation({
    mutationFn: () => api.executeReport(selectedName),
    onSuccess: async () => {
      setFeedback("Relatório concluído. O resultado foi registrado pelo motor atual.");
      setConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ["report-status"] });
    },
    onError: (error: any) => {
      setFeedback(error?.message || "Falha ao executar o relatório.");
      setConfirm(false);
    }
  });

  const hint = useMemo(() => {
    if (r?.reportExecution?.locked) return "Já existe um relatório em execução.";
    if (!r?.config?.webExecutionEnabled) return "Execução pelo painel está desativada por segurança.";
    if (!r?.config?.configured) return "Configure os grupos de origem e destino antes de executar.";
    if (!selectedName) return "Nenhuma planilha disponível para o Relatório OS.";
    return "Execução real habilitada. A confirmação é exigida antes do envio.";
  }, [r, selectedName]);

  return (
    <Card tone="cyan" className="report-panel-modern">
      <div className="section-heading"><div><p className="eyebrow">RELATÓRIO OS</p><h2>Automação integrada</h2><p>Acompanhe a infraestrutura e execute o motor já existente quando habilitado.</p></div><Badge tone={r?.ready ? "success" : "warning"}>{r?.ready ? "Pronto" : "Atenção"}</Badge></div>
      <div className="service-grid">
        <ServiceLine icon={Database} label="PostgreSQL" ok={r?.postgres?.ok} detail={r?.postgres?.detail} />
        <ServiceLine icon={Radio} label="Evolution" ok={r?.evolution?.ok} detail={r?.evolution?.detail} />
        <ServiceLine icon={MessageCircle} label="WhatsApp" ok={r?.whatsapp?.connected} detail={r?.whatsapp?.connected ? `${r.whatsapp.instance || "Instância"} conectada` : r?.whatsapp?.detail} />
        <ServiceLine icon={Send} label="Listener" ok={r?.listener?.running && r?.listener?.count === 1} detail={r?.listener?.detail} />
      </div>
      <div className="report-groups"><div><span>Origem</span><strong>{r?.config?.origem?.name || r?.config?.origem?.id || "Não configurado"}</strong></div><div><span>Destino</span><strong>{r?.config?.destino?.name || r?.config?.destino?.id || "Não configurado"}</strong></div><div><span>Último relatório</span><strong>{r?.lastReport ? `${r.lastReport.fileName} • ${formatDate(r.lastReport.modifiedAt)}` : "Nenhum registrado"}</strong></div></div>
      <div className="report-run-row">
        <label><span>Planilha do relatório</span><select value={selectedName} onChange={(e) => setSelected(e.target.value)} disabled={!options.length}>{options.length ? options.map((item) => <option value={item.name} key={item.name}>{item.name}</option>) : <option value="">Nenhuma planilha</option>}</select></label>
        <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={!enabled} onClick={() => setConfirm(true)}>Executar relatório</Button>
        <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => status.refetch()} loading={status.isFetching}>Atualizar</Button>
      </div>
      <p className="report-hint">{hint}</p>
      {feedback ? <div className="inline-feedback">{feedback}</div> : null}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => execute.mutate()} loading={execute.isPending} title="Executar Relatório OS" description={`A execução usará ${selectedName || "a planilha selecionada"} e poderá encaminhar mensagens ao grupo de destino configurado.`} confirmLabel="Executar agora" />
    </Card>
  );
}
