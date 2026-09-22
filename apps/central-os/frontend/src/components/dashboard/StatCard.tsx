import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { formatNumber } from "../../lib/format";

export function StatCard({ label, value, detail, icon: Icon, tone = "default", to }: {
  label: string;
  value?: number | null;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "cyan" | "green" | "red" | "amber" | "violet" | "blue";
  to?: string;
}) {
  const content = (
    <Card tone={tone} interactive={Boolean(to)} className="stat-card-modern">
      <div className="stat-icon"><Icon className="h-5 w-5" /></div>
      <div className="stat-content"><span>{label}</span><strong>{formatNumber(value)}</strong><small>{detail}</small></div>
      {to ? <span className="stat-arrow"><ArrowRight className="h-4 w-4" /></span> : null}
    </Card>
  );
  return to ? <Link to={to} className="block h-full">{content}</Link> : content;
}
