# Security Architecture and Hardening Standard

## 1. Security Objectives
- Protect confidentiality of financial and payroll data in transit and at rest.
- Protect integrity of reconciliations and labor journal postings.
- Guarantee traceability for audit, incident response, and compliance evidence.
- Minimize blast radius through tenant isolation and least privilege.

## 2. Threat Model (STRIDE-Oriented)
### Spoofing
- Risk: unauthorized actors invoke workflow endpoints.
- Controls:
  - Session-based auth for manual routes.
  - Secret-based auth for scheduled routes.
  - Optional scheduler source IP allowlist (`WORKFLOW_ALLOWED_IPS`).
  - Constant-time secret comparison.

### Tampering
- Risk: manipulation of payloads, run data, or JE lines.
- Controls:
  - Idempotent run keys.
  - Interim payload hashing and immutable raw payload retention.
  - DB constraints and indexed run lineage.
  - Audit event persistence for critical actions.

### Repudiation
- Risk: inability to prove who did what.
- Controls:
  - Durable `AuditEvent` storage in Postgres.
  - Workflow audit events include actor, team, action category.
  - Request identifiers attached via middleware (`x-request-id`).

### Information Disclosure
- Risk: leakage of credentials or financial data.
- Controls:
  - Secrets in environment variables only.
  - Log redaction for authorization headers, cookies, tokens, secrets, private keys.
  - CSP, frame denial, strict transport security, restrictive permissions policy.
  - Browser roles (`anon`, `authenticated`) denied direct interim table access.

### Denial of Service
- Risk: endpoint abuse, brute-force attempts, scheduler flooding.
- Controls:
  - Per-route rate limiting for auth and workflow endpoints.
  - Origin validation for state-changing authenticated routes.
  - Reduced response detail in production error paths.

### Elevation of Privilege
- Risk: user obtains accountant/admin capabilities without authorization.
- Controls:
  - Explicit RBAC checks at route level.
  - Admin role assignment via allowlisted emails (`APP_ADMIN_EMAILS`).
  - Tenant-scoped context checks before operations.

## 3. Identity and Access Management
- SSO Providers: Google OAuth and Microsoft Entra ID.
- Fallback: local admin credentials only for controlled scenarios.
- Role model: `OWNER` > `ADMIN` > `ACCOUNTANT` > `VIEWER`.
- Team boundary: each record and workflow run is tied to `teamId`.

Admin policy:
- Production admin identities defined in `APP_ADMIN_EMAILS`.
- Local fallback admin defined by `LOCAL_ADMIN_EMAIL` and hashed password preferred.

## 4. API Security Controls
Manual workflow endpoints:
- Require authenticated session.
- Require same-origin mutation checks (`Origin`/`Referer`).
- Require minimum role (`ACCOUNTANT`).
- Rate limited per source IP.

Scheduled workflow endpoints:
- Require `WORKFLOW_API_SECRET` via bearer or header.
- Optional source IP enforcement via `WORKFLOW_ALLOWED_IPS`.
- Rate limited per source IP.

## 5. Data Security Model
- Primary operational DB: Supabase Postgres.
- Core entities: users, teams, integration connections, import jobs, reconciliation runs, audit events.
- Interim staging entities: run metadata, raw payloads, normalized records, variance snapshots, labor allocations, JE lines.

Data handling requirements:
- Encrypt in transit (TLS 1.2+).
- Encrypt at rest (provider-managed + disk-level encryption).
- Enforce backup retention and periodic restore drills.
- Retain immutable staging evidence per close period.

## 6. Secret and Key Management
- Keep secrets out of source control and PR artifacts.
- Store production secrets in Vercel project environment variables.
- Rotate on schedule and after exposure events.
- NetSuite private keys and OAuth secrets must be rotated immediately if ever disclosed.

Minimum rotation cadence:
- OAuth client secrets: every 90 days.
- Workflow secret: every 60 days.
- Database credentials/service keys: every 90 days.

## 7. Platform and Network Controls
- Mandatory headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP/CORP.
- Protected route cache suppression: `Cache-Control: no-store` on authenticated middleware paths.
- No unnecessary framework fingerprinting headers.
- Optional origin allowlist extension via `APP_ALLOWED_ORIGINS` for controlled multi-domain deployments.

## 8. Secure SDLC Requirements
- Branch protection and mandatory PR reviews.
- Automated lint/type checks on every PR.
- Dependency audit scanning (`npm audit` or SCA tool).
- Secret scanning in CI and GitHub Advanced Security (or equivalent).
- SAST/DAST in pipeline prior to production promotion.

## 9. Monitoring and Detection
- Centralize application logs and audit events to SIEM.
- Alert on:
  - repeated auth failures,
  - scheduler auth failures,
  - sudden variance spikes,
  - unusual workflow volume,
  - data extraction anomalies.
- Preserve logs/audit evidence for finance compliance retention requirements.

## 10. Incident Response Runbook (Summary)
1. Detect and classify incident severity.
2. Contain affected secrets/integrations (revoke and rotate keys).
3. Preserve forensic evidence (audit rows, logs, run IDs, payload hashes).
4. Eradicate root cause and patch.
5. Recover via controlled deployment and data validation checks.
6. Produce post-incident review with control improvements.

## 11. Production Go-Live Gate
All items must pass before unrestricted production launch:
- SSO provider configured and tested.
- Admin allowlist configured (`APP_ADMIN_EMAILS`).
- Workflow secret configured and rotated.
- Scheduler IP allowlist configured where possible.
- Supabase migration baseline applied.
- Backup/restore drill executed successfully.
- Security scan findings triaged with no critical open issues.
- Monitoring, alerting, and incident contacts validated.

## 12. Residual Risk Notes
- In-memory rate limiting is process-local; distributed enforcement should be added for high-volume production.
- External API dependency outages can delay close operations; queue-based retries are recommended.
- Financial logic changes require dual control and change approval to prevent silent accounting drift.
