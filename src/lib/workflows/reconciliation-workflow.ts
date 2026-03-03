import type { IntegrationType, ReconciliationStatus } from "@prisma/client";

import { logAuditEvent } from "@/lib/audit";
import { ensureTeamRecord } from "@/lib/data/runtime-data";
import { prisma } from "@/lib/db";
import { getNetSuiteLedgerTotals } from "@/lib/integrations/netsuite/client";
import { getRampApSnapshot } from "@/lib/integrations/ramp/client";
import { getUnanetLedgerTotals } from "@/lib/integrations/unanet/client";
import { logger } from "@/lib/logger";
import { runBalanceReconciliation } from "@/lib/reconciliation/engine";
import { buildPeriodWindow, getCurrentPeriodKey } from "@/lib/workflows/period";

type WorkflowTrigger = "manual" | "scheduled";

type ImportStepResult = {
  source: IntegrationType;
  status: "SUCCEEDED" | "FAILED";
  runKey: string;
  objectType: string;
  controlTotal: number;
  rowCount: number;
  successCount: number;
  failureCount: number;
  errorSummary?: string;
  details: Record<string, unknown>;
};

type ReconciliationStepResult = {
  id?: string;
  sourceSystem: string;
  targetSystem: string;
  status: ReconciliationStatus;
  sourceAmount: number;
  targetAmount: number;
  varianceAmount: number;
  variancePercent: number;
  notes?: string;
};

export type ReconciliationWorkflowInput = {
  teamId: string;
  executedByUserId?: string;
  periodKey?: string;
  trigger: WorkflowTrigger;
  dryRun?: boolean;
};

export type ReconciliationWorkflowResult = {
  teamId: string;
  trigger: WorkflowTrigger;
  periodKey: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  importSteps: ImportStepResult[];
  reconciliationSteps: ReconciliationStepResult[];
  totals: {
    rampAp?: number;
    unanetAr?: number;
    unanetGl?: number;
    netsuiteAp?: number;
    netsuiteAr?: number;
    netsuiteGl?: number;
  };
  errors: string[];
};

const integrationDefaults: Record<
  IntegrationType,
  {
    displayName: string;
    scope: string;
  }
> = {
  RAMP: {
    displayName: "Ramp API",
    scope: "bills:read transactions:read",
  },
  NETSUITE: {
    displayName: "NetSuite API",
    scope: "rest_webservices",
  },
  UNANET: {
    displayName: "Unanet API",
    scope: "ledger:read",
  },
};

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown workflow error";
}

function buildRunKey(source: IntegrationType, periodKey: string) {
  return `${source.toLowerCase()}-api-${periodKey}-${Date.now().toString(36)}`;
}

function computeReconciliation(
  sourceAmount: number,
  targetAmount: number,
): Pick<
  ReconciliationStepResult,
  "status" | "sourceAmount" | "targetAmount" | "varianceAmount" | "variancePercent"
> {
  const roundedSource = round2(sourceAmount);
  const roundedTarget = round2(targetAmount);
  const varianceAmount = round2(roundedSource - roundedTarget);
  const variancePercent =
    roundedSource === 0 ? 0 : round2(varianceAmount / roundedSource);

  const status: ReconciliationStatus =
    Math.abs(varianceAmount) < 0.005
      ? "MATCHED"
      : Math.abs(variancePercent) <= 0.005
        ? "VARIANCE"
        : "PENDING";

  return {
    status,
    sourceAmount: roundedSource,
    targetAmount: roundedTarget,
    varianceAmount,
    variancePercent,
  };
}

async function upsertIntegrationStatus(input: {
  teamId: string;
  source: IntegrationType;
  status: "CONNECTED" | "ERROR";
  metadata: Record<string, unknown>;
  dryRun: boolean;
}) {
  if (input.dryRun) {
    return;
  }

  const defaults = integrationDefaults[input.source];

  await prisma.integrationConnection.upsert({
    where: {
      teamId_type: {
        teamId: input.teamId,
        type: input.source,
      },
    },
    update: {
      displayName: defaults.displayName,
      scope: defaults.scope,
      status: input.status,
      lastSyncAt: input.status === "CONNECTED" ? new Date() : undefined,
      metadata: JSON.stringify(input.metadata),
    },
    create: {
      teamId: input.teamId,
      type: input.source,
      displayName: defaults.displayName,
      scope: defaults.scope,
      status: input.status,
      lastSyncAt: input.status === "CONNECTED" ? new Date() : null,
      metadata: JSON.stringify(input.metadata),
    },
  });
}

