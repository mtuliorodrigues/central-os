import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ className, variant = "secondary", size = "md", loading, icon, children, disabled, ...props }: Props) {
  return (
    <button
      className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
