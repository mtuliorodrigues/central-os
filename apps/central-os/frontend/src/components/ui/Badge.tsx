import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ className, children, tone = "neutral", ...props }: Props) {
  return <span className={cn("ui-badge", `ui-badge--${tone}`, className)} {...props}>{children}</span>;
}
