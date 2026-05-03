import type {
  AppliedPenalty,
  BasePlayResult,
  DerivedGameState,
  FinalizedPlayResult,
  GameProjection,
  PartialRebuildOptions,
  RebuildTimelineItem
} from "@/lib/domain/game-state";
import type {
  ExtraPointPlayPayload,
  FieldPosition,
  FieldGoalPlayPayload,
  KickoffPlayPayload,
  PassPlayPayload,
  PlayPenalty,
  PlayRecord,
  RunPlayPayload,
  SackPlayPayload,
  TeamSide
} from "@/lib/domain/play-log";
import type { GameStateCorrection } from "@/lib/domain/state-corrections";
import type { ScoreCorrection } from "@/lib/domain/score-corrections";
import type { StatProjection, StatType } from "@/lib/domain/stats";
import { buildPlaySummary } from "@/lib/engine/summary";
import { compareSequence, isSequenceOnOrAfter } from "@/lib/engine/sequence";
import { accumulateStatProjection, projectStatCreditsFromPlay } from "@/lib/engine/stats";

export const INITIAL_GAME_STATE: DerivedGameState = {
  quarter: 1,
  clockSeconds: 12 * 60,
  phase: "kickoff",
  possession: "home",
  down: 1,
  distance: 10,
  ballOn: {
    side: "home",
    yardLine: 35
  },
  score: {
    home: 0,
    away: 0
  },
  sequenceApplied: "0"
};

function addTeamTotal(
  totals: Record<TeamSide, Partial<Record<StatType, number>>>,
  side: TeamSide,
  stat: StatType,
  value: number
) {
  totals[side][stat] = (totals[side][stat] ?? 0) + value;
}

function mergeStatProjection(base: StatProjection, teamAdditions: Record<TeamSide, Partial<Record<StatType, number>>>) {
  const merged: StatProjection = {
    playerTotals: base.playerTotals,
    teamTotals: {
      home: { ...base.teamTotals.home },
      away: { ...base.teamTotals.away }
    }
  };

  for (const side of ["home", "away"] as const) {
    for (const [stat, value] of Object.entries(teamAdditions[side])) {
      if (value === undefined) {
        continue;
      }

      const typedStat = stat as StatType;
      merged.teamTotals[side][typedStat] = (merged.teamTotals[side][typedStat] ?? 0) + value;
    }
  }

  return merged;
}

