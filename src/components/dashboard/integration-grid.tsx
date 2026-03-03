import type { ConnectionStatus, IntegrationType } from "@/lib/data/types";

import { Card } from "@/components/ui/card";

type ConnectionRow = {
  id: string;
  displayName: string;
  type: IntegrationType;
  status: ConnectionStatus;
  scope: string | null;
  lastSyncAt: Date | null;
};

type IntegrationGridProps = {
  rows: ConnectionRow[];
};

function statusColor(status: ConnectionStatus) {
  if (status === "CONNECTED") {
    return "bg-emerald-400/15 text-emerald-300";
  }

  if (status === "ERROR") {
    return "bg-red-400/15 text-red-300";
  }

  return "bg-slate-400/15 text-slate-300";
}

export function IntegrationGrid({ rows }: IntegrationGridProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">{row.type}</p>
              <h3 className="mt-1 font-display text-xl text-[var(--text-100)]">{row.displayName}</h3>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs ${statusColor(row.status)}`}>
              {row.status}
            </span>
          </div>

          <p className="mt-4 text-sm text-[var(--text-300)]">Scopes: {row.scope ?? "Not set"}</p>
          <p className="mt-2 text-sm text-[var(--text-400)]">
            Last sync: {row.lastSyncAt ? row.lastSyncAt.toLocaleString() : "Never"}
          </p>
        </Card>
      ))}
    </div>
  );
}
