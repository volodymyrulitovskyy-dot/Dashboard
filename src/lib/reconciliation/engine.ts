import { prisma } from "@/lib/db";

export async function runBalanceReconciliation(input: {
  teamId: string;
  periodKey: string;
  sourceSystem: string;
  targetSystem: string;
  sourceAmount: number;
  targetAmount: number;
  executedByUserId: string;
  notes?: string;
}) {
  const varianceAmount = input.sourceAmount - input.targetAmount;
  const variancePercent =
    input.sourceAmount === 0 ? 0 : varianceAmount / input.sourceAmount;

  const status =
    Math.abs(varianceAmount) < 0.005
      ? "MATCHED"
      : Math.abs(variancePercent) <= 0.005
        ? "VARIANCE"
        : "PENDING";

  return prisma.reconciliationRun.create({
    data: {
      teamId: input.teamId,
      periodKey: input.periodKey,
      sourceSystem: input.sourceSystem,
      targetSystem: input.targetSystem,
      sourceAmount: Number(input.sourceAmount.toFixed(2)),
      targetAmount: Number(input.targetAmount.toFixed(2)),
      varianceAmount: Number(varianceAmount.toFixed(2)),
      variancePercent: Number(variancePercent.toFixed(4)),
      status,
      executedByUserId: input.executedByUserId,
      notes: input.notes,
    },
  });
}
