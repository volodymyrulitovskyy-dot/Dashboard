export type TeamRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER";

export type IntegrationType = "RAMP" | "NETSUITE" | "UNANET";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";
export type ImportJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ReconciliationStatus = "PENDING" | "MATCHED" | "VARIANCE";

export type TeamSummary = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  role: TeamRole;
};

export type IntegrationConnection = {
  id: string;
  teamId: string;
  displayName: string;
  type: IntegrationType;
  status: ConnectionStatus;
  scope: string | null;
  lastSyncAt: Date | null;
};

export type DataImportJob = {
  id: string;
  teamId: string;
  source: IntegrationType;
  status: ImportJobStatus;
  objectType: string;
  runKey: string;
  rowCount: number;
  successCount: number;
  failureCount: number;
  controlTotal: number;
  startedAt?: Date;
  completedAt?: Date;
};

export type ReconciliationRun = {
  id: string;
  teamId: string;
  periodKey: string;
  sourceSystem: string;
  targetSystem: string;
  status: ReconciliationStatus;
  sourceAmount: number;
  targetAmount: number;
  varianceAmount: number;
  variancePercent: number;
  notes?: string;
  executedAt: Date;
};
