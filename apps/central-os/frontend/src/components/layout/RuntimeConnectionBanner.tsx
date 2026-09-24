import { AlertCircle, RefreshCw } from "lucide-react";
import { useHealth } from "../../hooks/useQueries";
import { APP_MODE } from "../../lib/api";
import { Button } from "../ui/Button";

export function RuntimeConnectionBanner() {
  const health = useHealth(30_000);

  if (!health.isError) return null;

  return (
    <div className="runtime-connection-banner" role="alert">
      <AlertCircle className="h-4 w-4" />
      <div>
        <strong>Runtime local indisponível</strong>
        <span>
          {APP_MODE === "local-runtime"
            ? "Inicie a Central OS Local neste computador para carregar os dados e integrações."
            : "A API da Central OS não respondeu."}
        </span>
      </div>
      <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => health.refetch()}>
        Tentar novamente
      </Button>
    </div>
  );
}
