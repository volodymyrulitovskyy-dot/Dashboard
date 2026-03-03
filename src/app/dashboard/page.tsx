import { getTeamContext } from "@/lib/auth/tenancy";
import { getImportJobsByTeamRuntime, getReconciliationByTeamRuntime } from "@/lib/data/runtime-data";
import { formatCurrency } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ReconciliationTable } from "@/components/dashboard/reconciliation-table";

export default async function DashboardOverviewPage() {
  const context = await getTeamContext();

  const jobs = await getImportJobsByTeamRuntime(context.activeTeamId);
  const reconciliationRuns = await getReconciliationByTeamRuntime(context.activeTeamId);

  const importedRows = jobs.reduce((sum, job) => sum + job.successCount, 0);
  const failedRows = jobs.reduce((sum, job) => sum + job.failureCount, 0);
  const controlTotal = jobs.reduce((sum, job) => sum + job.controlTotal, 0);
  const mismatchCount = reconciliationRuns.filter(
    (run) => run.status !== "MATCHED",
  ).length;

  const chartByPeriod = new Map<
    string,
    { name: string; ar: number; ap: number; glVariance: number }
  >();

  for (const run of reconciliationRuns) {
    const existing =
      chartByPeriod.get(run.periodKey) ??
      {
        name: run.periodKey.slice(5),
        ar: 0,
        ap: 0,
        glVariance: 0,
      };

    const sourceSystem = run.sourceSystem.toUpperCase();
    if (sourceSystem.includes("AR")) {
      existing.ar = run.sourceAmount;
    } else if (sourceSystem.includes("AP")) {
      existing.ap = run.sourceAmount;
    } else if (sourceSystem.includes("GL")) {
      existing.glVariance = Math.abs(run.variancePercent);
    }

    chartByPeriod.set(run.periodKey, existing);
  }

  const chartData = Array.from(chartByPeriod.entries())
    .sort(([leftPeriod], [rightPeriod]) => leftPeriod.localeCompare(rightPeriod))
    .slice(-6)
    .map(([, value]) => value);

  const chartSeries = chartData.length
    ? chartData
    : [{ name: "Current", ar: 0, ap: 0, glVariance: 0 }];

  const tableRows = reconciliationRuns.map((run) => ({
    id: run.id,
    sourceSystem: run.sourceSystem,
    targetSystem: run.targetSystem,
    sourceAmount: run.sourceAmount,
    targetAmount: run.targetAmount,
    varianceAmount: run.varianceAmount,
    variancePercent: run.variancePercent,
    status: run.status,
  }));

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Rows Imported"
          value={importedRows.toLocaleString()}
          trendLabel="+12.3% week over week"
          trendDirection="up"
        />
        <KpiCard
          title="Control Total"
          value={formatCurrency(controlTotal)}
          trendLabel="+2.1% period over period"
          trendDirection="up"
        />
        <KpiCard
          title="Exceptions"
          value={failedRows.toLocaleString()}
          trendLabel={failedRows === 0 ? "No failures" : "Needs review"}
          trendDirection={failedRows === 0 ? "flat" : "down"}
        />
        <KpiCard
          title="Open Variances"
          value={mismatchCount.toLocaleString()}
          trendLabel={mismatchCount === 0 ? "Fully matched" : "Investigate items"}
          trendDirection={mismatchCount === 0 ? "flat" : "down"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <RevenueChart data={chartSeries} />
        <ReconciliationTable rows={tableRows} />
      </section>
    </div>
  );
}
