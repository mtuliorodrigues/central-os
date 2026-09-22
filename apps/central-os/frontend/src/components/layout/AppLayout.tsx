import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const [sidebarPinnedExpanded, setSidebarPinnedExpanded] = useState(true);
  const location = useLocation();
  return (
    <div className={`app-shell ${sidebarPinnedExpanded ? "sidebar-wide" : "sidebar-compact"}`}>
      <Sidebar onWidthChange={setSidebarPinnedExpanded} />
      <div className="app-stage">
        <Topbar />
        <main className="app-main">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
