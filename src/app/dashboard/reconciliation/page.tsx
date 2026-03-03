import { Clock3, FileSpreadsheet, TriangleAlert } from "lucide-react";

import { RunLaborDistributionButton } from "@/components/dashboard/run-labor-distribution-button";
import { RunReconciliationButton } from "@/components/dashboard/run-reconciliation-button";
import { Card } from "@/components/ui/card";
import { getTeamContext } from "@/lib/auth/tenancy";
import { getImportJobsByTeamRuntime, getReconciliationByTeamRuntime } from "@/lib/data/runtime-data";
import { formatCurrency } from "@/lib/utils";

export default async function ReconciliationPage() {
  const context = await getTeamContext();

  const jobs = await getImportJobsByTeamRuntime(context.activeTeamId);
  const runs = await getReconciliationByTeamRuntime(context.activeTeamId);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">Workflow control</p>
            <h2 className="font-display text-xl text-[var(--text-100)]">Automated Workflows</h2>
            <p className="mt-1 text-sm text-[var(--text-300)]">
              Run source-to-target reconciliations and post labor cost distribution journal entries from ADP wages
              allocated by Unanet timesheets.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <RunReconciliationButton teamId={context.activeTeamId} />
            <RunLaborDistributionButton teamId={context.activeTeamId} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center gap-2 text-[var(--brand-300)]">
            <FileSpreadsheet className="h-5 w-5" />
            <h2 className="font-display text-xl text-[var(--text-100)]">Import execution log</h2>
          </div>

          <div className="mt-4 space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-[var(--text-100)]">
                    {job.source} {job.objectType}
                  </p>
                  <span className="rounded-full bg-[var(--surface-700)] px-2 py-1 text-xs text-[var(--text-200)]">
                    {job.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-300)]">Run key: {job.runKey}</p>
                <p className="mt-1 text-sm text-[var(--text-400)]">
                  Rows {job.successCount.toLocaleString()} success / {job.failureCount.toLocaleString()} failed
                </p>
                <p className="mt-1 text-sm text-[var(--text-400)]">
                  Control total: {formatCurrency(job.controlTotal)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-[var(--accent-300)]">
            <Clock3 className="h-5 w-5" />
            <h2 className="font-display text-xl text-[var(--text-100)]">Reconciliation checks</h2>
          </div>

          <div className="mt-4 space-y-3">
            {runs.map((run) => (
              <div
                key={run.id}
                className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-[var(--text-100)]">
                    {run.sourceSystem} {"->"} {run.targetSystem}
                  </p>
                  <span className="rounded-full bg-[var(--surface-700)] px-2 py-1 text-xs text-[var(--text-200)]">
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-300)]">Period: {run.periodKey}</p>
                <p className="mt-1 text-sm text-[var(--text-400)]">
                  Source: {formatCurrency(run.sourceAmount)} | Target: {formatCurrency(run.targetAmount)}
                </p>
                <p className="mt-1 text-sm text-[var(--text-400)]">
                  Variance: {formatCurrency(run.varianceAmount)} ({(run.variancePercent * 100).toFixed(2)}%)
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4" />
              <span>All variances above 0.50% should require two-person approval.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
