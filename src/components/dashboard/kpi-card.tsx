import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  title: string;
  value: string;
  trendLabel: string;
  trendDirection: "up" | "down" | "flat";
};

export function KpiCard({
  title,
  value,
  trendLabel,
  trendDirection,
}: KpiCardProps) {
  const isUp = trendDirection === "up";
  const isDown = trendDirection === "down";

  return (
    <Card>
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">{title}</p>
      <p className="mt-3 font-display text-3xl text-[var(--text-100)]">{value}</p>
      <div
        className={cn(
          "mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
          isUp && "bg-emerald-400/15 text-emerald-300",
          isDown && "bg-red-400/15 text-red-300",
          trendDirection === "flat" && "bg-slate-400/15 text-slate-300",
        )}
      >
        {isUp && <ArrowUpRight className="h-3.5 w-3.5" />}
        {isDown && <ArrowDownRight className="h-3.5 w-3.5" />}
        <span>{trendLabel}</span>
      </div>
    </Card>
  );
}
