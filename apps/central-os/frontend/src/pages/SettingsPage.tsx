import { Database, Folder, MessageCircle, PlayCircle, Settings, Users } from "lucide-react";
import { useReportConfig, useReportStatus } from "../hooks/useQueries";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { LoadingState } from "../components/ui/Feedback";
import { PageHeader } from "../components/ui/PageHeader";

export function SettingsPage() {
  const config = useReportConfig();
  const status = useReportStatus(30_000);
  if (config.isLoading) return <LoadingState label="Carregando configurações…" />;
  const d = config.data;
  return <div className="page-stack"><PageHeader eyebrow="CONFIGURAÇÃO LOCAL" title="Configurações" description="Resumo não sensível das integrações atualmente carregadas pelo backend." />
    <div className="settings-grid">
      <Card tone="green" className="setting-card"><MessageCircle /><div><span>Grupo de origem</span><strong>{d?.origem?.name || d?.origem?.id || "Não configurado"}</strong></div><Badge tone={d?.origem?.id ? "success" : "warning"}>{d?.origem?.id ? "Configurado" : "Pendente"}</Badge></Card>
      <Card tone="cyan" className="setting-card"><PlayCircle /><div><span>Grupo de destino</span><strong>{d?.destino?.name || d?.destino?.id || "Não configurado"}</strong></div><Badge tone={d?.destino?.id ? "success" : "warning"}>{d?.destino?.id ? "Configurado" : "Pendente"}</Badge></Card>
      <Card tone="violet" className="setting-card"><Users /><div><span>Usuários registrados no motor</span><strong>{d?.registeredUsers || 0}</strong></div></Card>
      <Card tone="amber" className="setting-card"><Settings /><div><span>Execução via painel</span><strong>{d?.webExecutionEnabled ? "Habilitada" : "Desabilitada"}</strong></div><Badge tone={d?.webExecutionEnabled ? "success" : "warning"}>{d?.webExecutionEnabled ? "Ativa" : "Protegida"}</Badge></Card>
      <Card tone="blue" className="setting-card"><Database /><div><span>Banco de dados</span><strong>{status.data?.postgres?.ok ? "Online" : "Atenção"}</strong><small>{status.data?.postgres?.detail || "—"}</small></div></Card>
      <Card className="setting-card"><Folder /><div><span>Diretório de planilhas</span><strong>{d?.paths?.planilhas || "Não exposto"}</strong></div></Card>
    </div>
    <Card className="settings-note"><strong>Frontend somente leitura</strong><p>Esta tela exibe a configuração pública que o backend já fornece. Nenhum segredo, chave de API ou dado sensível é enviado ao navegador.</p></Card>
  </div>;
}
