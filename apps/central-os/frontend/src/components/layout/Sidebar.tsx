import {
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileSpreadsheet,
  History,
  Home,
  Pin,
  PinOff,
  Settings,
  UsersRound,
  XCircle
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";

const items = [
  { to: "/", label: "Início", icon: Home },
  { to: "/os-analisadas", label: "OS Analisadas", icon: FileSpreadsheet },
  { to: "/localizadas", label: "Localizadas nos Grupos", icon: CircleDot },
  { to: "/nao-localizadas", label: "Não Localizadas", icon: XCircle },
  { to: "/possivelmente-fechadas", label: "Possivelmente Fechadas", icon: CheckCircle2 },
  { to: "/pendentes", label: "Pendentes / Em análise", icon: Clock3 },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/grupos", label: "Grupos", icon: UsersRound },
  { to: "/configuracoes", label: "Configurações", icon: Settings }
];

const STORAGE_PINNED = "central-os.sidebar.pinned";

export function Sidebar({ onWidthChange }: { onWidthChange?: (expanded: boolean) => void }) {
  const [pinned, setPinned] = useState(() => localStorage.getItem(STORAGE_PINNED) !== "false");
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  useEffect(() => {
    localStorage.setItem(STORAGE_PINNED, String(pinned));
  }, [pinned]);

  useEffect(() => onWidthChange?.(expanded), [expanded, onWidthChange]);

  function togglePinned() {
    setPinned((value) => !value);
  }

  return (
    <motion.aside
      className={cn("app-sidebar", expanded && "is-expanded", pinned && "is-pinned")}
      animate={{ width: expanded ? 238 : 78 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => !pinned && setHovered(false)}
    >
      <div className="sidebar-brand-row">
        <NavLink to="/" className="sidebar-brand" aria-label="Central OS">
          <span className="brand-play">▶</span>
          <span className="brand-copy">
            <strong>Central <em>OS</em></strong>
            <small>PLAY SOLUÇÕES</small>
          </span>
        </NavLink>
        {expanded ? (
          <div className="sidebar-controls">
            <button className="sidebar-control" onClick={togglePinned} title={pinned ? "Desafixar menu" : "Fixar menu"} aria-label={pinned ? "Desafixar menu" : "Fixar menu"}>
              {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : null}
      </div>

      <div className="sidebar-section-label">MENU</div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        {items.slice(0, 7).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cn("sidebar-link", isActive && "active")} title={!expanded ? label : undefined}>
            <span className="sidebar-icon"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="sidebar-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-section-label sidebar-system-label">SISTEMA</div>
      <nav className="sidebar-nav" aria-label="Sistema">
        {items.slice(7).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cn("sidebar-link", isActive && "active")} title={!expanded ? label : undefined}>
            <span className="sidebar-icon"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="sidebar-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-quote" aria-hidden={!expanded}>
        <BarChart3 className="h-5 w-5 text-cyan-300" />
        <span>Organização e acompanhamento em uma única central.</span>
        <strong>Central <em>OS</em></strong>
      </div>
      <div className="sidebar-agent"><span className="online-pulse" /><span className="sidebar-label">Agente conectado</span></div>
    </motion.aside>
  );
}
