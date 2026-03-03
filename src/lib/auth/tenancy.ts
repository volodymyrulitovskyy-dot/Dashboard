import { cookies } from "next/headers";

import { auth } from "@/auth";
import { getTeamsForUser } from "@/lib/data/mock-data";
import type { TeamRole } from "@/lib/data/types";

export type TeamContext = {
  userId: string;
  activeTeamId: string;
  role: TeamRole;
};

export async function getTeamContext(): Promise<TeamContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const teams = session.user.teams ?? getTeamsForUser();
  if (!teams.length) {
    throw new Error("No team membership found for this user");
  }

  const cookieStore = await cookies();
  const activeTeamCookie = cookieStore.get("active_team_id")?.value;

  const fallbackTeamId =
    session.user.activeTeamId ??
    teams.find((team) => team.teamId === activeTeamCookie)?.teamId ??
    teams[0]?.teamId;

  const activeTeam = teams.find((team) => team.teamId === fallbackTeamId) ?? teams[0];

  return {
    userId: session.user.id,
    activeTeamId: activeTeam.teamId,
    role: activeTeam.role,
  };
}

export async function ensureTeamForUser() {
  return;
}
