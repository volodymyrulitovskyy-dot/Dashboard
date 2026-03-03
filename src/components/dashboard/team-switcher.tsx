"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Team = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  role: string;
};

type TeamSwitcherProps = {
  teams: Team[];
  activeTeamId?: string;
};

export function TeamSwitcher({ teams, activeTeamId }: TeamSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] px-3 py-2 text-sm text-[var(--text-200)]">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">
        Team
      </span>
      <select
        className="min-w-44 bg-transparent text-[var(--text-100)] outline-none"
        defaultValue={activeTeamId ?? teams[0]?.teamId}
        disabled={isPending}
        onChange={(event) => {
          const value = event.target.value;
          startTransition(async () => {
            try {
              const response = await fetch("/api/teams/active", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ teamId: value }),
              });

              if (!response.ok) {
                router.refresh();
                return;
              }

              router.refresh();
            } catch {
              router.refresh();
            }
          });
        }}
      >
        {teams.map((team) => (
          <option key={team.teamId} value={team.teamId}>
            {team.teamName} ({team.role})
          </option>
        ))}
      </select>
    </label>
  );
}