async function persistImportStep(input: {
  teamId: string;
  source: IntegrationType;
  status: "SUCCEEDED" | "FAILED";
  runKey: string;
  objectType: string;
  controlTotal: number;
  rowCount: number;
  successCount: number;
  failureCount: number;
  errorSummary?: string;
  startedAt: Date;
  completedAt: Date;
  createdByUser?: string;
  dryRun: boolean;
}) {
  if (input.dryRun) {
    return;
  }

  await prisma.dataImportJob.create({
    data: {
      teamId: input.teamId,
      source: input.source,
      status: input.status,
      objectType: input.objectType,
      runKey: input.runKey,
      rowCount: input.rowCount,
      successCount: input.successCount,
      failureCount: input.failureCount,
      controlTotal: round2(input.controlTotal),
      errorSummary: input.errorSummary,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      createdByUser: input.createdByUser,
    },
  });
}

async function executeImportStep(
  input: {
    teamId: string;
    periodKey: string;
    source: IntegrationType;
    objectType: string;
    executedByUserId?: string;
    dryRun: boolean;
  },
  fetcher: () => Promise<{
    controlTotal: number;
    rowCount: number;
    successCount: number;
    details: Record<string, unknown>;
  }>,
) {
  const startedAt = new Date();
  const runKey = buildRunKey(input.source, input.periodKey);

  try {
    const payload = await fetcher();
    const completedAt = new Date();

    await persistImportStep({
      teamId: input.teamId,
      source: input.source,
      status: "SUCCEEDED",
      runKey,
      objectType: input.objectType,
      controlTotal: payload.controlTotal,
      rowCount: payload.rowCount,
      successCount: payload.successCount,
      failureCount: 0,
      startedAt,
      completedAt,
      createdByUser: input.executedByUserId,
      dryRun: input.dryRun,
    });

    await upsertIntegrationStatus({
      teamId: input.teamId,
      source: input.source,
      status: "CONNECTED",
      metadata: {
        objectType: input.objectType,
        runKey,
        periodKey: input.periodKey,
      },
      dryRun: input.dryRun,
    });

    return {
      source: input.source,
      status: "SUCCEEDED",
      runKey,
      objectType: input.objectType,
      controlTotal: round2(payload.controlTotal),
      rowCount: payload.rowCount,
      successCount: payload.successCount,
      failureCount: 0,
      details: payload.details,
    } satisfies ImportStepResult;
  } catch (error) {
    const completedAt = new Date();
    const errorSummary = asErrorMessage(error);

    await persistImportStep({
      teamId: input.teamId,
      source: input.source,
      status: "FAILED",
      runKey,
      objectType: input.objectType,
      controlTotal: 0,
      rowCount: 0,
      successCount: 0,
      failureCount: 1,
      errorSummary,
      startedAt,
      completedAt,
      createdByUser: input.executedByUserId,
      dryRun: input.dryRun,
    });

    await upsertIntegrationStatus({
      teamId: input.teamId,
      source: input.source,
      status: "ERROR",
      metadata: {
        objectType: input.objectType,
        runKey,
        periodKey: input.periodKey,
        error: errorSummary,
      },
      dryRun: input.dryRun,
    });

    return {
      source: input.source,
      status: "FAILED",
      runKey,
      objectType: input.objectType,
      controlTotal: 0,
      rowCount: 0,
      successCount: 0,
      failureCount: 1,
      errorSummary,
      details: {},
    } satisfies ImportStepResult;
  }
}

