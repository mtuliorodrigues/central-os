import { Database, Folder, KeyRound, MessageCircle, Pencil, PlayCircle, Plus, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useReportConfig, useReportStatus } from "../hooks/useQueries";
import { api, ApiError } from "../lib/api";
import type { AuthUser } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/Feedback";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";

function errorMessage(error: unknown) { return error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "Nunca"; }

export function SettingsPage() {
  const auth = useAuth();
  const config = useReportConfig();
  const status = useReportStatus(30_000);
  const [profileName, setProfileName] = useState(auth.user?.name || "");
  const [profileAvatar, setProfileAvatar] = useState(auth.user?.avatar || "");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  useEffect(() => { setProfileName(auth.user?.name || ""); setProfileAvatar(auth.user?.avatar || ""); }, [auth.user]);
  if (config.isLoading) return <LoadingState label="Carregando configurações…" />;
  if (config.isError) return <div className="page-stack"><PageHeader eyebrow="CONFIGURAÇÃO LOCAL" title="Configurações" description="Não foi possível carregar a configuração atual." /><Card><ErrorState message={errorMessage(config.error)} /></Card></div>;
  const d = config.data;
  async function saveProfile() { try { const result = await api.updateProfile({ name: profileName, avatar: profileAvatar }); auth.updateUser(result.user); setProfileMessage("Perfil atualizado."); } catch (error) { setProfileMessage(errorMessage(error)); } }
  async function changePassword() {
    if (!passwords.next || passwords.next !== passwords.confirm) { setPasswordMessage("A nova senha e a confirmação precisam coincidir."); return; }
    try { await api.changePassword(passwords.current, passwords.next); setPasswordMessage("Senha alterada. Entre novamente para continuar."); setPasswords({ current: "", next: "", confirm: "" }); window.setTimeout(() => void auth.logout(), 500); } catch (error) { setPasswordMessage(errorMessage(error)); }
  }
  return <div className="page-stack">
    <PageHeader eyebrow="CONFIGURAÇÃO LOCAL" title="Configurações" description="Perfil, acesso e resumo das integrações carregadas pelo backend." />
    <div className="settings-grid">
      <Card tone="green" className="setting-card"><MessageCircle /><div><span>Grupo de origem</span><strong>{d?.origem?.name || d?.origem?.id || "Não configurado"}</strong></div><Badge tone={d?.origem?.id ? "success" : "warning"}>{d?.origem?.id ? "Configurado" : "Pendente"}</Badge></Card>
      <Card tone="cyan" className="setting-card"><PlayCircle /><div><span>Grupo de destino</span><strong>{d?.destino?.name || d?.destino?.id || "Não configurado"}</strong></div><Badge tone={d?.destino?.id ? "success" : "warning"}>{d?.destino?.id ? "Configurado" : "Pendente"}</Badge></Card>
      <Card tone="violet" className="setting-card"><Users /><div><span>Usuários registrados no motor</span><strong>{d?.registeredUsers || 0}</strong></div></Card>
      <Card tone="amber" className="setting-card"><Settings /><div><span>Execução via painel</span><strong>{d?.webExecutionEnabled ? "Habilitada" : "Desabilitada"}</strong></div><Badge tone={d?.webExecutionEnabled ? "success" : "warning"}>{d?.webExecutionEnabled ? "Ativa" : "Protegida"}</Badge></Card>
      <Card tone="blue" className="setting-card"><Database /><div><span>Banco de dados</span><strong>{status.data?.postgres?.ok ? "Online" : "Atenção"}</strong><small>{status.data?.postgres?.detail || "—"}</small></div></Card>
      <Card className="setting-card"><Folder /><div><span>Diretório de planilhas</span><strong>{d?.paths?.planilhas || "Não exposto"}</strong></div></Card>
    </div>
    <div className="settings-two-column"><ProfileCard user={auth.user} profileName={profileName} profileAvatar={profileAvatar} setProfileName={setProfileName} setProfileAvatar={setProfileAvatar} onSave={saveProfile} message={profileMessage} /><PasswordCard passwords={passwords} setPasswords={setPasswords} onSave={changePassword} message={passwordMessage} /></div>
    {auth.user?.role === "MASTER_ADMIN" ? <AdminUsers /> : null}
    <Card className="settings-note"><strong>Proteção de acesso</strong><p>Usuários comuns podem editar o próprio perfil e senha. A administração de usuários é exclusiva do MASTER_ADMIN e permanece protegida no backend.</p></Card>
  </div>;
}

function ProfileCard({ user, profileName, profileAvatar, setProfileName, setProfileAvatar, onSave, message }: { user: AuthUser | null; profileName: string; profileAvatar: string; setProfileName: (value: string) => void; setProfileAvatar: (value: string) => void; onSave: () => void; message: string }) {
  return <Card className="profile-card"><div className="settings-section-heading"><div><span className="eyebrow">MEU PERFIL</span><h2><UserRound /> {user?.name}</h2></div><Badge tone="info">{user?.role}</Badge></div><div className="settings-form-grid"><label>Nome<input value={profileName} onChange={event => setProfileName(event.target.value)} /></label><label>Avatar (URL ou identificador)<input value={profileAvatar} onChange={event => setProfileAvatar(event.target.value)} /></label><label>Username<input value={user?.username || ""} disabled /></label></div><Button icon={<Pencil className="h-4 w-4" />} onClick={onSave}>Salvar perfil</Button>{message ? <p className="settings-feedback">{message}</p> : null}</Card>;
}

