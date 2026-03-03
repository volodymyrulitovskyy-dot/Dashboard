# Nimbus Ledger Portal (Local)

A local-first finance operations portal for migrating and reconciling:
- AR/AP/GL from Unanet API
- AP from Ramp API
- Payroll gross wages from ADP API
into NetSuite.

## Features
- Google OAuth + Microsoft Entra ID SSO with NextAuth
- Multi-team tenancy with RBAC (`OWNER`, `ADMIN`, `ACCOUNTANT`, `VIEWER`)
- Integration modules for Ramp OAuth2, NetSuite OAuth2 M2M, and Unanet API
- Reconciliation dashboard (control totals, variances, import run logs)
- Automated reconciliation workflow with manual + scheduled triggers
- Automated labor cost distribution workflow: timesheets + ADP wages -> NetSuite JE
- SOC-oriented security baseline (headers, audit trail, secret hygiene)

## Local Setup
1. Copy env template:
   - `cp .env.example .env.local` (or create `.env.local` on Windows)
2. Fill required auth and integration values.
3. Install dependencies:
   - `npm install`
4. Initialize database:
   - `npm run db:push`
   - `npm run db:seed`
5. Start app:
   - `npm run dev`
   - Or without global Node install: `.\run-local.ps1 -Command dev`
6. Open `http://localhost:3000`

## Google OAuth Setup
1. Create OAuth credentials in Google Cloud Console.
2. Add redirect URI:
   - `http://localhost:3000/api/auth/callback/google`
3. Add to `.env.local`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

## Microsoft Entra Setup
1. Register an app in Entra ID.
2. Add redirect URI:
   - `http://localhost:3000/api/auth/callback/azure-ad`
3. Create client secret.
4. Add to `.env.local`:
   - `AZURE_AD_CLIENT_ID`
   - `AZURE_AD_CLIENT_SECRET`
   - `AZURE_AD_TENANT_ID`
5. For local credential fallback, prefer `LOCAL_ADMIN_PASSWORD_SHA256` instead of plain password.
6. Optional admin RBAC override:
   - `APP_ADMIN_EMAILS=volodymyr.ulitovskyy@gmail.com`

## Ramp + NetSuite + Unanet + ADP Inputs
- Ramp: `RAMP_CLIENT_ID`, `RAMP_CLIENT_SECRET`, and scoped OAuth permissions.
- NetSuite:
  - OAuth: `NETSUITE_ACCOUNT_ID`, `NETSUITE_CLIENT_ID`, `NETSUITE_CERTIFICATE_ID`, `NETSUITE_PRIVATE_KEY_PEM`
  - Totals source: `NETSUITE_TOTALS_ENDPOINT` or SuiteQL query env vars (`NETSUITE_AR_TOTAL_QUERY`, `NETSUITE_AP_TOTAL_QUERY`, `NETSUITE_GL_TOTAL_QUERY`)
  - Labor JE posting: `NETSUITE_LABOR_DEBIT_ACCOUNT_ID`, `NETSUITE_LABOR_CREDIT_ACCOUNT_ID`, optional dimension env vars
- Unanet:
  - API base: `UNANET_API_BASE_URL`
  - Auth: `UNANET_API_TOKEN` or OAuth client credentials (`UNANET_CLIENT_ID`, `UNANET_CLIENT_SECRET`, optional `UNANET_SCOPES`)
  - Totals endpoint: `UNANET_TOTALS_ENDPOINT`
  - Timesheet endpoint for labor allocation: `UNANET_TIMESHEETS_ENDPOINT`
- ADP:
  - API base: `ADP_API_BASE_URL`
  - Auth: `ADP_API_TOKEN` or OAuth client credentials (`ADP_CLIENT_ID`, `ADP_CLIENT_SECRET`, optional `ADP_SCOPES`)
  - Payroll endpoint: `ADP_PAYROLL_ENDPOINT`
- Scheduler:
  - `WORKFLOW_API_SECRET`
  - optional `WORKFLOW_TEAM_IDS` for scheduled multi-team runs
  - optional `WORKFLOW_ALLOWED_IPS` (comma-separated) for scheduler source IP allowlist
- Origin and domain controls:
  - optional `APP_ALLOWED_ORIGINS` (comma-separated) for controlled multi-domain deployments

## Workflow Triggers
- Manual reconciliation trigger (authenticated): `POST /api/workflows/reconcile`
  - Optional body: `{ "teamId": "team-finance-ops", "periodKey": "2026-02", "dryRun": false }`
- Scheduled reconciliation trigger (secret-protected): `POST /api/workflows/reconcile/scheduled`
  - Pass `Authorization: Bearer <WORKFLOW_API_SECRET>` or `x-workflow-secret` header
  - Optional query: `?teamId=team-finance-ops&periodKey=2026-02&dryRun=true`
- Manual labor distribution trigger (authenticated): `POST /api/workflows/labor-distribution`
  - Optional body: `{ "teamId": "team-finance-ops", "periodKey": "2026-02", "allowPartialAllocation": false }`
- Scheduled labor distribution trigger (secret-protected): `POST /api/workflows/labor-distribution/scheduled`
  - Optional query: `?teamId=team-finance-ops&periodKey=2026-02&allowPartialAllocation=false`

## Data Layer Notes
- Runtime pages use Prisma-backed data where available, with a safe fallback to demo data if Prisma is unavailable.
- Prisma schema and seed files provide the production data-model blueprint for jobs, connections, and reconciliation runs.

## Security Notes
- Do not commit `.env.local`.
- Rotate all secrets and certificates on schedule.
- Scheduled workflow endpoints are secret-protected and rate-limited.
- Scheduled endpoints can be locked to known source IPs with `WORKFLOW_ALLOWED_IPS`.
- Manual workflow routes enforce same-origin checks to reduce CSRF risk.
- Audit events persist to DB with in-memory fallback when DB is unavailable.
- Use Supabase Postgres for production (SQLite only for local development).

## Docs
- Architecture: `docs/ARCHITECTURE.md`
- Security baseline: `docs/SECURITY.md`
- Operations runbook: `docs/OPERATIONS.md`
- Interim SQL strategy: `docs/INTERIM_DATA_SQL.md`
