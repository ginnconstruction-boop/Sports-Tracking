import assert from "node:assert/strict";
import type { DerivedGameState } from "../../src/lib/domain/game-state";
import type {
  FieldPosition,
  PlayParticipant,
  PlayParticipantRole,
  PlayPenalty,
  PlayRecord,
  PlayType,
  TeamSide
} from "../../src/lib/domain/play-log";
import type { StatCredit, StatType } from "../../src/lib/domain/stats";

export type ExpectedCredit = string;

export const playerIds = {
  hqb18: "home-qb18",
  hrb34: "home-rb34",
  hwr5: "home-wr5",
  hk3: "home-k3",
  hp7: "home-p7",
  alb52: "away-lb52",
  adb7: "away-db7",
  aret2: "away-ret2",
  ak9: "away-k9"
} as const;

export function position(side: TeamSide, yardLine: number): FieldPosition {
  return { side, yardLine };
}

export function state(overrides: Partial<DerivedGameState>): DerivedGameState {
  return {
    quarter: 1,
    clockSeconds: 12 * 60,
    phase: "normal",
    possession: "home",
    down: 1,
    distance: 10,
    ballOn: position("home", 25),
    score: {
      home: 0,
      away: 0
    },
    sequenceApplied: "0",
    ...overrides
  };
}

export function participant(
  gameRosterEntryId: string,
  role: PlayParticipantRole,
  side: TeamSide,
  creditUnits = 1
): PlayParticipant {
  return {
    gameRosterEntryId,
    role,
    side,
    creditUnits
  };
}

export function penalty(
  overrides: Partial<PlayPenalty> &
    Pick<PlayPenalty, "penalizedSide" | "code" | "yards" | "result" | "enforcementType" | "timing">
): PlayPenalty {
  return {
    automaticFirstDown: false,
    lossOfDown: false,
    replayDown: false,
    noPlay: false,
    ...overrides
  };
}

export function play<TType extends PlayType>(
  overrides: Partial<PlayRecord<TType>> &
    Pick<PlayRecord<TType>, "sequence" | "quarter" | "clockSeconds" | "possession" | "playType" | "payload">
): PlayRecord<TType> {
  return {
    id: `play-${overrides.sequence}`,
    gameId: "test-game",
    summary: null,
    participants: [],
    penalties: [],
    ...overrides
  };
}

export function teamCredit(side: TeamSide, stat: StatType, value: number): ExpectedCredit {
  return `team:${side}:${stat}:${value}`;
}

export function playerCredit(
  side: TeamSide,
  gameRosterEntryId: string,
  stat: StatType,
  value: number
): ExpectedCredit {
  return `player:${side}:${gameRosterEntryId}:${stat}:${value}`;
}

export function creditKey(credit: StatCredit): ExpectedCredit {
  if (credit.scope === "team") {
    return teamCredit(credit.side, credit.stat, credit.value);
  }

  return playerCredit(credit.side, credit.gameRosterEntryId ?? "unknown", credit.stat, credit.value);
}

export function assertState(actual: DerivedGameState, expected: DerivedGameState) {
  assert.deepEqual(actual, expected);
}
