import { LogOut, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotificationCenter } from "./NotificationCenter";
import { SystemStatusButton } from "./SystemStatusButton";
import { useAuth } from "../../auth/AuthContext";

const destinations = [
  ["Início", "/"],
  ["OS Analisadas", "/os-analisadas"],
  ["Localizadas nos Grupos", "/localizadas"],
  ["Não Localizadas", "/nao-localizadas"],
  ["Possivelmente Fechadas", "/possivelmente-fechadas"],
  ["Pendentes / Em análise", "/pendentes"],
  ["Histórico", "/historico"],
  ["Grupos", "/grupos"],
  ["Configurações", "/configuracoes"],
  ["Status do Sistema", "/status"]
] as const;

export function Topbar() {
  const auth = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return destinations.filter(([label]) => !q || label.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function go(path: string) {
    navigate(path);
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <header className="app-topbar">
      <div className="global-search-wrap">
        <Search className="global-search-icon" />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 130)} placeholder="Buscar no sistema..." aria-label="Buscar páginas da Central OS" />
        <kbd>Ctrl + K</kbd>
        {focused ? (
          <div className="search-results">
            {matches.map(([label, path]) => <button key={path} onMouseDown={(event) => event.preventDefault()} onClick={() => go(path)}><span>{label}</span><small>Abrir</small></button>)}
            {!matches.length ? <span className="search-empty">Nenhuma página encontrada.</span> : null}
          </div>
        ) : null}
      </div>
      <div className="topbar-actions">
        <NotificationCenter />
        <SystemStatusButton />
        <div className="topbar-user">
          <div className="topbar-user-copy"><strong>{auth.user?.name}</strong><span>{auth.user?.role}</span></div>
          <button className="topbar-icon-button" type="button" onClick={() => void auth.logout()} aria-label="Sair" title="Sair"><LogOut size={17} /></button>
        </div>
      </div>
    </header>
  );
}
