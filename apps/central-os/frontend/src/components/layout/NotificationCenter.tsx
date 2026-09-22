import { Bell, CheckCircle2, FileSpreadsheet, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useHistory, useReportStatus } from "../../hooks/useQueries";
import { relativeTime } from "../../lib/format";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const history = useHistory();
  const status = useReportStatus(30_000);

  const entries = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string; time?: string | null; icon: typeof Bell }> = [];
    const lastReport = status.data?.lastReport;
    if (lastReport?.modifiedAt) {
      list.push({ id: `report-${lastReport.modifiedAt}`, title: "Relatório OS registrado", detail: lastReport.fileName || "Relatório concluído", time: lastReport.modifiedAt, icon: Send });
    }
    for (const item of (history.data?.history || []).slice(0, 5)) {
      const time = item.analyzedAt || item.importedAt;
      list.push({
        id: item.id || `${item.fileName}-${time}`,
        title: item.analyzedAt ? "Análise concluída" : "Planilha importada",
        detail: `${item.fileName || "Planilha"}${item.totalOS ? ` • ${item.totalOS} OS` : ""}`,
        time,
        icon: item.analyzedAt ? CheckCircle2 : FileSpreadsheet
      });
    }
    return list.sort((a, b) => String(b.time || "").localeCompare(String(a.time || ""))).slice(0, 6);
  }, [history.data, status.data]);

  return (
    <div className="topbar-popover-wrap">
      <button className="topbar-icon-button" onClick={() => setOpen((v) => !v)} aria-label="Notificações" title="Notificações">
        <Bell className="h-[18px] w-[18px]" />
        {entries.length > 0 ? <span className="notification-dot" /> : null}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="topbar-popover notification-popover" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.15 }}>
            <div className="popover-heading"><div><strong>Notificações</strong><span>Eventos reais da Central OS</span></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
            <div className="notification-list">
              {entries.length ? entries.map((item) => {
                const Icon = item.icon;
                return <div className="notification-item" key={item.id}><span className="notification-icon"><Icon className="h-4 w-4" /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{relativeTime(item.time)}</time></div>;
              }) : <div className="notification-empty">Nenhuma atividade recente registrada.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