function PasswordCard({ passwords, setPasswords, onSave, message }: { passwords: { current: string; next: string; confirm: string }; setPasswords: (value: { current: string; next: string; confirm: string }) => void; onSave: () => void; message: string }) {
  return <Card className="profile-card"><div className="settings-section-heading"><div><span className="eyebrow">SEGURANÇA</span><h2><KeyRound /> Trocar senha</h2></div><ShieldCheck className="settings-security-icon" /></div><div className="settings-form-grid"><label>Senha atual<input type="password" value={passwords.current} onChange={event => setPasswords({ ...passwords, current: event.target.value })} /></label><label>Nova senha<input type="password" value={passwords.next} onChange={event => setPasswords({ ...passwords, next: event.target.value })} /></label><label>Confirmar nova senha<input type="password" value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} /></label></div><Button variant="primary" onClick={onSave}>Alterar senha</Button>{message ? <p className="settings-feedback">{message}</p> : null}</Card>;
}

function AdminUsers() {
  const [users, setUsers] = useState<AuthUser[]>([]); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [modal, setModal] = useState<"create" | "edit" | "reset" | null>(null); const [selected, setSelected] = useState<AuthUser | null>(null); const [form, setForm] = useState({ name: "", username: "", avatar: "", password: "", confirm: "" });
  async function refresh() { setLoading(true); try { const result = await api.adminUsers(); setUsers(Array.isArray(result.users) ? result.users : []); } catch (error) { setUsers([]); setMessage(errorMessage(error)); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  function open(kind: "create" | "edit" | "reset", user?: AuthUser) { setSelected(user || null); setForm({ name: user?.name || "", username: user?.username || "", avatar: user?.avatar || "", password: "", confirm: "" }); setModal(kind); }
  async function submit() { try { if (modal === "create") { if (!form.password || form.password !== form.confirm) throw new Error("A senha e a confirmação precisam coincidir."); await api.adminCreateUser({ name: form.name, username: form.username, password: form.password, avatar: form.avatar }); } else if (modal === "edit" && selected) await api.adminUpdateUser(selected.id, { name: form.name, avatar: form.avatar }); else if (modal === "reset" && selected) { if (!form.password || form.password !== form.confirm) throw new Error("A senha e a confirmação precisam coincidir."); await api.adminResetPassword(selected.id, form.password); } setModal(null); setMessage("Operação concluída."); await refresh(); } catch (error) { setMessage(errorMessage(error)); } }
  async function toggle(user: AuthUser) { try { await api.adminSetUserActive(user.id, !user.active); setMessage(user.active ? "Usuário desativado e sessões revogadas." : "Usuário reativado."); await refresh(); } catch (error) { setMessage(errorMessage(error)); } }
  return <Card className="admin-users-card"><div className="settings-section-heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h2><Users /> Usuários e acesso</h2></div><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => open("create")}>Novo usuário</Button></div>{message ? <p className="settings-feedback">{message}</p> : null}{loading ? <LoadingState label="Carregando usuários…" /> : <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Usuário</th><th>Username</th><th>Perfil</th><th>Estado</th><th>Último login</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.avatar || "Sem avatar"}</small></td><td>{user.username}</td><td><Badge tone={user.role === "MASTER_ADMIN" ? "violet" : "info"}>{user.role}</Badge></td><td><Badge tone={user.active ? "success" : "danger"}>{user.active ? "Ativo" : "Inativo"}</Badge></td><td>{formatDate(user.lastLoginAt)}</td><td className="users-actions"><Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => open("edit", user)}>Editar</Button>{user.role === "USER" ? <><Button size="sm" onClick={() => open("reset", user)}>Resetar senha</Button><Button size="sm" variant={user.active ? "danger" : "secondary"} onClick={() => void toggle(user)}>{user.active ? "Desativar" : "Reativar"}</Button></> : <span className="users-protected">Protegido</span>}</td></tr>)}</tbody></table></div>}<Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === "create" ? "Novo usuário" : modal === "edit" ? "Editar perfil" : "Resetar senha"} description="A senha nunca é exibida novamente após a confirmação."><div className="settings-modal-form">{modal !== "reset" ? <><label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>{modal === "create" ? <label>Username<input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label> : null}<label>Avatar<input value={form.avatar} onChange={event => setForm({ ...form, avatar: event.target.value })} /></label></> : null}{modal !== "edit" ? <><label>Senha inicial/nova senha<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><label>Confirmar senha<input type="password" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} /></label></> : null}<div className="modal-actions"><Button onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" onClick={() => void submit()}>Confirmar</Button></div></div></Modal></Card>;
}
