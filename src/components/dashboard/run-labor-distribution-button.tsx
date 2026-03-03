"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type RunLaborDistributionButtonProps = {
  teamId: string;
};

function getCurrentPeriodMonthInput() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function RunLaborDistributionButton({
  teamId,
}: RunLaborDistributionButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodKey, setPeriodKey] = useState(getCurrentPeriodMonthInput);
  const [allowPartialAllocation, setAllowPartialAllocation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const buttonLabel = useMemo(() => {
    if (isPending) {
      return "Posting...";
    }

    return "Run Labor Distribution";
  }, [isPending]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="labor-period" className="text-xs uppercase tracking-[0.12em] text-[var(--text-400)]">
        Period
      </label>
      <input
        id="labor-period"
        type="month"
        className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-100)]"
        value={periodKey}
        onChange={(event) => setPeriodKey(event.target.value)}
      />

      <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-xs text-[var(--text-200)]">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-[var(--border-soft)] bg-[var(--surface-900)]"
          checked={allowPartialAllocation}
          onChange={(event) => setAllowPartialAllocation(event.target.checked)}
        />
        Allow partial
      </label>

      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setErrorMessage(null);
          setSuccessMessage(null);

          startTransition(async () => {
            try {
              const response = await fetch("/api/workflows/labor-distribution", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  teamId,
                  periodKey,
                  allowPartialAllocation,
                }),
              });

              const payload = (await response
                .json()
                .catch(() => null)) as {
                ok?: boolean;
                error?: string;
                result?: {
                  journalEntry?: {
                    posted?: boolean;
                    journalEntryId?: string;
                  };
                  allocation?: {
                    lineCount?: number;
                    totalAllocatedAmount?: number;
                  };
                  errors?: string[];
                };
              } | null;

              if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error ?? "Labor distribution run failed");
              }

              const lineCount = payload.result?.allocation?.lineCount ?? 0;
              const totalAllocated = payload.result?.allocation?.totalAllocatedAmount ?? 0;
              const journalEntryId = payload.result?.journalEntry?.journalEntryId;

              const message = journalEntryId
                ? `Posted JE ${journalEntryId}. ${lineCount} allocation lines, ${totalAllocated.toFixed(2)} total.`
                : `Completed in dry-run mode. ${lineCount} allocation lines, ${totalAllocated.toFixed(2)} total.`;

              setSuccessMessage(message);
              router.refresh();
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : "Labor distribution run failed",
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