async function persistReconciliationStep(input: {
  teamId: string;
  periodKey: string;
  sourceSystem: string;
  targetSystem: string;
  sourceAmount: number;
  targetAmount: number;
  notes?: string;
  executedByUserId: string;
  dryRun: boolean;
}) {
  const calculated = computeReconciliation(input.sourceAmount, input.targetAmount);

  if (input.dryRun) {
    return {
      ...calculated,
      sourceSystem: input.sourceSystem,
      targetSystem: input.targetSystem,
      notes: input.notes,
    } satisfies ReconciliationStepResult;
  }

  const record = await runBalanceReconciliation({
    teamId: input.teamId,
    periodKey: input.periodKey,
    sourceSystem: input.sourceSystem,
    targetSystem: input.targetSystem,
    sourceAmount: calculated.sourceAmount,
    targetAmount: calculated.targetAmount,
    executedByUserId: input.executedByUserId,
    notes: input.notes,
  });

  return {
    id: record.id,
    sourceSystem: record.sourceSystem,
    targetSystem: record.targetSystem,
    status: record.status,
    sourceAmount: record.sourceAmount,
    targetAmount: record.targetAmount,
    varianceAmount: record.varianceAmount,
    variancePercent: record.variancePercent,
    notes: record.notes ?? undefined,
  } satisfies ReconciliationStepResult;
}

