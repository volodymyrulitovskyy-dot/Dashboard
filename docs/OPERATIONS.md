# Operations Runbook

## 1. Day-0 Launch Checklist
- Confirm production DNS route: `https://netsuite-portal.vercel.app` (or custom domain).
- Confirm SSO callback URLs in Google/Entra match production domain.
- Confirm Vercel env vars are present for auth, integrations, and workflows.
- Confirm Supabase connection and migrations are applied.
- Confirm scheduled route secret and optional IP allowlist are configured.
- Run smoke tests:
  - sign-in page loads providers,
  - dashboard loads,
  - manual dry-run reconciliation succeeds,
  - manual dry-run labor distribution succeeds.

## 2. Required Environment Variables
Authentication:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (if Google enabled)
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` (if Entra enabled)
- `APP_ADMIN_EMAILS`
- `APP_ALLOWED_EMAIL_DOMAIN` (optional)
- `APP_ALLOWED_ORIGINS` (optional)

Workflow protection:
- `WORKFLOW_API_SECRET`
- `WORKFLOW_TEAM_IDS`
- `WORKFLOW_ALLOWED_IPS` (recommended)

Data:
- `DATABASE_URL`
- Supabase public variables for browser client where needed.

Integrations:
- Ramp, NetSuite, Unanet, ADP credentials and endpoints per `.env.example`.

## 3. Migration and Release Procedure
1. Merge approved change to `main`.
2. Deploy app to Vercel production.
3. Apply Supabase migration set.
4. Validate API health and dashboard behavior.
5. Execute post-release smoke tests.
6. Record release ID, commit, and validation evidence.

## 4. Monthly Security Operations
- Rotate high-risk credentials per policy.
- Review audit anomalies and unauthorized attempts.
- Validate RBAC membership and admin allowlist.
- Patch dependencies and re-run vulnerability scans.
- Execute restore test from latest backup snapshot.

## 5. Key Rotation Procedure
1. Generate replacement credential in source system (Ramp, NetSuite, Unanet, ADP, Supabase, OAuth).
2. Update Vercel env variable.
3. Trigger production redeploy.
4. Validate connection health and workflow dry run.
5. Revoke previous credential.
6. Log completion in change record.

## 6. Incident Response Detail
Severity levels:
- P1: data breach, unauthorized posting, major outage.
- P2: partial outage, failed integrations with close impact.
- P3: non-critical bugs, degraded observability.

Immediate response for credential leak:
1. Rotate leaked key and revoke prior key.
2. Redeploy with new secret.
3. Review logs for abuse window.
4. Reconcile all affected runs and postings.
5. Document timeline and remediations.

## 7. Disaster Recovery
- RPO objective: <= 15 minutes.
- RTO objective: <= 2 hours.
- Primary recovery method:
  - restore Supabase snapshot,
  - redeploy last-known-good app build,
  - replay pending run keys safely with idempotent guards.

## 8. Validation Queries (Supabase)
Example checks after close run:
```sql
-- Latest interim runs
select id, "teamId", "workflowType", "status", "periodKey", "startedAt", "completedAt"
from "InterimPipelineRun"
order by id desc
limit 20;

-- Reconciliation variances over threshold
select "teamId", "periodKey", "sourceSystem", "targetSystem", "varianceAmount", "variancePercent"
from "InterimReconciliationSnapshot"
where abs("varianceAmount") > 1000
order by "createdAt" desc;

-- Labor allocations that did not post
select "teamId", "periodKey", "employeeExternalId", "projectCode", "grossWagesAllocated"
from "InterimLaborAllocation"
where "pipelineRunId" in (
  select id from "InterimPipelineRun" where "status" in ('failed', 'partial')
);
```

## 9. Ownership Model
- Product owner: finance systems leadership.
- Security owner: security engineering lead.
- Platform owner: DevOps/SRE.
- Data owner: accounting operations lead.

Every production change must have accountable owners for approval, validation, and rollback.
