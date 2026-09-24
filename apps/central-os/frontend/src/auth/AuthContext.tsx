/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api, setUnauthorizedHandler } from "../lib/api";
import type { AuthUser } from "../lib/types";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
};

const TOKEN_KEY = "central_os_session_token";
const AuthContext = createContext<AuthContextValue | null>(null);

export function readSessionToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function clearSessionToken() { sessionStorage.removeItem(TOKEN_KEY); }

function messageForError(error: unknown) {
  if (error instanceof ApiError && error.status === 0) return "A Central OS local não está acessível.";
  if (error instanceof ApiError && error.status >= 500) return "O backend local ou o banco não está disponível.";
  if (error instanceof ApiError && error.status === 401) return "Sessão expirada. Entre novamente.";
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const invalidate = () => {
      clearSessionToken();
      setUser(null);
      setError("Sessão expirada. Entre novamente.");
    };
    setUnauthorizedHandler(invalidate);
    const token = readSessionToken();
    if (!token) { setLoading(false); return () => setUnauthorizedHandler(null); }
    api.me()
      .then(result => { setUser(result.user); setError(null); })
      .catch(error => { clearSessionToken(); setUser(null); setError(messageForError(error)); })
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    authenticated: Boolean(user),
    error,
    async login(username, password) {
      setError(null);
      try {
        const result = await api.login(username, password);
        sessionStorage.setItem(TOKEN_KEY, result.token);
        setUser(result.user);
      } catch (cause) {
        const message = cause instanceof ApiError && cause.status === 401 ? "Usuário ou senha inválidos." : messageForError(cause);
        setError(message);
        throw cause;
      }
    },
    async logout() {
      try { if (readSessionToken()) await api.logout(); }
      catch { /* a sessão local deve ser limpa mesmo se o backend estiver offline */ }
      clearSessionToken();
      setUser(null);
      setError(null);
    },
    updateUser(nextUser) {
      setUser(nextUser);
    }
  }), [error, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <div className="auth-boot" role="status">Validando sessão da Central OS…</div>;
  if (!auth.user) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) { setLocalError("Informe usuário e senha."); return; }
    setSubmitting(true);
    setLocalError(null);
    try { await auth.login(username, password); }
    catch (error) { setLocalError(error instanceof ApiError && error.status === 401 ? "Usuário ou senha inválidos." : auth.error || "Não foi possível conectar à Central OS local."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-mark">OS</div>
        <p className="eyebrow">Central OS Local</p>
        <h1 id="auth-title">Entrar na Central OS</h1>
        <p className="auth-subtitle">Use seu acesso para abrir o painel operacional.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Usuário<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoFocus /></label>
          <label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {(localError || auth.error) ? <p className="auth-error" role="alert">{localError || auth.error}</p> : null}
          <button className="ui-button ui-button--primary auth-submit" type="submit" disabled={submitting}>{submitting ? "Entrando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
