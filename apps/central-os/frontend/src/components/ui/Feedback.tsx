import { AlertCircle, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return <div className="state-block"><LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" /><span>{label}</span></div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-block state-block--error"><AlertCircle className="h-5 w-5" /><span>{message}</span></div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="empty-state"><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>;
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
