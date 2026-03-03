# Architecture

## Stack
- Framework: Next.js 16 (App Router, TypeScript)
- Auth: NextAuth + Microsoft Entra ID (Azure AD)
- Data: Prisma (jobs, integrations, reconciliation runs) with safe mock fallback
- Visualization: Recharts

## Core Domains
- `src/lib/auth`: authentication, tenancy, RBAC
- `src/lib/integrations`: Ramp API ingestion, NetSuite M2M + totals/JE, Unanet API totals/timesheets, ADP payroll
- `src/lib/workflows`: orchestration for reconciliation and labor cost distribution automation
- `src/lib/reconciliation`: control and variance computations + persistence
- `src/lib/audit.ts`: immutable event logging

## Multi-Team Model
- Team isolation by `teamId` on integration links, import jobs, and reconciliation runs
- Membership roles: `OWNER`, `ADMIN`, `ACCOUNTANT`, `VIEWER`
- User preference stores active team context

## Route Topology
- `/`: landing page
- `/signin`: auth entry
- `/dashboard`: operations overview
- `/dashboard/integrations`: connection and credential posture
- `/dashboard/reconciliation`: run log and tie-out details
- `/dashboard/security`: controls and hardening status

## API Endpoints
- `/api/auth/[...nextauth]`: authentication callbacks
- `/api/teams/active`: active team switch with membership enforcement
- `/api/workflows/reconcile`: authenticated manual run trigger
- `/api/workflows/reconcile/scheduled`: secret-protected scheduled trigger
- `/api/workflows/labor-distribution`: authenticated labor JE distribution trigger
- `/api/workflows/labor-distribution/scheduled`: secret-protected scheduled labor trigger

## Production Upgrade Path
1. Move from SQLite to PostgreSQL.
2. Move scheduled route trigger to queue-driven orchestration (e.g. Temporal/BullMQ).
3. Add reconciliation exception entities and approval workflow tables.
4. Add object storage for immutable source payload archives.
5. Add observability (OpenTelemetry + centralized log aggregation).
6. Deploy behind WAF and managed ingress with TLS termination.
