import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { auth, hasConfiguredAuthProvider } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const providerConfigured = hasConfiguredAuthProvider();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-14 md:px-10">
      <div className="grid w-full gap-10 rounded-3xl border border-[var(--border-soft)] bg-[linear-gradient(130deg,rgba(19,41,61,0.72),rgba(10,27,42,0.92))] p-8 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.95)] lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
        <section>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-300)]">Unified Finance Control</p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-[var(--text-100)] md:text-5xl">
            AR, AP, and GL integration hub for NetSuite migration.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--text-300)]">
            Built for team-scale operations: Microsoft SSO, multi-team tenancy, audit trails,
            and source-to-target reconciliation across Unanet exports and Ramp API.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-500)] px-5 py-3 font-semibold text-[var(--canvas-950)] transition hover:bg-[var(--brand-400)]"
            >
              Enter Portal
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard/security"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] px-5 py-3 font-semibold text-[var(--text-200)] transition hover:bg-[var(--surface-800)]"
            >
              Security model
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </div>

          {!providerConfigured && (
            <p className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              No auth provider is configured yet. Add Azure Entra credentials (or local fallback)
              in `.env.local` before signing in.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-900)] p-6">
          <h2 className="font-display text-xl text-[var(--text-100)]">Operational Baseline</h2>
          <ul className="mt-5 space-y-4 text-sm text-[var(--text-300)]">
            <li>Least-privilege OAuth scopes for Ramp and NetSuite.</li>
            <li>Tenant-isolated team data model with role controls.</li>
            <li>Import idempotency and control total reconciliation checks.</li>
            <li>Audit events for login, team changes, and integration actions.</li>
            <li>Security headers and CSP baseline enabled globally.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
