import { randomUUID } from "node:crypto";

import {
  type DataImportJob,
  type IntegrationConnection,
  type ReconciliationRun,
  type TeamSummary,
} from "@/lib/data/types";

const defaultTeams: TeamSummary[] = [
  {
    teamId: "team-finance-ops",
    teamName: "Finance Operations",
    teamSlug: "finance-ops",
    role: "OWNER",
  },
  {
    teamId: "team-corporate-close",
    teamName: "Corporate Close",
    teamSlug: "corp-close",
    role: "ADMIN",
  },
];

const integrationByTeam: Record<string, IntegrationConnection[]> = {
  "team-finance-ops": [
    {
      id: "int-ramp-ops",
      teamId: "team-finance-ops",
      displayName: "Ramp AP",
      type: "RAMP",
      status: "CONNECTED",
      scope: "bills:read vendors:read transactions:read receipts:read",
      lastSyncAt: new Date(),
    },
    {
      id: "int-netsuite-ops",
      teamId: "team-finance-ops",
      displayName: "NetSuite ERP",
      type: "NETSUITE",
      status: "CONNECTED",
      scope: "rest_webservices",
      lastSyncAt: new Date(),
    },
    {
      id: "int-unanet-ops",
      teamId: "team-finance-ops",
      displayName: "Unanet Export Feed",
      type: "UNANET",
      status: "CONNECTED",
      scope: "csv-export",
      lastSyncAt: new Date(),
    },
  ],
  "team-corporate-close": [
    {
      id: "int-ramp-close",
      teamId: "team-corporate-close",
      displayName: "Ramp AP Corporate",
      type: "RAMP",
      status: "CONNECTED",
      scope: "bills:read vendors:read transactions:read",
      lastSyncAt: new Date(Date.now() - 8 * 60 * 1000),
    },
    {
      id: "int-ns-close",
      teamId: "team-corporate-close",
      displayName: "NetSuite Corporate",
      type: "NETSUITE",
      status: "CONNECTED",
      scope: "rest_webservices",
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000),
    },
    {
      id: "int-unanet-close",
      teamId: "team-corporate-close",
      displayName: "Unanet GL Export",
      type: "UNANET",
      status: "CONNECTED",
      scope: "csv-export",
      lastSyncAt: new Date(Date.now() - 12 * 60 * 1000),
    },
  ],
};

const jobsByTeam: Record<string, DataImportJob[]> = {
  "team-finance-ops": [
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      source: "UNANET",
      status: "SUCCEEDED",
      objectType: "AR_OPEN_INVOICES",
      runKey: "unanet-ar-2026-02-28",
      rowCount: 1240,
      successCount: 1240,
      failureCount: 0,
      controlTotal: 1954203.18,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
      completedAt: new Date(Date.now() - 26 * 60 * 1000),
    },
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      source: "RAMP",
      status: "SUCCEEDED",
      objectType: "AP_BILLS",
      runKey: "ramp-ap-2026-02-28",
      rowCount: 388,
      successCount: 385,
      failureCount: 3,
      controlTotal: 412882.77,
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      completedAt: new Date(Date.now() - 17 * 60 * 1000),
    },
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      source: "UNANET",
      status: "RUNNING",
      objectType: "GL_DETAIL",
      runKey: "unanet-gl-2026-02-28",
      rowCount: 98012,
      successCount: 95210,
      failureCount: 0,
      controlTotal: 12889342.99,
      startedAt: new Date(Date.now() - 4 * 60 * 1000),
    },
  ],
  "team-corporate-close": [
    {
      id: randomUUID(),
      teamId: "team-corporate-close",
      source: "UNANET",
      status: "SUCCEEDED",
      objectType: "GL_DETAIL",
      runKey: "unanet-gl-2026-02-28-corp",
      rowCount: 65012,
      successCount: 65012,
      failureCount: 0,
      controlTotal: 8891222.45,
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
      completedAt: new Date(Date.now() - 35 * 60 * 1000),
    },
    {
      id: randomUUID(),
      teamId: "team-corporate-close",
      source: "RAMP",
      status: "FAILED",
      objectType: "AP_BILLS",
      runKey: "ramp-ap-2026-02-28-corp",
      rowCount: 288,
      successCount: 271,
      failureCount: 17,
      controlTotal: 348010.21,
      startedAt: new Date(Date.now() - 18 * 60 * 1000),
      completedAt: new Date(Date.now() - 14 * 60 * 1000),
    },
  ],
};

const reconciliationByTeam: Record<string, ReconciliationRun[]> = {
  "team-finance-ops": [
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      periodKey: "2026-02",
      sourceSystem: "Unanet AR",
      targetSystem: "NetSuite AR",
      status: "MATCHED",
      sourceAmount: 1954203.18,
      targetAmount: 1954203.18,
      varianceAmount: 0,
      variancePercent: 0,
      notes: "AR subledger tie-out complete.",
      executedAt: new Date(Date.now() - 12 * 60 * 1000),
    },
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      periodKey: "2026-02",
      sourceSystem: "Ramp AP",
      targetSystem: "NetSuite AP",
      status: "VARIANCE",
      sourceAmount: 412882.77,
      targetAmount: 410884.77,
      varianceAmount: 1998,
      variancePercent: 0.0048,
      notes: "Three receipts pending coding approval.",
      executedAt: new Date(Date.now() - 9 * 60 * 1000),
    },
    {
      id: randomUUID(),
      teamId: "team-finance-ops",
      periodKey: "2026-02",
      sourceSystem: "Unanet GL",
      targetSystem: "NetSuite GL",
      status: "PENDING",
      sourceAmount: 12889342.99,
      targetAmount: 0,
      varianceAmount: 12889342.99,
      variancePercent: 1,
      notes: "Import currently running.",
      executedAt: new Date(Date.now() - 4 * 60 * 1000),
    },
  ],
  "team-corporate-close": [
    {
      id: randomUUID(),
      teamId: "team-corporate-close",
      periodKey: "2026-02",
      sourceSystem: "Unanet GL",
      targetSystem: "NetSuite GL",
      status: "MATCHED",
      sourceAmount: 8891222.45,
      targetAmount: 8891222.45,
      varianceAmount: 0,
      variancePercent: 0,
      notes: "Corporate GL tie-out complete.",
      executedAt: new Date(Date.now() - 40 * 60 * 1000),
    },
  ],
};

export function getTeamsForUser() {
  return defaultTeams;
}

export function getIntegrationsByTeam(teamId: string) {
  return integrationByTeam[teamId] ?? [];
}

export function getImportJobsByTeam(teamId: string) {
  return jobsByTeam[teamId] ?? [];
}

export function getReconciliationByTeam(teamId: string) {
  return reconciliationByTeam[teamId] ?? [];
}
