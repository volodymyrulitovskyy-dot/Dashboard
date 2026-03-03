import type { IntegrationType } from "@prisma/client";

import { logAuditEvent } from "@/lib/audit";
import { ensureTeamRecord } from "@/lib/data/runtime-data";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getAdpGrossWagesByEmployee } from "@/lib/integrations/adp/client";
import {
  createNetSuiteJournalEntry,
  type NetSuiteJournalEntryLineInput,
} from "@/lib/integrations/netsuite/client";
import { getUnanetTimesheetsByProject } from "@/lib/integrations/unanet/client";
import { logger } from "@/lib/logger";
import { runBalanceReconciliation } from "@/lib/reconciliation/engine";
import { allocateLaborCostByTimesheets } from "@/lib/workflows/labor-allocation";
import { buildPeriodWindow, getCurrentPeriodKey } from "@/lib/workflows/period";

type WorkflowTrigger = "manual" | "scheduled";

export type LaborCostDistributionWorkflowInput = {
  teamId: string;
  periodKey?: string;
  executedByUserId?: string;
  trigger: WorkflowTrigger;
  dryRun?: boolean;
  allowPartialAllocation?: boolean;
};

type SourceImportSummary = {
  source: "UNANET_TIMESHEETS" | "ADP_GROSS_WAGES";
  rowCount: number;
  controlTotal: number;
};

type JournalEntrySummary = {
  posted: boolean;
  journalEntryId?: string;
  externalId?: string;
  debitLineCount: number;
  totalAmount: number;
};

type ReconciliationSummary = {
  id?: string;
  status: "PENDING" | "MATCHED" | "VARIANCE";
  sourceAmount: number;
  targetAmount: number;
  varianceAmount: number;
  variancePercent: number;
};

export type LaborCostDistributionWorkflowResult = {
  teamId: string;
  trigger: WorkflowTrigger;
  periodKey: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  sources: SourceImportSummary[];
  allocation: {
    lineCount: number;
    employeeCount: number;
    projectCount: number;
    totalHours: number;
    totalGrossWages: number;
    totalAllocatedAmount: number;
    employeesWithoutTimesheets: string[];
    employeesWithoutGrossWages: string[];
  };
  journalEntry: JournalEntrySummary;
  reconciliation: ReconciliationSummary;
  warnings: string[];
  errors: string[];
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

function buildRunKey(source: IntegrationType, prefix: string, periodKey: string) {
  return `${source.toLowerCase()}-${prefix}-${periodKey}-${Date.now().toString(36)}`;
}

function parseProjectIdMap() {
  const raw = env.NETSUITE_LABOR_PROJECT_ID_MAP;
  if (!raw || raw.trim().length === 0) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "string") {
        normalized[key.trim()] = value.trim();
      }
    }

    return normalized;
  } catch {
    return {} as Record<string, string>;
  }
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

  const defaults: Record<IntegrationType, { displayName: string; scope: string }> = {
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
      scope: "ledger:read timesheets:read",
    },
  };

  const defaultConfig = defaults[input.source];
  await prisma.integrationConnection.upsert({
    where: {
      teamId_type: {
        teamId: input.teamId,
        type: input.source,
      },
    },
    update: {
      displayName: defaultConfig.displayName,
      scope: defaultConfig.scope,
      status: input.status,
      lastSyncAt: input.status === "CONNECTED" ? new Date() : undefined,
      metadata: JSON.stringify(input.metadata),
    },
    create: {
      teamId: input.teamId,
      type: input.source,
      displayName: defaultConfig.displayName,
      scope: defaultConfig.scope,
      status: input.status,
      lastSyncAt: input.status === "CONNECTED" ? new Date() : null,
      metadata: JSON.stringify(input.metadata),
    },
  });
}

