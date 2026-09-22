import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function Modal({ open, onClose, title, description, children, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`modal-panel modal-panel--${size}`}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
              <button className="icon-button" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
