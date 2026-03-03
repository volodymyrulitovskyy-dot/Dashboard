import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";

const controls = [
  {
    title: "Identity and access",
    points: [
      "Google OAuth and Microsoft Entra SSO with optional domain restriction",
      "Role-based access across OWNER/ADMIN/ACCOUNTANT/VIEWER",
      "Team-scoped authorization boundaries",
    ],
  },
  {
    title: "Data protection",
    points: [
      "No secrets in source; env-backed secret references only",
      "Security headers and baseline CSP applied globally",
      "Audit events persisted to DB for sign-in/sign-out and privileged actions",
    ],
  },
  {
    title: "Operational controls",
    points: [
      "Idempotent run keys on import jobs",
      "Control total tracking for every ingestion",
      "Scheduler endpoints can be locked by secret + IP allowlist",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-6 w-6 text-[var(--brand-300)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">SOC readiness</p>
            <h2 className="font-display text-2xl text-[var(--text-100)]">Security posture and controls</h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-300)]">
              This local portal ships with defense-in-depth defaults. Before production, attach managed
              secrets, central logs/SIEM, WAF, continuous vulnerability scanning, and formal change approvals.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {controls.map((control) => (
          <Card key={control.title}>
            <h3 className="font-display text-xl text-[var(--text-100)]">{control.title}</h3>
            <ul className="mt-4 space-y-3 text-sm text-[var(--text-300)]">
              {control.points.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--brand-300)]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-5 w-5 text-[var(--accent-300)]" />
          <div>
            <h3 className="font-display text-xl text-[var(--text-100)]">Mandatory production upgrades</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text-300)]">
              <li>Move database from local SQLite to managed PostgreSQL with encrypted backups.</li>
              <li>Store all integration secrets in a vault (Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault).</li>
              <li>Enable centralized audit/event forwarding to SIEM with retention policy.</li>
              <li>Enforce MFA + conditional access policies for all SSO providers.</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
