import type { TeamSide } from "@/lib/domain/play-log";

export const statTypes = [
  "first_down",
  "third_down_attempt",
  "third_down_conversion",
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
  "receiving_target",
  "receiving_reception",
  "receiving_yards",
  "receiving_touchdown",
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
  "return_touchdown",
  "punt",
  "punt_yards",
  "kickoff",
  "kick_yards",
  "field_goal_made",
  "field_goal_attempt",
  "extra_point_made",
  "extra_point_attempt",
  "two_point_made",
  "two_point_attempt",
  "team_points"
] as const;

export type StatType = (typeof statTypes)[number];

export type StatCredit = {
  scope: "player" | "team";
  stat: StatType;
  value: number;
  side: TeamSide;
  gameRosterEntryId?: string;
};

export type StatProjection = {
  playerTotals: Record<string, Partial<Record<StatType, number>>>;
  teamTotals: Record<TeamSide, Partial<Record<StatType, number>>>;
};
