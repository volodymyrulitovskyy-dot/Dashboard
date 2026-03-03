import type { IntegrationType as PrismaIntegrationType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getImportJobsByTeam, getIntegrationsByTeam, getReconciliationByTeam } from "@/lib/data/mock-data";
import type {
  DataImportJob,
  IntegrationConnection,
  ReconciliationRun,
} from "@/lib/data/types";
import { logger } from "@/lib/logger";

type TeamDefaults = {
  name: string;
  slug: string;
};

const knownTeamDefaults: Record<string, TeamDefaults> = {
  "team-finance-ops": {
    name: "Finance Operations",
    slug: "finance-ops",
  },
  "team-corporate-close": {
    name: "Corporate Close",
    slug: "corp-close",
  },
};

function deriveTeamDefaults(teamId: string): TeamDefaults {
  const known = knownTeamDefaults[teamId];
  if (known) {
    return known;
  }

  const normalized = teamId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);

  const slug = normalized || `team-${Date.now()}`;
  const prettyName = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  return {
    name: prettyName || "Finance Team",
    slug,
  };
}

async function safeQuery<T>(
  label: string,
  query: () => Promise<T>,
  fallback: () => T,
) {
  try {
    return await query();
  } catch (error) {
    logger.warn(
      { error, label },
      "runtime-data query failed, returning fallback data",
    );
    return fallback();
  }
}

function mapIntegrationConnection(input: {
  id: string;
  teamId: string;
  displayName: string;
  type: PrismaIntegrationType;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  scope: string | null;
  lastSyncAt: Date | null;
}): IntegrationConnection {
  return {
    id: input.id,
    teamId: input.teamId,
    displayName: input.displayName,
    type: input.type,
    status: input.status,
    scope: input.scope,
    lastSyncAt: input.lastSyncAt,
  };
}

function mapImportJob(input: {
  id: string;
  teamId: string;
  source: PrismaIntegrationType;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  objectType: string;
  runKey: string;
  rowCount: number;
  successCount: number;
  failureCount: number;
  controlTotal: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}): DataImportJob {
  return {
    id: input.id,
    teamId: input.teamId,
    source: input.source,
    status: input.status,
    objectType: input.objectType,
    runKey: input.runKey,
    rowCount: input.rowCount,
    successCount: input.successCount,
    failureCount: input.failureCount,
    controlTotal: input.controlTotal ?? 0,
    startedAt: input.startedAt ?? undefined,
    completedAt: input.completedAt ?? undefined,
  };
}

function mapReconciliationRun(input: {
  id: string;
  teamId: string;
  periodKey: string;
  sourceSystem: string;
  targetSystem: string;
  status: "PENDING" | "MATCHED" | "VARIANCE";
  sourceAmount: number;
  targetAmount: number;
  varianceAmount: number;
  variancePercent: number;
  notes: string | null;
  executedAt: Date;
}): ReconciliationRun {
  return {
    id: input.id,
    teamId: input.teamId,
    periodKey: input.periodKey,
    sourceSystem: input.sourceSystem,
    targetSystem: input.targetSystem,
    status: input.status,
    sourceAmount: input.sourceAmount,
    targetAmount: input.targetAmount,
    varianceAmount: input.varianceAmount,
    variancePercent: input.variancePercent,
    notes: input.notes ?? undefined,
    executedAt: input.executedAt,
  };
}

export async function ensureTeamRecord(teamId: string) {
  const defaults = deriveTeamDefaults(teamId);
  const existingBySlug = await prisma.team.findUnique({
    where: { slug: defaults.slug },
    select: { id: true },
  });

  const safeSlug =
    existingBySlug && existingBySlug.id !== teamId
      ? `${defaults.slug}-${teamId.slice(-8).toLowerCase()}`
      : defaults.slug;

  return prisma.team.upsert({
    where: { id: teamId },
    update: {
      name: defaults.name,
      slug: safeSlug,
    },
    create: {
      id: teamId,
      name: defaults.name,
      slug: safeSlug,
    },
  });
}

export async function getIntegrationsByTeamRuntime(
  teamId: string,
): Promise<IntegrationConnection[]> {
  return safeQuery(
    "integrationConnection.findMany",
    async () => {
      const rows = await prisma.integrationConnection.findMany({
        where: { teamId },
        orderBy: { type: "asc" },
      });

      return rows.map(mapIntegrationConnection);
    },
    () => getIntegrationsByTeam(teamId),
  );
}

export async function getImportJobsByTeamRuntime(
  teamId: string,
): Promise<DataImportJob[]> {
  return safeQuery(
    "dataImportJob.findMany",
    async () => {
      const rows = await prisma.dataImportJob.findMany({
        where: { teamId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return rows.map(mapImportJob);
    },
    () => getImportJobsByTeam(teamId),
  );
}

export async function getReconciliationByTeamRuntime(
  teamId: string,
): Promise<ReconciliationRun[]> {
  return safeQuery(
    "reconciliationRun.findMany",
    async () => {
      const rows = await prisma.reconciliationRun.findMany({
        where: { teamId },
        orderBy: { executedAt: "desc" },
        take: 50,
      });

      return rows.map(mapReconciliationRun);
    },
    () => getReconciliationByTeam(teamId),
  );
}

export async function getTeamIdsWithConfiguredIntegrations() {
  return safeQuery(
    "integrationConnection.findMany(distinct teamId)",
    async () => {
      const rows = await prisma.integrationConnection.findMany({
        distinct: ["teamId"],
        select: { teamId: true },
      });

      return rows.map((row) => row.teamId);
    },
    () => Object.keys(knownTeamDefaults),
  );
}