async function persistImportJob(input: {
  teamId: string;
  source: IntegrationType;
  status: "SUCCEEDED" | "FAILED";
  objectType: string;
  runKey: string;
  rowCount: number;
  successCount: number;
  failureCount: number;
  controlTotal: number;
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

function buildLaborJournalEntryLines(input: {
  periodKey: string;
  projectAmounts: Map<string, number>;
  projectFieldId: string;
  projectIdMap: Record<string, string>;
}) {
  const debitAccountId = env.NETSUITE_LABOR_DEBIT_ACCOUNT_ID;
  const creditAccountId = env.NETSUITE_LABOR_CREDIT_ACCOUNT_ID;
  if (!debitAccountId || !creditAccountId) {
    throw new Error(
      "NETSUITE_LABOR_DEBIT_ACCOUNT_ID and NETSUITE_LABOR_CREDIT_ACCOUNT_ID are required",
    );
  }

  const memoPrefix = env.NETSUITE_LABOR_MEMO_PREFIX ?? "Labor Allocation";
  const commonDimensions = {
    department:
      env.NETSUITE_LABOR_DEPARTMENT_ID && env.NETSUITE_LABOR_DEPARTMENT_ID.trim().length > 0
        ? env.NETSUITE_LABOR_DEPARTMENT_ID.trim()
        : undefined,
    class:
      env.NETSUITE_LABOR_CLASS_ID && env.NETSUITE_LABOR_CLASS_ID.trim().length > 0
        ? env.NETSUITE_LABOR_CLASS_ID.trim()
        : undefined,
    location:
      env.NETSUITE_LABOR_LOCATION_ID && env.NETSUITE_LABOR_LOCATION_ID.trim().length > 0
        ? env.NETSUITE_LABOR_LOCATION_ID.trim()
        : undefined,
  };

  const debitLines: NetSuiteJournalEntryLineInput[] = [];
  let totalDebit = 0;

  for (const [projectExternalId, amount] of input.projectAmounts.entries()) {
    if (amount <= 0) {
      continue;
    }

    totalDebit = round2(totalDebit + amount);
    const projectInternalId = input.projectIdMap[projectExternalId] ?? projectExternalId;
    const dimensions: Record<string, string | undefined> = {
      ...commonDimensions,
    };

    if (input.projectFieldId.trim().length > 0) {
      dimensions[input.projectFieldId] = projectInternalId;
    }

    debitLines.push({
      accountId: debitAccountId,
      debit: amount,
      memo: `${memoPrefix} ${input.periodKey} ${projectExternalId}`,
      dimensions,
    });
  }

  const creditLine: NetSuiteJournalEntryLineInput = {
    accountId: creditAccountId,
    credit: totalDebit,
    memo: `${memoPrefix} ${input.periodKey} payroll clearing`,
    dimensions: {
      department: commonDimensions.department,
      class: commonDimensions.class,
      location: commonDimensions.location,
    },
  };

  return {
    lines: [...debitLines, creditLine],
    totalAmount: totalDebit,
  };
}

function summarizeReconciliation(sourceAmount: number, targetAmount: number) {
  const roundedSource = round2(sourceAmount);
  const roundedTarget = round2(targetAmount);
  const varianceAmount = round2(roundedSource - roundedTarget);
  const variancePercent =
    roundedSource === 0 ? 0 : round2(varianceAmount / roundedSource);

  const status =
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
  } satisfies ReconciliationSummary;
}

export async function runLaborCostDistributionWorkflow(
  input: LaborCostDistributionWorkflowInput,
): Promise<LaborCostDistributionWorkflowResult> {
  const startedAt = new Date();
  const requestedDryRun = Boolean(input.dryRun);
  const warnings: string[] = [];
  const errors: string[] = [];
  let effectiveDryRun = requestedDryRun;
  const periodKey = input.periodKey ?? getCurrentPeriodKey();
  const period = buildPeriodWindow(periodKey);
  const executedByUserId = input.executedByUserId ?? "system-workflow";

  if (!effectiveDryRun) {
    try {
      await ensureTeamRecord(input.teamId);
    } catch (error) {
      const message = asErrorMessage(error);
      warnings.push(`Persistence unavailable, workflow continued in dry-run mode: ${message}`);
      effectiveDryRun = true;
    }
  }

  const unanetRunKey = buildRunKey("UNANET", "timesheets", periodKey);
  const netSuiteRunKey = buildRunKey("NETSUITE", "labor-je", periodKey);

  const timesheetStartedAt = new Date();
  let timesheetResult: Awaited<ReturnType<typeof getUnanetTimesheetsByProject>> | null = null;
  try {
    timesheetResult = await getUnanetTimesheetsByProject({
      periodKey,
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
    });

    await persistImportJob({
      teamId: input.teamId,
      source: "UNANET",
      status: "SUCCEEDED",
      objectType: "TIMESHEET_HOURS_BY_PROJECT",
      runKey: unanetRunKey,
      rowCount: timesheetResult.rowCount,
      successCount: timesheetResult.rowCount,
      failureCount: 0,
      controlTotal: timesheetResult.totalHours,
      startedAt: timesheetStartedAt,
      completedAt: new Date(),
      createdByUser: executedByUserId,
      dryRun: effectiveDryRun,
    });

    await upsertIntegrationStatus({
      teamId: input.teamId,
      source: "UNANET",
      status: "CONNECTED",
      metadata: {
        runKey: unanetRunKey,
        objectType: "TIMESHEET_HOURS_BY_PROJECT",
        periodKey,
      },
      dryRun: effectiveDryRun,
    });
  } catch (error) {
    const errorSummary = asErrorMessage(error);
    errors.push(`UNANET_TIMESHEETS: ${errorSummary}`);
    await persistImportJob({
      teamId: input.teamId,
      source: "UNANET",
      status: "FAILED",
      objectType: "TIMESHEET_HOURS_BY_PROJECT",
      runKey: unanetRunKey,
      rowCount: 0,
      successCount: 0,
      failureCount: 1,
      controlTotal: 0,
      errorSummary,
      startedAt: timesheetStartedAt,
      completedAt: new Date(),
      createdByUser: executedByUserId,
      dryRun: effectiveDryRun,
    });

    await upsertIntegrationStatus({
      teamId: input.teamId,
      source: "UNANET",
      status: "ERROR",
      metadata: {
        runKey: unanetRunKey,
        objectType: "TIMESHEET_HOURS_BY_PROJECT",
        periodKey,
        error: errorSummary,
      },
      dryRun: effectiveDryRun,
    });
  }

  let adpResult: Awaited<ReturnType<typeof getAdpGrossWagesByEmployee>> | null = null;
  try {
    adpResult = await getAdpGrossWagesByEmployee({
      periodKey,
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
    });
  } catch (error) {
    errors.push(`ADP_GROSS_WAGES: ${asErrorMessage(error)}`);
  }

  if (!timesheetResult || !adpResult) {
    const completedAt = new Date();
    const fallbackReconciliation = summarizeReconciliation(0, 0);
    return {
      teamId: input.teamId,
      trigger: input.trigger,
      periodKey,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      dryRun: effectiveDryRun,
      sources: [
        {
          source: "UNANET_TIMESHEETS",
          rowCount: timesheetResult?.rowCount ?? 0,
          controlTotal: timesheetResult?.totalHours ?? 0,
        },
        {
          source: "ADP_GROSS_WAGES",
          rowCount: adpResult?.rowCount ?? 0,
          controlTotal: adpResult?.totalGrossWages ?? 0,
        },
      ],
      allocation: {
        lineCount: 0,
        employeeCount: 0,
        projectCount: 0,
        totalHours: timesheetResult?.totalHours ?? 0,
        totalGrossWages: adpResult?.totalGrossWages ?? 0,
        totalAllocatedAmount: 0,
        employeesWithoutTimesheets: [],
        employeesWithoutGrossWages: [],
      },
      journalEntry: {
        posted: false,
        debitLineCount: 0,
        totalAmount: 0,
      },
      reconciliation: fallbackReconciliation,
      warnings,
      errors,
    };
  }

  const allocation = allocateLaborCostByTimesheets({
    timesheets: timesheetResult.rows.map((row) => ({
      employeeExternalId: row.employeeExternalId,
      projectExternalId: row.projectExternalId,
      hours: row.hours,
    })),
    grossWages: adpResult.rows.map((row) => ({
      employeeExternalId: row.employeeExternalId,
      grossWages: row.grossWages,
    })),
  });

  if (allocation.employeesWithoutTimesheets.length > 0) {
    warnings.push(
      `${allocation.employeesWithoutTimesheets.length} ADP employees had no timesheets in the selected period`,
    );
  }

  if (allocation.employeesWithoutGrossWages.length > 0) {
    warnings.push(
      `${allocation.employeesWithoutGrossWages.length} timesheet employees had no ADP gross wages in the selected period`,
    );
  }

  if (
    allocation.employeesWithoutTimesheets.length > 0 &&
    !input.allowPartialAllocation
  ) {
    errors.push(
      "Labor allocation halted because some ADP employees have no timesheets. Set allowPartialAllocation=true to continue with partial posting.",
    );
  }

  if (allocation.totalAllocatedAmount <= 0) {
    errors.push("Labor allocation produced zero JE amount");
  }

  const projectAmounts = new Map<string, number>();
  for (const row of allocation.lines) {
    const current = projectAmounts.get(row.projectExternalId) ?? 0;
    projectAmounts.set(row.projectExternalId, round2(current + row.allocatedAmount));
  }

  const projectFieldId = env.NETSUITE_LABOR_PROJECT_FIELD_ID ?? "job";
  const projectIdMap = parseProjectIdMap();
  let journalEntrySummary: JournalEntrySummary = {
    posted: false,
    debitLineCount: 0,
    totalAmount: round2(allocation.totalAllocatedAmount),
  };

  if (errors.length === 0) {
    const journalInput = buildLaborJournalEntryLines({
      periodKey,
      projectAmounts,
      projectFieldId,
      projectIdMap,
    });

    if (effectiveDryRun) {
      journalEntrySummary = {
        posted: false,
        debitLineCount: Math.max(0, journalInput.lines.length - 1),
        totalAmount: journalInput.totalAmount,
      };
    } else {
      try {
        const memoPrefix = env.NETSUITE_LABOR_MEMO_PREFIX ?? "Labor Allocation";
        const externalId = `labor-dist-${input.teamId}-${periodKey}`;
        const created = await createNetSuiteJournalEntry({
          tranDate: period.periodEndDate,
          memo: `${memoPrefix} ${periodKey}`,
          externalId,
          subsidiaryId: env.NETSUITE_LABOR_SUBSIDIARY_ID,
          currencyId: env.NETSUITE_LABOR_CURRENCY_ID,
          approvalStatus: env.NETSUITE_LABOR_APPROVAL_STATUS,
          lines: journalInput.lines,
        });

        journalEntrySummary = {
          posted: true,
          journalEntryId: created.id,
          externalId,
          debitLineCount: Math.max(0, journalInput.lines.length - 1),
          totalAmount: journalInput.totalAmount,
        };

        await persistImportJob({
          teamId: input.teamId,
          source: "NETSUITE",
          status: "SUCCEEDED",
          objectType: "LABOR_COST_DISTRIBUTION_JE",
          runKey: netSuiteRunKey,
          rowCount: journalInput.lines.length,
          successCount: journalInput.lines.length,
          failureCount: 0,
          controlTotal: journalInput.totalAmount,
          startedAt: startedAt,
          completedAt: new Date(),
          createdByUser: executedByUserId,
          dryRun: effectiveDryRun,
        });

        await upsertIntegrationStatus({
          teamId: input.teamId,
          source: "NETSUITE",
          status: "CONNECTED",
          metadata: {
            runKey: netSuiteRunKey,
            objectType: "LABOR_COST_DISTRIBUTION_JE",
            periodKey,
            journalEntryId: created.id,
          },
          dryRun: effectiveDryRun,
        });
      } catch (error) {
        const errorSummary = asErrorMessage(error);
        errors.push(`NETSUITE_LABOR_JE: ${errorSummary}`);
        await persistImportJob({
          teamId: input.teamId,
          source: "NETSUITE",
          status: "FAILED",
          objectType: "LABOR_COST_DISTRIBUTION_JE",
          runKey: netSuiteRunKey,
          rowCount: 0,
          successCount: 0,
          failureCount: 1,
          controlTotal: 0,
          errorSummary,
          startedAt: startedAt,
          completedAt: new Date(),
          createdByUser: executedByUserId,
          dryRun: effectiveDryRun,
        });

        await upsertIntegrationStatus({
          teamId: input.teamId,
          source: "NETSUITE",
          status: "ERROR",
          metadata: {
            runKey: netSuiteRunKey,
            objectType: "LABOR_COST_DISTRIBUTION_JE",
            periodKey,
            error: errorSummary,
          },
          dryRun: effectiveDryRun,
        });
      }
    }
  }

  const reconciliationSummary = summarizeReconciliation(
    allocation.totalGrossWages,
    journalEntrySummary.totalAmount,
  );

  let reconciliationRecordId: string | undefined;
  if (!effectiveDryRun) {
    try {
      const record = await runBalanceReconciliation({
        teamId: input.teamId,
        periodKey,
        sourceSystem: "ADP Gross Wages",
        targetSystem: "NetSuite Labor JE",
        sourceAmount: allocation.totalGrossWages,
        targetAmount: journalEntrySummary.totalAmount,
        executedByUserId,
        notes: `Labor distribution workflow (${input.trigger})`,
      });

      reconciliationRecordId = record.id;
    } catch (error) {
      warnings.push(`Failed to persist reconciliation record: ${asErrorMessage(error)}`);
    }
  }

  const completedAt = new Date();

  if (!effectiveDryRun) {
    await logAuditEvent({
      action: "workflow.labor_distribution.run",
      category: "workflow",
      teamId: input.teamId,
      userId: input.executedByUserId,
      metadata: {
        trigger: input.trigger,
        periodKey,
        allowPartialAllocation: Boolean(input.allowPartialAllocation),
        totalGrossWages: allocation.totalGrossWages,
        totalAllocatedAmount: allocation.totalAllocatedAmount,
        journalEntryId: journalEntrySummary.journalEntryId,
        warnings,
        errors,
      },
    });
  }

  const result: LaborCostDistributionWorkflowResult = {
    teamId: input.teamId,
    trigger: input.trigger,
    periodKey,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    dryRun: effectiveDryRun,
    sources: [
      {
        source: "UNANET_TIMESHEETS",
        rowCount: timesheetResult.rowCount,
        controlTotal: timesheetResult.totalHours,
      },
      {
        source: "ADP_GROSS_WAGES",
        rowCount: adpResult.rowCount,
        controlTotal: adpResult.totalGrossWages,
      },
    ],
    allocation: {
      lineCount: allocation.lines.length,
      employeeCount: allocation.employeeCount,
      projectCount: allocation.projectCount,
      totalHours: allocation.totalHours,
      totalGrossWages: allocation.totalGrossWages,
      totalAllocatedAmount: allocation.totalAllocatedAmount,
      employeesWithoutTimesheets: allocation.employeesWithoutTimesheets,
      employeesWithoutGrossWages: allocation.employeesWithoutGrossWages,
    },
    journalEntry: journalEntrySummary,
    reconciliation: {
      ...reconciliationSummary,
      id: reconciliationRecordId,
    },
    warnings,
    errors,
  };

  logger.info(
    {
      teamId: input.teamId,
      periodKey,
      trigger: input.trigger,
      posted: result.journalEntry.posted,
      warnings: result.warnings.length,
      errors: result.errors.length,
    },
    "labor cost distribution workflow completed",
  );

  return result;
}