export async function runAutomatedReconciliationWorkflow(
  input: ReconciliationWorkflowInput,
): Promise<ReconciliationWorkflowResult> {
  const startedAt = new Date();
  const requestedDryRun = Boolean(input.dryRun);
  let effectiveDryRun = requestedDryRun;
  const periodKey = input.periodKey ?? getCurrentPeriodKey();
  const period = buildPeriodWindow(periodKey);
  const executedByUserId = input.executedByUserId ?? "system-workflow";
  const errors: string[] = [];

  if (!effectiveDryRun) {
    try {
      await ensureTeamRecord(input.teamId);
    } catch (error) {
      const message = asErrorMessage(error);
      logger.warn(
        {
          error: message,
          teamId: input.teamId,
        },
        "workflow persistence unavailable, continuing in dry-run mode",
      );
      errors.push(`Persistence unavailable, workflow continued in dry-run mode: ${message}`);
      effectiveDryRun = true;
    }
  }

  const rampStep = await executeImportStep(
    {
      teamId: input.teamId,
      periodKey,
      source: "RAMP",
      objectType: "AP_LEDGER_TOTALS",
      executedByUserId,
      dryRun: effectiveDryRun,
    },
    async () => {
      const snapshot = await getRampApSnapshot({
        periodStartIso: period.periodStartIso,
        periodEndIso: period.periodEndIso,
      });

      return {
        controlTotal: snapshot.apTotal,
        rowCount: snapshot.billCount + snapshot.cardTransactionCount,
        successCount: snapshot.billCount + snapshot.cardTransactionCount,
        details: snapshot,
      };
    },
  );

  const unanetStep = await executeImportStep(
    {
      teamId: input.teamId,
      periodKey,
      source: "UNANET",
      objectType: "LEDGER_TOTALS",
      executedByUserId,
      dryRun: effectiveDryRun,
    },
    async () => {
      const totals = await getUnanetLedgerTotals({
        periodKey,
        periodStartDate: period.periodStartDate,
        periodEndDate: period.periodEndDate,
      });

      return {
        controlTotal: totals.glTotal,
        rowCount: Math.max(1, totals.rowCount),
        successCount: Math.max(1, totals.rowCount),
        details: totals,
      };
    },
  );

  const netSuiteStep = await executeImportStep(
    {
      teamId: input.teamId,
      periodKey,
      source: "NETSUITE",
      objectType: "LEDGER_TOTALS",
      executedByUserId,
      dryRun: effectiveDryRun,
    },
    async () => {
      const totals = await getNetSuiteLedgerTotals({
        periodKey,
        periodStartDate: period.periodStartDate,
        periodEndDate: period.periodEndDate,
      });

      return {
        controlTotal: totals.glTotal,
        rowCount: 1,
        successCount: 1,
        details: totals,
      };
    },
  );

  const importSteps = [rampStep, unanetStep, netSuiteStep];

  for (const step of importSteps) {
    if (step.status === "FAILED" && step.errorSummary) {
      errors.push(`${step.source}: ${step.errorSummary}`);
    }
  }

  const totals = {
    rampAp:
      rampStep.status === "SUCCEEDED"
        ? (rampStep.details.apTotal as number | undefined)
        : undefined,
    unanetAr:
      unanetStep.status === "SUCCEEDED"
        ? (unanetStep.details.arTotal as number | undefined)
        : undefined,
    unanetGl:
      unanetStep.status === "SUCCEEDED"
        ? (unanetStep.details.glTotal as number | undefined)
        : undefined,
    netsuiteAp:
      netSuiteStep.status === "SUCCEEDED"
        ? (netSuiteStep.details.apTotal as number | undefined)
        : undefined,
    netsuiteAr:
      netSuiteStep.status === "SUCCEEDED"
        ? (netSuiteStep.details.arTotal as number | undefined)
        : undefined,
    netsuiteGl:
      netSuiteStep.status === "SUCCEEDED"
        ? (netSuiteStep.details.glTotal as number | undefined)
        : undefined,
  };

  const reconciliationSteps: ReconciliationStepResult[] = [];
  const workflowNote = `Automated ${input.trigger} workflow run`;

  if (
    typeof totals.rampAp === "number" &&
    typeof totals.netsuiteAp === "number"
  ) {
    reconciliationSteps.push(
      await persistReconciliationStep({
        teamId: input.teamId,
        periodKey,
        sourceSystem: "Ramp AP",
        targetSystem: "NetSuite AP",
        sourceAmount: totals.rampAp,
        targetAmount: totals.netsuiteAp,
        notes: workflowNote,
        executedByUserId,
        dryRun: effectiveDryRun,
      }),
    );
  }

  if (
    typeof totals.unanetAr === "number" &&
    typeof totals.netsuiteAr === "number"
  ) {
    reconciliationSteps.push(
      await persistReconciliationStep({
        teamId: input.teamId,
        periodKey,
        sourceSystem: "Unanet AR",
        targetSystem: "NetSuite AR",
        sourceAmount: totals.unanetAr,
        targetAmount: totals.netsuiteAr,
        notes: workflowNote,
        executedByUserId,
        dryRun: effectiveDryRun,
      }),
    );
  }

  if (
    typeof totals.unanetGl === "number" &&
    typeof totals.netsuiteGl === "number"
  ) {
    reconciliationSteps.push(
      await persistReconciliationStep({
        teamId: input.teamId,
        periodKey,
        sourceSystem: "Unanet GL",
        targetSystem: "NetSuite GL",
        sourceAmount: totals.unanetGl,
        targetAmount: totals.netsuiteGl,
        notes: workflowNote,
        executedByUserId,
        dryRun: effectiveDryRun,
      }),
    );
  }

  if (!effectiveDryRun) {
    await logAuditEvent({
      action: "workflow.reconciliation.run",
      category: "workflow",
      teamId: input.teamId,
      userId: input.executedByUserId,
      metadata: {
        trigger: input.trigger,
        periodKey,
        importStepCount: importSteps.length,
        failedImportSteps: importSteps.filter((step) => step.status === "FAILED")
          .length,
        reconciliationStepCount: reconciliationSteps.length,
        errors,
      },
    });
  }

  const completedAt = new Date();
  const result = {
    teamId: input.teamId,
    trigger: input.trigger,
    periodKey,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    dryRun: effectiveDryRun,
    importSteps,
    reconciliationSteps,
    totals,
    errors,
  } satisfies ReconciliationWorkflowResult;

  logger.info(
    {
      teamId: input.teamId,
      trigger: input.trigger,
      periodKey,
      importSteps: importSteps.map((step) => ({
        source: step.source,
        status: step.status,
      })),
      reconciliationSteps: reconciliationSteps.length,
      errors: errors.length,
    },
    "reconciliation workflow completed",
  );

  return result;
}
