# Architecture Blueprint

## 1. Mission
Build a secure finance operations portal that:
- Reconciles NetSuite, Unanet, and Ramp data through API workflows.
- Automates labor cost distribution journal entries by spreading ADP gross wages to projects using timesheet allocation logic.
- Preserves an auditable interim SQL trail for every cross-system move.
- Enforces strict tenant boundaries, RBAC, and production security controls.

## 2. Non-Functional Targets
- Security: OWASP ASVS L2-aligned baseline, least privilege, secret isolation, durable audit events.
- Availability: 99.9% monthly service objective for portal and workflow API routes.
- Recoverability: RPO <= 15 minutes, RTO <= 2 hours.
- Integrity: Idempotent run keys, control totals, variance capture, immutable run history.
- Traceability: Every workflow run and transformation step logged with request/run identifiers.

## 3. System Context
```text
[User Browser]
   |
   | HTTPS (SSO)
   v
[Vercel / Next.js App Router]
   |\
   | \-----> [Google OAuth / Microsoft Entra via NextAuth]
   |
   +-------> [Supabase Postgres]
   |            |- core app tables (users, teams, runs, audit)
   |            |- interim pipeline staging tables
   |
   +-------> [NetSuite API]
   +-------> [Unanet API]
   +-------> [Ramp API]
   +-------> [ADP API]
```

Primary trust boundaries:
1. Public internet boundary (browser <-> Vercel).
2. Application boundary (Next.js runtime and auth/session controls).
3. Data boundary (Supabase/Postgres with RLS and role separation).
4. Third-party boundary (external finance/payroll APIs).

## 4. Runtime Components
- `src/lib/auth`: NextAuth provider config, sign-in policy, role assignment logic, tenancy context.
- `src/lib/security`: headers, origin checks, rate limiting, constant-time secret comparison, IP allowlist checks.
- `src/lib/workflows/reconciliation-workflow.ts`: ETL + matching for AR/AP/GL reconciliation.
- `src/lib/workflows/labor-cost-distribution-workflow.ts`: timesheet + payroll wage allocation and NetSuite JE posting.
- `src/lib/integrations/*`: API clients for NetSuite, Unanet, Ramp, ADP.
- `src/lib/audit.ts`: durable audit event persistence to DB with in-memory fallback.

## 5. Data Flow: Reconciliation
1. Trigger manual or scheduled run.
2. Acquire source totals from Unanet and Ramp, target totals from NetSuite.
3. Normalize and compare by period (`YYYY-MM`) and control dimensions.
4. Persist run metadata and variances.
5. Emit audit events and operator-readable status.

Security controls in flow:
- Manual trigger: session auth + RBAC + same-origin + rate limit.
- Scheduled trigger: workflow secret + optional source IP allowlist + rate limit.
- Error handling: redacted logs, safe public error responses.

## 6. Data Flow: Labor Cost Distribution JE
1. Pull approved timesheet hours by employee/project from Unanet.
2. Pull payroll gross wages from ADP for the same period.
3. Compute allocation percentages by employee and project.
4. Build balanced debit/credit lines using configured NetSuite accounts and dimensions.
5. Post JE payload to NetSuite and persist posting results.
6. Store allocations and JE lines in interim SQL tables for audit and replay.

## 7. Interim SQL Architecture (Supabase)
Implemented migration: `supabase/migrations/20260303_0002_interim_pipeline_tables.sql`

Core interim tables:
- `InterimPipelineRun`: run-level orchestration metadata and status.
- `InterimRawPayload`: immutable raw payload snapshots and hashes.
- `InterimNormalizedRecord`: canonicalized records for downstream rules.
- `InterimReconciliationSnapshot`: per-period source/target totals and variances.
- `InterimLaborAllocation`: employee/project wage allocation lines.
- `InterimJournalEntryLine`: outbound NetSuite JE lines and posting status.

Design principles:
- Idempotency: unique (`teamId`, `runKey`) on pipeline run.
- Chain of custody: run -> payload -> normalized data -> decision snapshot -> outbound artifacts.
- Least privilege: restricted table grants for `anon`/`authenticated`, service-role-only write path.
- RLS enabled on all interim tables.

## 8. Security Architecture Overlay
- Identity: Google OAuth + Microsoft Entra + optional local fallback.
- Authorization: role hierarchy (`OWNER`, `ADMIN`, `ACCOUNTANT`, `VIEWER`) with API-level checks.
- Secrets: environment-only, not committed to source; production secrets set in Vercel.
- Request protection: strict headers, same-origin mutation enforcement, rate limiting, secret-based scheduler auth.
- Network guardrail: optional scheduler IP allowlist (`WORKFLOW_ALLOWED_IPS`).
- Audit: auth, tenancy, and workflow events persisted to Postgres.

## 9. Environment Topology
- Local development:
  - Next.js local runtime.
  - Optional local SQLite for quick iteration.
- Production:
  - Vercel-hosted Next.js runtime.
  - Supabase Postgres for core + interim data.
  - External APIs over TLS.

Promotion pattern:
1. Merge to `main`.
2. Vercel build + deploy.
3. Apply SQL migrations to Supabase.
4. Run smoke checks (signin, dashboard, workflow endpoints).

## 10. Resilience and Recovery
- Backups: Supabase PITR and scheduled logical exports.
- Retry strategy: transient integration failures retried with bounded attempts.
- Idempotent reruns: same `runKey` prevents duplicate logical runs.
- Operational fallback: workflow can continue in dry-run mode when persistence is degraded.

## 11. Next Architecture Steps
1. Move workflow execution from request/response to queue workers (Temporal or durable job queue).
2. Add signed payload archives to object storage for long-term immutability.
3. Add cryptographic reconciliation attestations per close period.
4. Introduce dedicated KMS-backed application secrets vault integration.
5. Add OpenTelemetry traces across all external API boundaries.
