-- Interim staging tables for system-to-system orchestration.
-- Scope:
--   NetSuite <-> Unanet <-> Ramp reconciliation
--   Timesheet + ADP wage allocation -> NetSuite labor JEs

CREATE TABLE IF NOT EXISTS "public"."InterimPipelineRun" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL, -- reconciliation | labor_distribution
    "periodKey" TEXT NOT NULL,    -- YYYY-MM
    "triggerType" TEXT NOT NULL,  -- manual | scheduled
    "status" TEXT NOT NULL,       -- queued | running | succeeded | failed | partial
    "sourceSystem" TEXT NOT NULL, -- ramp | netsuite | unanet | adp
    "targetSystem" TEXT NOT NULL, -- ramp | netsuite | unanet | adp
    "runKey" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "completedAt" TIMESTAMPTZ,
    "createdByUserId" TEXT,
    "errorSummary" TEXT,
    "metadata" JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterimPipelineRun_teamId_runKey_key"
  ON "public"."InterimPipelineRun" ("teamId", "runKey");
CREATE INDEX IF NOT EXISTS "InterimPipelineRun_teamId_periodKey_idx"
  ON "public"."InterimPipelineRun" ("teamId", "periodKey");
CREATE INDEX IF NOT EXISTS "InterimPipelineRun_status_idx"
  ON "public"."InterimPipelineRun" ("status");

CREATE TABLE IF NOT EXISTS "public"."InterimRawPayload" (
    "id" BIGSERIAL PRIMARY KEY,
    "pipelineRunId" BIGINT NOT NULL REFERENCES "public"."InterimPipelineRun"("id") ON DELETE CASCADE,
    "sourceSystem" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,   -- bills | ar_invoices | gl_entries | timesheets | payroll
    "externalObjectId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InterimRawPayload_pipelineRunId_idx"
  ON "public"."InterimRawPayload" ("pipelineRunId");
CREATE INDEX IF NOT EXISTS "InterimRawPayload_source_object_idx"
  ON "public"."InterimRawPayload" ("sourceSystem", "objectType");
CREATE INDEX IF NOT EXISTS "InterimRawPayload_payloadHash_idx"
  ON "public"."InterimRawPayload" ("payloadHash");

CREATE TABLE IF NOT EXISTS "public"."InterimNormalizedRecord" (
    "id" BIGSERIAL PRIMARY KEY,
    "pipelineRunId" BIGINT NOT NULL REFERENCES "public"."InterimPipelineRun"("id") ON DELETE CASCADE,
    "teamId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,   -- ap_bill | ar_invoice | gl_line | timesheet_line | payroll_line
    "externalRecordId" TEXT,
    "projectCode" TEXT,
    "employeeExternalId" TEXT,
    "departmentCode" TEXT,
    "accountCode" TEXT,
    "currencyCode" TEXT,
    "amount" NUMERIC(18,4),
    "hours" NUMERIC(12,4),
    "workDate" DATE,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InterimNormalizedRecord_pipelineRunId_idx"
  ON "public"."InterimNormalizedRecord" ("pipelineRunId");
CREATE INDEX IF NOT EXISTS "InterimNormalizedRecord_teamId_recordType_idx"
  ON "public"."InterimNormalizedRecord" ("teamId", "recordType");
CREATE INDEX IF NOT EXISTS "InterimNormalizedRecord_projectCode_idx"
  ON "public"."InterimNormalizedRecord" ("projectCode");

CREATE TABLE IF NOT EXISTS "public"."InterimReconciliationSnapshot" (
    "id" BIGSERIAL PRIMARY KEY,
    "pipelineRunId" BIGINT NOT NULL REFERENCES "public"."InterimPipelineRun"("id") ON DELETE CASCADE,
    "teamId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "sourceAmount" NUMERIC(18,4) NOT NULL,
    "targetAmount" NUMERIC(18,4) NOT NULL,
    "varianceAmount" NUMERIC(18,4) NOT NULL,
    "variancePercent" NUMERIC(12,6) NOT NULL,
    "status" TEXT NOT NULL,       -- matched | variance | pending
    "summary" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InterimReconciliationSnapshot_team_period_idx"
  ON "public"."InterimReconciliationSnapshot" ("teamId", "periodKey");

CREATE TABLE IF NOT EXISTS "public"."InterimLaborAllocation" (
    "id" BIGSERIAL PRIMARY KEY,
    "pipelineRunId" BIGINT NOT NULL REFERENCES "public"."InterimPipelineRun"("id") ON DELETE CASCADE,
    "teamId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "employeeExternalId" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "timesheetHours" NUMERIC(12,4) NOT NULL,
    "grossWagesAllocated" NUMERIC(18,4) NOT NULL,
    "allocationPercent" NUMERIC(9,6) NOT NULL,
    "currencyCode" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InterimLaborAllocation_team_period_idx"
  ON "public"."InterimLaborAllocation" ("teamId", "periodKey");
CREATE INDEX IF NOT EXISTS "InterimLaborAllocation_employee_idx"
  ON "public"."InterimLaborAllocation" ("employeeExternalId");

CREATE TABLE IF NOT EXISTS "public"."InterimJournalEntryLine" (
    "id" BIGSERIAL PRIMARY KEY,
    "pipelineRunId" BIGINT NOT NULL REFERENCES "public"."InterimPipelineRun"("id") ON DELETE CASCADE,
    "teamId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "netsuiteJournalId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" NUMERIC(18,4) NOT NULL DEFAULT 0,
    "creditAmount" NUMERIC(18,4) NOT NULL DEFAULT 0,
    "projectExternalId" TEXT,
    "departmentId" TEXT,
    "classId" TEXT,
    "locationId" TEXT,
    "memo" TEXT,
    "status" TEXT NOT NULL,       -- pending | posted | failed
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "InterimJournalEntryLine_team_period_idx"
  ON "public"."InterimJournalEntryLine" ("teamId", "periodKey");
CREATE INDEX IF NOT EXISTS "InterimJournalEntryLine_journal_idx"
  ON "public"."InterimJournalEntryLine" ("netsuiteJournalId");

-- Restrict direct table access for browser-facing roles.
REVOKE ALL ON TABLE
  "public"."InterimPipelineRun",
  "public"."InterimRawPayload",
  "public"."InterimNormalizedRecord",
  "public"."InterimReconciliationSnapshot",
  "public"."InterimLaborAllocation",
  "public"."InterimJournalEntryLine"
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."InterimPipelineRun",
  "public"."InterimRawPayload",
  "public"."InterimNormalizedRecord",
  "public"."InterimReconciliationSnapshot",
  "public"."InterimLaborAllocation",
  "public"."InterimJournalEntryLine"
TO service_role;

ALTER TABLE "public"."InterimPipelineRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InterimRawPayload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InterimNormalizedRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InterimReconciliationSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InterimLaborAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InterimJournalEntryLine" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_InterimPipelineRun"
  ON "public"."InterimPipelineRun"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_InterimRawPayload"
  ON "public"."InterimRawPayload"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_InterimNormalizedRecord"
  ON "public"."InterimNormalizedRecord"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_InterimReconciliationSnapshot"
  ON "public"."InterimReconciliationSnapshot"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_InterimLaborAllocation"
  ON "public"."InterimLaborAllocation"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_InterimJournalEntryLine"
  ON "public"."InterimJournalEntryLine"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

