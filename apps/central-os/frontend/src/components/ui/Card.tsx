import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "default" | "cyan" | "green" | "red" | "amber" | "violet" | "blue";

type Props = HTMLAttributes<HTMLDivElement> & { tone?: Tone; interactive?: boolean; children: ReactNode };

export function Card({ className, tone = "default", interactive = false, children, ...props }: Props) {
  return <div className={cn("ui-card", `ui-card--${tone}`, interactive && "ui-card--interactive", className)} {...props}>{children}</div>;
}
