import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirmar", loading = false }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="confirm-visual"><AlertTriangle className="h-5 w-5" /><span>Revise a ação antes de continuar.</span></div>
      <div className="modal-actions"><Button onClick={onClose} disabled={loading}>Cancelar</Button><Button variant="primary" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></div>
    </Modal>
  );
}