function deriveTeamSituationalStats(timeline: RebuildTimelineItem[]) {
  const totals: Record<TeamSide, Partial<Record<StatType, number>>> = {
    home: {},
    away: {}
  };

  let activePossessionSide: TeamSide | null = null;
  let countedRedZoneForPossession = false;
  let countedRedZoneScoreForPossession = false;
  let countedGoalToGoForPossession = false;
  let countedGoalToGoScoreForPossession = false;
  let previousFinalPhase: DerivedGameState["phase"] | null = null;

  for (const item of timeline) {
    const { play, baseResult, finalState } = item.result;
    const offense = play.possession;
    const acceptedPenalties = play.penalties.filter((penalty) => penalty.result === "accepted");
    const hasOffsettingPenalty = play.penalties.some((penalty) => penalty.result === "offsetting");
    const hasNoPlayPenalty = acceptedPenalties.some((penalty) => penalty.noPlay);
    const automaticFirstDown = acceptedPenalties.some((penalty) => penalty.automaticFirstDown);
    const startsNewPossession =
      activePossessionSide === null ||
      offense !== activePossessionSide ||
      previousFinalPhase !== "normal";

    if (startsNewPossession) {
      countedRedZoneForPossession = false;
      countedRedZoneScoreForPossession = false;
      countedGoalToGoForPossession = false;
      countedGoalToGoScoreForPossession = false;
    }

    const legalDownPlay = !hasOffsettingPenalty && !hasNoPlayPenalty;
    const playStartedInNormalPhase = baseResult.metadata.phaseBeforePlay === "normal";
    const offenseKeptBall =
      finalState.phase === "normal" &&
      finalState.possession === offense &&
      !baseResult.metadata.possessionChanged;
    const earnedFirstDown =
      playStartedInNormalPhase &&
      offenseKeptBall &&
      finalState.down === 1 &&
      (baseResult.firstDownAchieved || automaticFirstDown);

    if (earnedFirstDown) {
      addTeamTotal(totals, offense, "first_down", 1);
    }

    const thirdDownAttempt =
      playStartedInNormalPhase &&
      baseResult.metadata.downBeforePlay === 3 &&
      legalDownPlay;

    if (thirdDownAttempt) {
      addTeamTotal(totals, offense, "third_down_attempt", 1);

      const thirdDownConverted =
        (offenseKeptBall && finalState.down === 1 && (baseResult.firstDownAchieved || automaticFirstDown)) ||
        baseResult.metadata.scoringTeam === offense;

      if (thirdDownConverted) {
        addTeamTotal(totals, offense, "third_down_conversion", 1);
      }
    }

    const startedSnapInRedZone =
      playStartedInNormalPhase &&
      legalDownPlay &&
      baseResult.metadata.previousSpot.side !== offense &&
      baseResult.metadata.previousSpot.yardLine <= 20;

    if (startedSnapInRedZone && !countedRedZoneForPossession) {
      addTeamTotal(totals, offense, "red_zone_trip", 1);
      countedRedZoneForPossession = true;
    }

    const startedSnapInGoalToGo =
      playStartedInNormalPhase &&
      legalDownPlay &&
      baseResult.metadata.previousSpot.side !== offense &&
      baseResult.metadata.previousSpot.yardLine <= 10;

    if (startedSnapInGoalToGo && !countedGoalToGoForPossession) {
      addTeamTotal(totals, offense, "goal_to_go_trip", 1);
      countedGoalToGoForPossession = true;
    }

    const offenseScoredOnLegalPlay =
      legalDownPlay && baseResult.metadata.scoringTeam === offense;

    if (offenseScoredOnLegalPlay && countedRedZoneForPossession && !countedRedZoneScoreForPossession) {
      addTeamTotal(totals, offense, "red_zone_score", 1);
      countedRedZoneScoreForPossession = true;
    }

    if (offenseScoredOnLegalPlay && countedGoalToGoForPossession && !countedGoalToGoScoreForPossession) {
      addTeamTotal(totals, offense, "goal_to_go_score", 1);
      countedGoalToGoScoreForPossession = true;
    }

    activePossessionSide = offense;
    previousFinalPhase = finalState.phase;
  }

  return totals;
}

function clampYardLine(yardLine: number) {
  return Math.min(99, Math.max(1, yardLine));
}

function applySituationCorrection(
  state: DerivedGameState,
  correction: GameStateCorrection
): DerivedGameState {
  return {
    ...state,
    quarter: correction.quarter ?? state.quarter,
    phase: "normal",
    possession: correction.possession,
    down: correction.down,
    distance: correction.distance,
    ballOn: correction.ballOn,
    sequenceApplied: correction.appliesAfterSequence
  };
}

function applyScoreCorrection(
  state: DerivedGameState,
  correction: ScoreCorrection
): DerivedGameState {
  return {
    ...state,
    score: {
      home: correction.score.home,
      away: correction.score.away
    },
    sequenceApplied: correction.appliesAfterSequence
  };
}

