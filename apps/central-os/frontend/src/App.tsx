import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AnalysisPage } from "./pages/AnalysisPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GroupsPage } from "./pages/GroupsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemStatusPage } from "./pages/SystemStatusPage";
import { AuthGate } from "./auth/AuthContext";

export default function App() {
  return <AuthGate><Routes>
      <Route path="/status" element={<SystemStatusPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/os-analisadas" element={<AnalysisPage view="all" />} />
        <Route path="/localizadas" element={<AnalysisPage view="located" />} />
        <Route path="/nao-localizadas" element={<AnalysisPage view="unmatched" />} />
        <Route path="/possivelmente-fechadas" element={<AnalysisPage view="closed" />} />
        <Route path="/pendentes" element={<AnalysisPage view="pending" />} />
        <Route path="/historico" element={<HistoryPage />} />
        <Route path="/grupos" element={<GroupsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/relatorio" element={<Navigate to="/os-analisadas" replace />} />
        <Route path="/importar-planilha" element={<Navigate to="/?import=1" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></AuthGate>;
}
