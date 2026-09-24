import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, LoaderCircle, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { api, fileToBase64 } from "../../lib/api";
import { queryKeys } from "../../hooks/useQueries";
import { formatBytes, formatNumber } from "../../lib/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<"idle" | "reading" | "importing" | "analyzing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [processed, setProcessed] = useState<number | null>(null);

  function validate(selected: File) {
    const ext = selected.name.toLowerCase().split(".").pop();
    if (!ext || !["xlsx", "csv"].includes(ext)) throw new Error("Selecione uma planilha .xlsx ou .csv.");
    if (selected.size > MAX_FILE_SIZE) throw new Error("A planilha ultrapassa o limite de 15 MB.");
  }

  function choose(selected?: File | null) {
    if (!selected) return;
    try {
      validate(selected);
      setFile(selected);
      setStage("idle");
      setMessage("");
      setProcessed(null);
    } catch (error: any) {
      setFile(null);
      setStage("error");
      setMessage(error?.message || "Arquivo inválido.");
    }
  }

  async function run() {
    if (!file) return;
    try {
      setStage("reading");
      setMessage("Lendo o arquivo selecionado…");
      const dataBase64 = await fileToBase64(file);
      setStage("importing");
      setMessage("Importando a planilha e identificando as ordens…");
      const imported = await api.importSpreadsheet(file.name, dataBase64);
      setStage("analyzing");
      setMessage(`Planilha importada. Processando ${formatNumber(imported.totalOS)} OS…`);
      const analysis = await api.processAnalysis();
      setProcessed(analysis.totalSpreadsheetOS || imported.totalOS || 0);
      setStage("done");
      setMessage("Importação e análise concluídas.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.history }),
        queryClient.invalidateQueries({ queryKey: queryKeys.spreadsheets }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reportStatus }),
        queryClient.invalidateQueries({ queryKey: ["analysis"] })
      ]);
    } catch (error: any) {
      setStage("error");
      setMessage(error?.message || "Não foi possível concluir o processamento.");
    }
  }

  function close() {
    if (["reading", "importing", "analyzing"].includes(stage)) return;
    setFile(null);
    setStage("idle");
    setMessage("");
    setProcessed(null);
    onClose();
  }

  const progress = stage === "reading" ? 18 : stage === "importing" ? 48 : stage === "analyzing" ? 78 : stage === "done" ? 100 : 0;
  const busy = ["reading", "importing", "analyzing"].includes(stage);

  return (
    <Modal open={open} onClose={close} title="Importar planilha" description="A planilha será importada e analisada pelos motores atuais da Central OS." size="lg">
      <input ref={inputRef} type="file" accept=".xlsx,.csv" hidden onChange={(event) => choose(event.target.files?.[0])} />
      <button
        className={`dropzone-modern ${dragging ? "is-dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
        disabled={busy}
      >
        <span className="dropzone-icon"><UploadCloud className="h-6 w-6" /></span>
        <strong>{file ? file.name : "Selecione ou arraste uma planilha"}</strong>
        <small>{file ? `${formatBytes(file.size)} • pronta para processar` : ".xlsx ou .csv • máximo de 15 MB"}</small>
      </button>

      {file || message ? (
        <div className="import-process-card">
          <div className="import-process-head">
            <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-cyan-300" /><div><strong>{file?.name || "Processamento"}</strong><span>{message || "Arquivo pronto."}</span></div></div>
            {stage === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : busy ? <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" /> : null}
          </div>
          {busy || stage === "done" ? <div className="progress-track"><span style={{ width: `${progress}%` }} /></div> : null}
          {processed != null ? <div className="import-result"><strong>{formatNumber(processed)}</strong><span>OS processadas na análise atual</span></div> : null}
          {stage === "error" ? <p className="form-error">{message}</p> : null}
        </div>
      ) : null}

      <div className="modal-actions">
        <Button onClick={close} disabled={busy}>{stage === "done" ? "Fechar" : "Cancelar"}</Button>
        {stage !== "done" ? <Button variant="primary" onClick={run} disabled={!file || busy} loading={busy}>Importar e analisar</Button> : null}
      </div>
    </Modal>
  );
}