function flipSide(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function advanceField(position: FieldPosition, yards: number, offense: TeamSide): FieldPosition {
  const direction = position.side === offense ? 1 : -1;
  const nextLine = position.yardLine + yards * direction;

  if (nextLine > 50) {
    return {
      side: offense === "home" ? "away" : "home",
      yardLine: clampYardLine(100 - nextLine)
    };
  }

  if (nextLine <= 0) {
    return {
      side: offense,
      yardLine: 1
    };
  }

  return {
    side: position.side,
    yardLine: clampYardLine(nextLine)
  };
}

function fieldCoordinate(position: FieldPosition, offense: TeamSide) {
  return position.side === offense ? position.yardLine : 100 - position.yardLine;
}

function lineToGainSpot(state: DerivedGameState) {
  return advanceField(state.ballOn, state.distance, state.possession);
}

function hasReachedLineToGain(
  currentSpot: FieldPosition,
  targetSpot: FieldPosition,
  offense: TeamSide
) {
  return fieldCoordinate(currentSpot, offense) >= fieldCoordinate(targetSpot, offense);
}

function distanceToLineToGain(
  currentSpot: FieldPosition,
  targetSpot: FieldPosition,
  offense: TeamSide
) {
  return Math.max(1, fieldCoordinate(targetSpot, offense) - fieldCoordinate(currentSpot, offense));
}

function stateForPlay(previous: DerivedGameState, play: PlayRecord): DerivedGameState {
  return {
    ...previous,
    quarter: play.quarter,
    clockSeconds: play.clockSeconds,
    possession: play.possession,
    sequenceApplied: play.sequence,
    ballOn: "startBall" in play.payload && play.payload.startBall ? play.payload.startBall : previous.ballOn
  };
}

function nullifiedState(previous: DerivedGameState, sequence: string, quarter: number, clockSeconds: number) {
  return {
    ...previous,
    quarter: quarter as 1 | 2 | 3 | 4 | 5,
    clockSeconds,
    sequenceApplied: sequence
  };
}

function scorePoints(state: DerivedGameState, side: TeamSide, points: number) {
  return {
    ...state,
    score: {
      ...state.score,
      [side]: state.score[side] + points
    }
  };
}

function setKickoffState(state: DerivedGameState, kickingTeam: TeamSide) {
  return {
    ...state,
    phase: "kickoff" as const,
    possession: kickingTeam,
    down: 1 as const,
    distance: 10,
    ballOn: {
      side: kickingTeam,
      yardLine: 35
    }
  };
}

function receivingTouchbackSpot(kickingTeam: TeamSide): FieldPosition {
  return {
    side: flipSide(kickingTeam),
    yardLine: 25
  };
}

function setTryState(state: DerivedGameState, scoringTeam: TeamSide) {
  return {
    ...state,
    phase: "try" as const,
    possession: scoringTeam,
    down: 1 as const,
    distance: 3,
    ballOn: {
      side: flipSide(scoringTeam),
      yardLine: 3
    }
  };
}

function normalSeriesState(state: DerivedGameState, possession: TeamSide) {
  return {
    ...state,
    phase: "normal" as const,
    possession,
    down: 1 as const,
    distance: 10
  };
}

function applyPhaseDistanceRules(state: DerivedGameState) {
  if (state.phase === "kickoff") {
    state.down = 1;
    state.distance = 10;
    return;
  }

  if (state.phase === "try") {
    state.down = 1;
    state.distance = state.ballOn.yardLine;
  }
}

export function applyBasePlay(previous: DerivedGameState, play: PlayRecord): BasePlayResult {
  const next = stateForPlay(previous, play);
  const metadata: BasePlayResult["metadata"] = {
    previousSpot: previous.ballOn,
    endSpot: next.ballOn,
    downBeforePlay: previous.down,
    distanceBeforePlay: previous.distance,
    possessionBeforePlay: previous.possession,
    phaseBeforePlay: previous.phase,
    nextPhase: previous.phase,
    possessionChanged: false
  };
  const statCredits = projectStatCreditsFromPlay(play);
  let touchdown = false;
  let turnover = false;
  let firstDownAchieved = false;

  switch (play.playType) {
    case "run": {
      const payload = play.payload as RunPlayPayload;
      next.phase = "normal";
      next.ballOn = advanceField(next.ballOn, payload.yards, play.possession);
      metadata.endSpot = next.ballOn;
      touchdown = payload.touchdown === true;
      firstDownAchieved = payload.firstDown === true || payload.yards >= previous.distance;

      if (payload.fumbleLost) {
        turnover = true;
        metadata.possessionChanged = true;
        next.possession = flipSide(play.possession);
        Object.assign(next, normalSeriesState(next, next.possession));
        metadata.nextPhase = "normal";
      } else if (touchdown) {
        Object.assign(next, scorePoints(next, play.possession, 6));
        Object.assign(next, setTryState(next, play.possession));
        metadata.nextPhase = "try";
        metadata.scoringTeam = play.possession;
      } else if (firstDownAchieved) {
        next.down = 1;
        next.distance = 10;
      } else {
        next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
        next.distance = Math.max(1, previous.distance - payload.yards);
      }
      break;
    }
    case "pass": {
      const payload = play.payload as PassPlayPayload;
      next.phase = "normal";
      if (payload.result === "complete") {
        next.ballOn = advanceField(next.ballOn, payload.yards, play.possession);
        metadata.endSpot = next.ballOn;
        touchdown = payload.touchdown === true;
        firstDownAchieved = payload.firstDown === true || payload.yards >= previous.distance;

        if (touchdown) {
          Object.assign(next, scorePoints(next, play.possession, 6));
          Object.assign(next, setTryState(next, play.possession));
          metadata.nextPhase = "try";
          metadata.scoringTeam = play.possession;
        } else if (firstDownAchieved) {
          next.down = 1;
          next.distance = 10;
        } else {
          next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
          next.distance = Math.max(1, previous.distance - payload.yards);
        }
      } else if (payload.result === "interception") {
        turnover = true;
        metadata.possessionChanged = true;
        next.possession = flipSide(play.possession);
        const interceptionSpot =
          typeof payload.airYards === "number"
            ? advanceField(next.ballOn, payload.airYards, play.possession)
            : next.ballOn;
        const returnYards = payload.returnYards ?? (payload.airYards === undefined ? payload.yards : 0);
        next.ballOn = advanceField(interceptionSpot, returnYards, next.possession);
        metadata.endSpot = next.ballOn;
        metadata.postChangePossessionSpot = next.ballOn;
        Object.assign(next, normalSeriesState(next, next.possession));
        metadata.nextPhase = "normal";
      } else {
        next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
      }
      break;
    }
    case "sack": {
      const payload = play.payload as SackPlayPayload;
      next.phase = "normal";
      next.ballOn = advanceField(next.ballOn, -payload.yardsLost, play.possession);
      metadata.endSpot = next.ballOn;
      next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
      next.distance = previous.distance + payload.yardsLost;
      if (payload.fumbleLost) {
        turnover = true;
        metadata.possessionChanged = true;
        next.possession = flipSide(play.possession);
        Object.assign(next, normalSeriesState(next, next.possession));
        metadata.nextPhase = "normal";
      }
      break;
    }
    case "kneel": {
      const payload = play.payload as { yardsLost: number };
      next.phase = "normal";
      next.ballOn = advanceField(next.ballOn, -payload.yardsLost, play.possession);
      metadata.endSpot = next.ballOn;
      next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
      next.distance = previous.distance + payload.yardsLost;
      break;
    }
    case "spike": {
      next.phase = "normal";
      next.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
      break;
    }
    case "punt": {
      const payload = play.payload as { puntDistance: number; returnYards?: number };
      const grossYards = payload.puntDistance - (payload.returnYards ?? 0);
      next.ballOn = advanceField(next.ballOn, grossYards, play.possession);
      metadata.endSpot = next.ballOn;
      metadata.possessionChanged = true;
      next.possession = flipSide(play.possession);
      Object.assign(next, normalSeriesState(next, next.possession));
      metadata.nextPhase = "normal";
      break;
    }
    case "kickoff": {
      const payload = play.payload as KickoffPlayPayload;
      next.ballOn =
        payload.result === "touchback"
          ? receivingTouchbackSpot(play.possession)
          : advanceField(
              next.ballOn,
              Math.max(0, payload.kickDistance - (payload.returnYards ?? 0)),
              play.possession
            );
      metadata.endSpot = next.ballOn;
      metadata.possessionChanged = true;
      next.possession = flipSide(play.possession);
      Object.assign(next, normalSeriesState(next, next.possession));
      metadata.nextPhase = "normal";
      break;
    }
    case "extra_point": {
      const payload = play.payload as ExtraPointPlayPayload;
      if (payload.result === "good") {
        Object.assign(next, scorePoints(next, play.possession, 1));
      }
      Object.assign(next, setKickoffState(next, play.possession));
      metadata.nextPhase = "kickoff";
      metadata.scoringTeam = play.possession;
      break;
    }
    case "two_point_try": {
      if ((play.payload as { result: "good" | "failed" | "turnover" }).result === "good") {
        Object.assign(next, scorePoints(next, play.possession, 2));
      }
      Object.assign(next, setKickoffState(next, play.possession));
      metadata.nextPhase = "kickoff";
      metadata.scoringTeam = play.possession;
      break;
    }
    case "field_goal": {
      const payload = play.payload as FieldGoalPlayPayload;
      if (payload.result === "good") {
        Object.assign(next, scorePoints(next, play.possession, 3));
        Object.assign(next, setKickoffState(next, play.possession));
        metadata.nextPhase = "kickoff";
        metadata.scoringTeam = play.possession;
      } else {
        metadata.possessionChanged = true;
        next.possession = flipSide(play.possession);
        Object.assign(next, normalSeriesState(next, next.possession));
        metadata.nextPhase = "normal";
      }
      break;
    }
    case "turnover": {
      const payload = play.payload as { returnYards: number; touchdown?: boolean };
      turnover = true;
      metadata.possessionChanged = true;
      next.possession = flipSide(play.possession);
      next.ballOn = advanceField(next.ballOn, payload.returnYards, next.possession);
      metadata.endSpot = next.ballOn;
      metadata.postChangePossessionSpot = next.ballOn;
      if (payload.touchdown) {
        Object.assign(next, scorePoints(next, next.possession, 6));
        Object.assign(next, setTryState(next, next.possession));
        metadata.nextPhase = "try";
        metadata.scoringTeam = next.possession;
      } else {
        Object.assign(next, normalSeriesState(next, next.possession));
        metadata.nextPhase = "normal";
      }
      break;
    }
    case "penalty": {
      next.phase = previous.phase;
      metadata.nextPhase = previous.phase;
      break;
    }
  }

  return {
    playId: play.id,
    sequence: play.sequence,
    summary: buildPlaySummary(play),
    nextState: next,
    touchdown,
    turnover,
    firstDownAchieved,
    statCredits,
    metadata
  };
}

function applyYardagePenalty(anchor: FieldPosition, offense: TeamSide, penalty: PlayPenalty) {
  const yards = penalty.penalizedSide === offense ? -penalty.yards : penalty.yards;
  return advanceField(anchor, yards, offense);
}

function penaltyAnchor(previous: DerivedGameState, baseResult: BasePlayResult, penalty: PlayPenalty) {
  if (penalty.enforcementType === "previous_spot") {
    return previous.ballOn;
  }

  if (penalty.enforcementType === "spot") {
    return penalty.foulSpot ?? baseResult.metadata.endSpot;
  }

  return baseResult.nextState.ballOn;
}

function penaltyOffense(previous: DerivedGameState, baseResult: BasePlayResult, penalty: PlayPenalty): TeamSide {
  if (penalty.timing === "live_ball") {
    return previous.possession;
  }

  if (penalty.timing === "post_score") {
    return baseResult.metadata.scoringTeam ?? baseResult.nextState.possession;
  }

  return baseResult.nextState.possession;
}

function applyAdministrativePenaltyEffects(
  workingState: DerivedGameState,
  previous: DerivedGameState,
  baseResult: BasePlayResult,
  penalty: PlayPenalty,
  play: PlayRecord
) {
  const offense = penaltyOffense(previous, baseResult, penalty);
  const targetSpot = previous.phase === "normal" ? lineToGainSpot(previous) : null;

  if (penalty.noPlay || penalty.replayDown) {
    workingState.phase = previous.phase;
    workingState.possession = previous.possession;
    workingState.down = previous.down;
    workingState.distance = previous.distance;
  }

  if (penalty.timing === "post_possession" && baseResult.metadata.possessionChanged) {
    workingState.phase = baseResult.nextState.phase;
    workingState.possession = baseResult.nextState.possession;
  }

  if (penalty.timing === "post_score") {
    workingState.phase = baseResult.nextState.phase;
    workingState.possession = baseResult.nextState.possession;
  }

  if (workingState.phase === "normal" && targetSpot) {
    if (penalty.automaticFirstDown) {
      workingState.down = 1;
      workingState.distance = 10;
    } else if (penalty.noPlay || penalty.replayDown) {
      workingState.distance = distanceToLineToGain(workingState.ballOn, targetSpot, offense);
    } else if (
      penalty.timing !== "post_possession" &&
      penalty.timing !== "post_score" &&
      workingState.possession === previous.possession
    ) {
      if (hasReachedLineToGain(workingState.ballOn, targetSpot, previous.possession)) {
        workingState.down = 1;
        workingState.distance = 10;
      } else if (play.playType === "penalty") {
        workingState.distance = distanceToLineToGain(workingState.ballOn, targetSpot, previous.possession);
      } else {
        workingState.down = Math.min(4, previous.down + 1) as 1 | 2 | 3 | 4;
        workingState.distance = distanceToLineToGain(workingState.ballOn, targetSpot, previous.possession);
      }
    }
  }

  if (penalty.lossOfDown && workingState.phase === "normal") {
    workingState.down = Math.min(4, workingState.down + 1) as 1 | 2 | 3 | 4;
  }

  applyPhaseDistanceRules(workingState);
}

export function applyPenaltyOverlay(
  previous: DerivedGameState,
  baseResult: BasePlayResult,
  penalties: PlayPenalty[],
  play: PlayRecord
) {
  const accepted = penalties.filter((penalty) => penalty.result === "accepted");
  const declined = penalties.filter((penalty) => penalty.result === "declined");
  const offsetting = penalties.filter((penalty) => penalty.result === "offsetting");
  const appliedPenalties: AppliedPenalty[] = penalties.map((penalty) => ({
    code: penalty.code,
    result: penalty.result,
    enforcementType: penalty.enforcementType,
    timing: penalty.timing,
    yards: penalty.yards,
    noPlay: penalty.noPlay ?? false
  }));

  if (offsetting.length > 0) {
    return {
      finalState: nullifiedState(previous, baseResult.sequence, baseResult.nextState.quarter, baseResult.nextState.clockSeconds),
      appliedPenalties,
      statCredits: []
    };
  }

  let workingState = accepted.some((penalty) => penalty.noPlay)
    ? nullifiedState(previous, baseResult.sequence, baseResult.nextState.quarter, baseResult.nextState.clockSeconds)
    : { ...baseResult.nextState };
  let statCredits = accepted.some((penalty) => penalty.noPlay) ? [] : [...baseResult.statCredits];

  for (const penalty of accepted) {
    const anchor = penaltyAnchor(previous, baseResult, penalty);
    const offense = penaltyOffense(previous, baseResult, penalty);
    workingState.ballOn = applyYardagePenalty(anchor, offense, penalty);
    applyAdministrativePenaltyEffects(workingState, previous, baseResult, penalty, play);
  }

  if (declined.length > 0 && accepted.length === 0) {
    workingState = { ...baseResult.nextState };
    statCredits = [...baseResult.statCredits];
  }

  workingState.sequenceApplied = baseResult.sequence;

  return {
    finalState: workingState,
    appliedPenalties,
    statCredits
  };
}

export function finalizePlay(previous: DerivedGameState, play: PlayRecord): FinalizedPlayResult {
  const baseResult = applyBasePlay(previous, play);
  const overlay = applyPenaltyOverlay(previous, baseResult, play.penalties, play);

  return {
    play,
    baseResult,
    finalState: overlay.finalState,
    summary: baseResult.summary,
    appliedPenalties: overlay.appliedPenalties,
    statCredits: overlay.statCredits
  };
}

export function rebuildFromPlayLog(
  playLog: PlayRecord[],
  options: PartialRebuildOptions & {
    corrections?: GameStateCorrection[];
    scoreCorrections?: ScoreCorrection[];
  } = {}
): GameProjection {
  const ordered = [...playLog].sort((left, right) => compareSequence(left.sequence, right.sequence));
  const filtered = options.fromSequence
    ? ordered.filter((play) => isSequenceOnOrAfter(play.sequence, options.fromSequence!))
    : ordered;
  const orderedCorrections = [...(options.corrections ?? [])].sort((left, right) => {
    const bySequence = compareSequence(left.appliesAfterSequence, right.appliesAfterSequence);
    if (bySequence !== 0) {
      return bySequence;
    }

    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.id.localeCompare(right.id);
  });
  const filteredCorrections = options.fromSequence
    ? orderedCorrections.filter((correction) =>
        isSequenceOnOrAfter(correction.appliesAfterSequence, options.fromSequence!)
      )
    : orderedCorrections;
  const orderedScoreCorrections = [...(options.scoreCorrections ?? [])].sort((left, right) => {
    const bySequence = compareSequence(left.appliesAfterSequence, right.appliesAfterSequence);
    if (bySequence !== 0) {
      return bySequence;
    }

    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.id.localeCompare(right.id);
  });
  const filteredScoreCorrections = options.fromSequence
    ? orderedScoreCorrections.filter((correction) =>
        isSequenceOnOrAfter(correction.appliesAfterSequence, options.fromSequence!)
      )
    : orderedScoreCorrections;

  const timeline = [...(options.priorTimeline ?? [])];
  let state = options.seedState ?? INITIAL_GAME_STATE;
  let correctionIndex = 0;
  let scoreCorrectionIndex = 0;

  while (
    scoreCorrectionIndex < filteredScoreCorrections.length &&
    compareSequence(filteredScoreCorrections[scoreCorrectionIndex]!.appliesAfterSequence, state.sequenceApplied) === 0
  ) {
    state = applyScoreCorrection(state, filteredScoreCorrections[scoreCorrectionIndex]!);
    scoreCorrectionIndex += 1;
  }

  for (const play of filtered) {
    const result = finalizePlay(state, play);
    timeline.push({
      sequence: play.sequence,
      result
    });
    state = result.finalState;

    while (
      correctionIndex < filteredCorrections.length &&
      compareSequence(filteredCorrections[correctionIndex]!.appliesAfterSequence, play.sequence) === 0
    ) {
      state = applySituationCorrection(state, filteredCorrections[correctionIndex]!);
      timeline[timeline.length - 1]!.result.finalState = state;
      correctionIndex += 1;
    }

    while (
      scoreCorrectionIndex < filteredScoreCorrections.length &&
      compareSequence(filteredScoreCorrections[scoreCorrectionIndex]!.appliesAfterSequence, play.sequence) === 0
    ) {
      state = applyScoreCorrection(state, filteredScoreCorrections[scoreCorrectionIndex]!);
      timeline[timeline.length - 1]!.result.finalState = state;
      scoreCorrectionIndex += 1;
    }
  }

  const allCredits = timeline.flatMap((item) => item.result.statCredits);
  const baseStats = accumulateStatProjection(allCredits);
  const situationalTeamTotals = deriveTeamSituationalStats(timeline);

  return {
    currentState: timeline.at(-1)?.result.finalState ?? state,
    timeline,
    stats: mergeStatProjection(baseStats, situationalTeamTotals)
  };
}
