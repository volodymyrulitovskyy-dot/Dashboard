"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type RunReconciliationButtonProps = {
  teamId: string;
};

function getCurrentPeriodMonthInput() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function RunReconciliationButton({ teamId }: RunReconciliationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodKey, setPeriodKey] = useState(getCurrentPeriodMonthInput);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const buttonLabel = useMemo(() => {
    if (isPending) {
      return "Running...";
    }

    return "Run Reconciliation";
  }, [isPending]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="workflow-period" className="text-xs uppercase tracking-[0.12em] text-[var(--text-400)]">
        Period
      </label>
      <input
        id="workflow-period"
        type="month"
        className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-100)]"
        value={periodKey}
        onChange={(event) => setPeriodKey(event.target.value)}
      />
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() => {
          setErrorMessage(null);
          setSuccessMessage(null);

          startTransition(async () => {
            try {
              const response = await fetch("/api/workflows/reconcile", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  teamId,
                  periodKey,
                }),
              });
              const payload = (await response
                .json()
                .catch(() => null)) as {
                ok?: boolean;
                error?: string;
                result?: {
                  reconciliationSteps?: Array<unknown>;
                  importSteps?: Array<unknown>;
                };
              } | null;

              if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error ?? "Workflow run failed");
              }

              const importStepCount = payload.result?.importSteps?.length ?? 0;
              const reconciliationStepCount =
                payload.result?.reconciliationSteps?.length ?? 0;

              setSuccessMessage(
                `Completed. ${importStepCount} imports and ${reconciliationStepCount} reconciliations recorded.`,
              );
              router.refresh();
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : "Workflow run failed",
              );
            }
          });
        }}
      >
        {buttonLabel}
      </Button>

      {errorMessage ? (
        <p className="w-full text-sm text-red-300">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="w-full text-sm text-emerald-300">{successMessage}</p>
      ) : null}
    </div>
  );
}
