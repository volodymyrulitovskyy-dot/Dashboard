# Security Baseline

## Implemented Controls
- Microsoft Entra SSO support with optional email-domain allow-list.
- Team-scoped RBAC with explicit role checks.
- Security headers: CSP, HSTS, X-Frame-Options, nosniff, permissions policy.
- API rate limiting on manual and scheduled workflow endpoints.
- Same-origin validation on state-changing session-authenticated endpoints.
- Audit logging for auth and tenancy events.
- Secret redaction in logs.
- No hard-coded credentials in source.

## SOC-Oriented Practices
- Least privilege API scopes for Ramp, NetSuite, Unanet, and ADP.
- Secret-protected scheduler endpoint (`WORKFLOW_API_SECRET`) for automated runs.
- Segregation by team (`teamId`) on all finance records.
- Import idempotency (`runKey`) to prevent replay duplication.
- Control totals captured and surfaced for reconciliation and labor JE posting.

## Required Before Production
- Managed PostgreSQL with encryption-at-rest + backup testing.
- Centralized secrets manager and periodic key rotation.
- SIEM integration for audit/event streams.
- MFA and conditional access policies in Entra.
- Incident response runbook and change-management approvals.
- SAST/DAST + dependency and container scanning in CI/CD.
