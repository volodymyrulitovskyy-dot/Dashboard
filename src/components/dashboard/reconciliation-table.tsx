import type { ReconciliationStatus } from "@/lib/data/types";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";

type Row = {
  id: string;
  sourceSystem: string;
  targetSystem: string;
  sourceAmount: number;
  targetAmount: number;
  varianceAmount: number;
  variancePercent: number;
  status: ReconciliationStatus;
};

type ReconciliationTableProps = {
  rows: Row[];
};

function statusStyles(status: ReconciliationStatus) {
  if (status === "MATCHED") {
    return "bg-emerald-400/15 text-emerald-300";
  }

  if (status === "VARIANCE") {
    return "bg-amber-400/15 text-amber-300";
  }

  return "bg-slate-400/15 text-slate-300";
}

export function ReconciliationTable({ rows }: ReconciliationTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">Tie-Out Matrix</p>
          <h3 className="font-display text-xl text-[var(--text-100)]">Source vs NetSuite</h3>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)] text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">
              <th className="pb-3 font-medium">Source</th>
              <th className="pb-3 font-medium">Target</th>
              <th className="pb-3 font-medium">Source Amt</th>
              <th className="pb-3 font-medium">Target Amt</th>
              <th className="pb-3 font-medium">Variance</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border-soft)]/70 text-[var(--text-200)] last:border-none">
                <td className="py-3">{row.sourceSystem}</td>
                <td className="py-3">{row.targetSystem}</td>
                <td className="py-3">{formatCurrency(row.sourceAmount)}</td>
                <td className="py-3">{formatCurrency(row.targetAmount)}</td>
                <td className="py-3">
                  <div>{formatCurrency(row.varianceAmount)}</div>
                  <div className="text-xs text-[var(--text-400)]">{formatPercent(row.variancePercent)}</div>
                </td>
                <td className="py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${statusStyles(row.status)}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
