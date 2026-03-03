import type { TeamRole } from "@/lib/data/types";

const roleRank: Record<TeamRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  ACCOUNTANT: 2,
  VIEWER: 1,
};

export function hasRole(userRole: TeamRole, minimumRole: TeamRole) {
  return roleRank[userRole] >= roleRank[minimumRole];
}

export function assertRole(userRole: TeamRole, minimumRole: TeamRole) {
  if (!hasRole(userRole, minimumRole)) {
    throw new Error(`Insufficient role: required ${minimumRole}`);
  }
}
