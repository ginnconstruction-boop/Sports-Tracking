export const membershipRoles = [
  "admin",
  "head_coach",
  "stat_operator",
  "assistant_coach",
  "read_only"
] as const;

export type MembershipRole = (typeof membershipRoles)[number];

const hierarchy: Record<MembershipRole, number> = {
  admin: 5,
  head_coach: 4,
  stat_operator: 3,
  assistant_coach: 2,
  read_only: 1
};

export function hasRoleAccess(current: MembershipRole, required: MembershipRole) {
  return hierarchy[current] >= hierarchy[required];
}

export const roleCapabilities: Record<MembershipRole, string[]> = {
  admin: ["manage_users", "manage_rosters", "manage_games", "write_live_plays", "export_reports"],
  head_coach: ["manage_rosters", "manage_games", "write_live_plays", "export_reports"],
  stat_operator: ["write_live_plays", "export_reports"],
  assistant_coach: ["manage_games", "export_reports"],
  read_only: []
};

