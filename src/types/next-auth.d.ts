import type { TeamRole } from "@/lib/data/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      activeTeamId?: string;
      teams: Array<{
        teamId: string;
        teamName: string;
        teamSlug: string;
        role: TeamRole;
      }>;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    activeTeamId?: string;
    teams?: Array<{
      teamId: string;
      teamName: string;
      teamSlug: string;
      role: TeamRole;
    }>;
  }
}
