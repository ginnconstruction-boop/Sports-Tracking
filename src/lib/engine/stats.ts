import type {
  ExtraPointPlayPayload,
  FieldGoalPlayPayload,
  KickoffPlayPayload,
  PassPlayPayload,
  PlayRecord,
  PuntPlayPayload,
  RunPlayPayload,
  TurnoverPlayPayload,
  TwoPointTryPlayPayload
} from "@/lib/domain/play-log";
import type { StatCredit, StatProjection, StatType } from "@/lib/domain/stats";

const teamRollupStatsFromPlayers = new Set<StatType>([
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

function addStat(
  target: Partial<Record<StatType, number>>,
  stat: StatType,
  value: number
) {
  target[stat] = (target[stat] ?? 0) + value;
}

export function accumulateStatProjection(credits: StatCredit[]): StatProjection {
  const projection: StatProjection = {
    playerTotals: {},
    teamTotals: {
      home: {},
      away: {}
    }
  };

  for (const credit of credits) {
    if (credit.scope === "team" || teamRollupStatsFromPlayers.has(credit.stat)) {
      addStat(projection.teamTotals[credit.side], credit.stat, credit.value);
    }

    if (credit.scope === "player" && credit.gameRosterEntryId) {
      projection.playerTotals[credit.gameRosterEntryId] ??= {};
      addStat(projection.playerTotals[credit.gameRosterEntryId], credit.stat, credit.value);
    }
  }

  return projection;
}

function playerCreditsForRole(
  play: PlayRecord,
  role: PlayRecord["participants"][number]["role"],
  stat: StatType,
  value: number
) {
  return play.participants
    .filter((participant) => participant.role === role && participant.gameRosterEntryId)
    .map((participant) => ({
      scope: "player" as const,
      side: participant.side,
      gameRosterEntryId: participant.gameRosterEntryId,
      stat,
      value
    }));
}

export function projectStatCreditsFromPlay(play: PlayRecord): StatCredit[] {
  const credits: StatCredit[] = [];

  switch (play.playType) {
    case "run": {
      const payload = play.payload as RunPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "rushing_attempt", value: 1 });
      credits.push({ scope: "team", side: play.possession, stat: "rushing_yards", value: payload.yards });
      credits.push(...playerCreditsForRole(play, "ball_carrier", "rushing_attempt", 1));
      credits.push(...playerCreditsForRole(play, "ball_carrier", "rushing_yards", payload.yards));
      if (payload.touchdown) {
        credits.push({ scope: "team", side: play.possession, stat: "rushing_touchdown", value: 1 });
        credits.push({ scope: "team", side: play.possession, stat: "team_points", value: 6 });
        credits.push(...playerCreditsForRole(play, "ball_carrier", "rushing_touchdown", 1));
      }
      break;
    }
    case "pass": {
      const payload = play.payload as PassPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "passing_attempt", value: 1 });
      credits.push(...playerCreditsForRole(play, "passer", "passing_attempt", 1));
      credits.push(...playerCreditsForRole(play, "target", "receiving_target", 1));
      if (payload.result === "complete") {
        credits.push({ scope: "team", side: play.possession, stat: "passing_completion", value: 1 });
        credits.push({ scope: "team", side: play.possession, stat: "passing_yards", value: payload.yards });
        credits.push(...playerCreditsForRole(play, "passer", "passing_completion", 1));
        credits.push(...playerCreditsForRole(play, "passer", "passing_yards", payload.yards));
        credits.push(...playerCreditsForRole(play, "target", "receiving_reception", 1));
        credits.push(...playerCreditsForRole(play, "target", "receiving_yards", payload.yards));
        if (payload.touchdown) {
          credits.push({ scope: "team", side: play.possession, stat: "passing_touchdown", value: 1 });
          credits.push({ scope: "team", side: play.possession, stat: "team_points", value: 6 });
          credits.push(...playerCreditsForRole(play, "passer", "passing_touchdown", 1));
          credits.push(...playerCreditsForRole(play, "target", "receiving_touchdown", 1));
        }
      }
      if (payload.result === "interception") {
        credits.push({ scope: "team", side: play.possession, stat: "interception_thrown", value: 1 });
        credits.push(...playerCreditsForRole(play, "passer", "interception_thrown", 1));
        credits.push(...playerCreditsForRole(play, "interceptor", "interception", 1));
      }
      break;
    }
    case "sack":
      credits.push({ scope: "team", side: play.possession, stat: "passing_attempt", value: 1 });
      credits.push(...playerCreditsForRole(play, "sack_credit", "sack", 1));
      break;
    case "punt": {
      const payload = play.payload as PuntPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "punt", value: 1 });
      credits.push({ scope: "team", side: play.possession, stat: "punt_yards", value: payload.puntDistance });
      credits.push(...playerCreditsForRole(play, "punter", "punt", 1));
      credits.push(...playerCreditsForRole(play, "punter", "punt_yards", payload.puntDistance));
      if (payload.returnYards) {
        credits.push(...playerCreditsForRole(play, "returner", "return_yards", payload.returnYards));
      }
      break;
    }
    case "kickoff": {
      const payload = play.payload as KickoffPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "kickoff", value: 1 });
      credits.push({ scope: "team", side: play.possession, stat: "kick_yards", value: payload.kickDistance });
      credits.push(...playerCreditsForRole(play, "kicker", "kickoff", 1));
      credits.push(...playerCreditsForRole(play, "kicker", "kick_yards", payload.kickDistance));
      if (payload.returnYards) {
        credits.push(...playerCreditsForRole(play, "returner", "return_yards", payload.returnYards));
      }
      break;
    }
    case "field_goal": {
      const payload = play.payload as FieldGoalPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "field_goal_attempt", value: 1 });
      credits.push(...playerCreditsForRole(play, "kicker", "field_goal_attempt", 1));
      if (payload.result === "good") {
        credits.push({ scope: "team", side: play.possession, stat: "field_goal_made", value: 1 });
        credits.push({ scope: "team", side: play.possession, stat: "team_points", value: 3 });
        credits.push(...playerCreditsForRole(play, "kicker", "field_goal_made", 1));
      }
      break;
    }
    case "extra_point": {
      const payload = play.payload as ExtraPointPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "extra_point_attempt", value: 1 });
      credits.push(...playerCreditsForRole(play, "kicker", "extra_point_attempt", 1));
      if (payload.result === "good") {
        credits.push({ scope: "team", side: play.possession, stat: "extra_point_made", value: 1 });
        credits.push({ scope: "team", side: play.possession, stat: "team_points", value: 1 });
        credits.push(...playerCreditsForRole(play, "kicker", "extra_point_made", 1));
      }
      break;
    }
    case "two_point_try": {
      const payload = play.payload as TwoPointTryPlayPayload;
      credits.push({ scope: "team", side: play.possession, stat: "two_point_attempt", value: 1 });
      if (payload.result === "good") {
        credits.push({ scope: "team", side: play.possession, stat: "two_point_made", value: 1 });
        credits.push({ scope: "team", side: play.possession, stat: "team_points", value: 2 });
      }
      break;
    }
    case "turnover": {
      const payload = play.payload as TurnoverPlayPayload;
      if (payload.turnoverKind === "interception_return") {
        credits.push(...playerCreditsForRole(play, "interceptor", "interception", 1));
      }
      if (payload.touchdown) {
        credits.push({
          scope: "team",
          side: play.possession === "home" ? "away" : "home",
          stat: "team_points",
          value: 6
        });
        credits.push(...playerCreditsForRole(play, "returner", "return_touchdown", 1));
      }
      credits.push(...playerCreditsForRole(play, "returner", "return_yards", payload.returnYards));
      break;
    }
    default:
      break;
  }

  credits.push(...playerCreditsForRole(play, "solo_tackle", "solo_tackle", 1));
  credits.push(...playerCreditsForRole(play, "assist_tackle", "assist_tackle", 1));
  credits.push(...playerCreditsForRole(play, "tfl_credit", "tfl", 1));
  credits.push(...playerCreditsForRole(play, "hurry_credit", "qb_hurry", 1));
  credits.push(...playerCreditsForRole(play, "pass_breakup", "pass_breakup", 1));
  credits.push(...playerCreditsForRole(play, "forced_fumble", "forced_fumble", 1));
  credits.push(...playerCreditsForRole(play, "fumble_recovery", "fumble_recovery", 1));

  return credits;
}
