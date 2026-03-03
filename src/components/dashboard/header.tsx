import { Shield, Sparkles } from "lucide-react";

import { TeamSwitcher } from "@/components/dashboard/team-switcher";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

type DashboardHeaderProps = {
  userName?: string | null;
  teams: Array<{
    teamId: string;
    teamName: string;
    teamSlug: string;
    role: string;
  }>;
  activeTeamId?: string;
};

export function DashboardHeader({
  userName,
  teams,
  activeTeamId,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-900)] px-5 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-400)]">Finance Control Plane</p>
        <h1 className="font-display text-2xl text-[var(--text-100)]">
          Good afternoon{userName ? `, ${userName}` : ""}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-xs text-[var(--text-200)]">
          <Shield className="h-4 w-4 text-[var(--brand-300)]" />
          SOC baseline active
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-xs text-[var(--text-200)]">
          <Sparkles className="h-4 w-4 text-[var(--accent-300)]" />
          Reconciliation AI hints
        </div>
        <TeamSwitcher teams={teams} activeTeamId={activeTeamId} />
        <SignOutButton />
      </div>
    </header>
  );
}
