-- NetSuite reference mapping control + placeholder external tables.
-- Scope:
--   NetSuite COA, Projects, Vendors, Employees, Customers
--   Table targets are placeholders and can be evolved as external schemas finalize.

CREATE TABLE IF NOT EXISTS "public"."ReferenceMappingDefinition" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "netsuiteDomain" TEXT NOT NULL,       -- coa | project | vendor | employee | customer
    "netsuiteRecordType" TEXT NOT NULL,   -- account | job | vendor | employee | customer
    "netsuiteKeyField" TEXT NOT NULL,     -- usually internalId
    "netsuiteDisplayField" TEXT NOT NULL,
    "externalTableName" TEXT NOT NULL,
    "externalPrimaryKey" TEXT NOT NULL,
    "externalDisplayField" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'tbd', -- tbd | in_progress | ready
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "ReferenceMappingDefinition_domain_check"
      CHECK ("netsuiteDomain" IN ('coa', 'project', 'vendor', 'employee', 'customer')),
    CONSTRAINT "ReferenceMappingDefinition_status_check"
      CHECK ("status" IN ('tbd', 'in_progress', 'ready'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferenceMappingDefinition_teamId_domain_key"
  ON "public"."ReferenceMappingDefinition" ("teamId", "netsuiteDomain");

INSERT INTO "public"."ReferenceMappingDefinition" (
    "teamId",
    "netsuiteDomain",
    "netsuiteRecordType",
    "netsuiteKeyField",
    "netsuiteDisplayField",
    "externalTableName",
    "externalPrimaryKey",
    "externalDisplayField",
    "status",
    "notes"
)
VALUES
    ('template', 'coa', 'account', 'internalId', 'accountnumber + acctname', 'ExternalCoaTbd', 'externalAccountId', 'accountCode + accountName', 'tbd', 'Map NetSuite account records to external chart of accounts.'),
    ('template', 'project', 'job', 'internalId', 'entityid + companyname', 'ExternalProjectTbd', 'externalProjectId', 'projectCode + projectName', 'tbd', 'Map NetSuite project/job records to external projects.'),
    ('template', 'vendor', 'vendor', 'internalId', 'entityid + companyname', 'ExternalVendorTbd', 'externalVendorId', 'vendorCode + vendorName', 'tbd', 'Map NetSuite vendors to external vendor master.'),
    ('template', 'employee', 'employee', 'internalId', 'entityid + email', 'ExternalEmployeeTbd', 'externalEmployeeId', 'employeeCode + displayName', 'tbd', 'Map NetSuite employees to external employee master.'),
    ('template', 'customer', 'customer', 'internalId', 'entityid + companyname', 'ExternalCustomerTbd', 'externalCustomerId', 'customerCode + customerName', 'tbd', 'Map NetSuite customers to external customer master.')
ON CONFLICT ("teamId", "netsuiteDomain") DO NOTHING;

CREATE TABLE IF NOT EXISTS "public"."ExternalCoaTbd" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCoaTbd_teamId_externalAccountId_key"
  ON "public"."ExternalCoaTbd" ("teamId", "externalAccountId");

CREATE TABLE IF NOT EXISTS "public"."ExternalProjectTbd" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "externalProjectId" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "customerExternalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalProjectTbd_teamId_externalProjectId_key"
  ON "public"."ExternalProjectTbd" ("teamId", "externalProjectId");

CREATE TABLE IF NOT EXISTS "public"."ExternalVendorTbd" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "externalVendorId" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "taxIdentifier" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalVendorTbd_teamId_externalVendorId_key"
  ON "public"."ExternalVendorTbd" ("teamId", "externalVendorId");

CREATE TABLE IF NOT EXISTS "public"."ExternalEmployeeTbd" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "externalEmployeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "workEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalEmployeeTbd_teamId_externalEmployeeId_key"
  ON "public"."ExternalEmployeeTbd" ("teamId", "externalEmployeeId");

CREATE TABLE IF NOT EXISTS "public"."ExternalCustomerTbd" (
    "id" BIGSERIAL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "parentExternalCustomerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCustomerTbd_teamId_externalCustomerId_key"
  ON "public"."ExternalCustomerTbd" ("teamId", "externalCustomerId");

-- Restrict direct browser access.
REVOKE ALL ON TABLE
  "public"."ReferenceMappingDefinition",
  "public"."ExternalCoaTbd",
  "public"."ExternalProjectTbd",
  "public"."ExternalVendorTbd",
  "public"."ExternalEmployeeTbd",
  "public"."ExternalCustomerTbd"
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."ReferenceMappingDefinition",
  "public"."ExternalCoaTbd",
  "public"."ExternalProjectTbd",
  "public"."ExternalVendorTbd",
  "public"."ExternalEmployeeTbd",
  "public"."ExternalCustomerTbd"
TO service_role;

ALTER TABLE "public"."ReferenceMappingDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExternalCoaTbd" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExternalProjectTbd" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExternalVendorTbd" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExternalEmployeeTbd" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExternalCustomerTbd" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ReferenceMappingDefinition"
  ON "public"."ReferenceMappingDefinition"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ExternalCoaTbd"
  ON "public"."ExternalCoaTbd"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ExternalProjectTbd"
  ON "public"."ExternalProjectTbd"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ExternalVendorTbd"
  ON "public"."ExternalVendorTbd"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ExternalEmployeeTbd"
  ON "public"."ExternalEmployeeTbd"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ExternalCustomerTbd"
  ON "public"."ExternalCustomerTbd"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
