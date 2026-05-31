import type { StatType } from "@/lib/domain/stats";

const offenseStats = new Set<StatType>([
  "first_down",
  "first_down_rush",
  "first_down_pass",
  "first_down_penalty",
  "third_down_attempt",
  "third_down_conversion",
  "fourth_down_attempt",
  "fourth_down_conversion",
  "red_zone_trip",
  "red_zone_score",
  "goal_to_go_trip",
  "goal_to_go_score",
  "rushing_attempt",
  "rushing_yards",
  "rushing_touchdown",
  "passing_attempt",
  "passing_completion",
  "passing_yards",
  "passing_touchdown",
  "interception_thrown",
  "sacks_allowed",
  "sack_yards_lost",
  "total_offense_yards",
  "turnover_lost",
  "receiving_target",
  "receiving_reception",
  "receiving_yards",
  "receiving_touchdown",
  "team_points"
]);

const defenseStats = new Set<StatType>([
  "turnover_gained",
  "solo_tackle",
  "assist_tackle",
  "sack",
  "tfl",
  "qb_hurry",
  "pass_breakup",
  "interception",
  "forced_fumble",
  "fumble_recovery",
  "return_yards",
  "return_touchdown"
]);

const specialTeamsStats = new Set<StatType>([
  "punt",
  "punt_yards",
  "kickoff",
  "kick_yards",
  "field_goal_made",
  "field_goal_attempt",
  "extra_point_made",
  "extra_point_attempt",
  "two_point_made",
  "two_point_attempt"
]);

export type StatGroup = "offense" | "defense" | "special_teams" | "other";

export function getStatGroup(stat: StatType): StatGroup {
  if (offenseStats.has(stat)) {
    return "offense";
  }

  if (defenseStats.has(stat)) {
    return "defense";
  }

  if (specialTeamsStats.has(stat)) {
    return "special_teams";
  }

  return "other";
}

export function splitTotalsByGroup(
  totals: Record<string, number | undefined>
): Record<StatGroup, Array<[string, number]>> {
  const grouped: Record<StatGroup, Array<[string, number]>> = {
    offense: [],
    defense: [],
    special_teams: [],
    other: []
  };

  for (const [key, value] of Object.entries(totals)) {
    if (typeof value !== "number" || value === 0) {
      continue;
    }

    const group = getStatGroup(key as StatType);
    grouped[group].push([key, value]);
  }

  return grouped;
}
