# Interim Data Strategy (Supabase)

## Why Interim SQL Exists
Interim storage is the control point between source systems and target systems. It allows:
- replay-safe processing,
- forensic traceability,
- reconciliations and exception management,
- separation of extraction, transformation, and posting concerns.

## Storage Location Decision
Chosen system: Supabase Postgres.

Rationale:
- Already integrated into project runtime and deployment footprint.
- Strong SQL capabilities for accounting controls and audit queries.
- Supports RLS and service-role separation.
- Suitable for operational analytics and close-period reporting.

## Table Groups
- Run control:
  - `InterimPipelineRun`
- Raw ingested evidence:
  - `InterimRawPayload`
- Canonical transformed records:
  - `InterimNormalizedRecord`
- Reconciliation outcomes:
  - `InterimReconciliationSnapshot`
- Labor allocation evidence:
  - `InterimLaborAllocation`
- Outbound accounting payload evidence:
  - `InterimJournalEntryLine`

## Retention Guidance
- Raw payloads: 13 months minimum (or policy-required retention).
- Normalized and outcome records: 24 months minimum for comparative close analysis.
- Audit events: align with compliance retention (often 2-7 years by policy).

## PII and Sensitive Data Rules
- Do not store full credentials/tokens in interim payload tables.
- Store employee identifiers required for accounting only; avoid unnecessary HR attributes.
- Hash payloads and record request IDs for chain-of-custody evidence.

## Migration File
`supabase/migrations/20260303_0002_interim_pipeline_tables.sql`

Apply this migration through your Supabase migration workflow before enabling full production automation.
