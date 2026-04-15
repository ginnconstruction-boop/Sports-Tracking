import type { GamePhase, PlayRecord, TeamSide } from "@/lib/domain/play-log";
import type { FieldPosition } from "@/lib/domain/play-log";
import type { StatCredit, StatProjection } from "@/lib/domain/stats";

export type DerivedGameState = {
  quarter: 1 | 2 | 3 | 4 | 5;
  clockSeconds: number;
  phase: GamePhase;
  possession: TeamSide;
  down: 1 | 2 | 3 | 4;
  distance: number;
  ballOn: FieldPosition;
  score: Record<TeamSide, number>;
  sequenceApplied: string;
};

export type BasePlayResult = {
  playId: string;
  sequence: string;
  summary: string;
  nextState: DerivedGameState;
  touchdown: boolean;
  turnover: boolean;
  firstDownAchieved: boolean;
  statCredits: StatCredit[];
  metadata: {
    previousSpot: FieldPosition;
    endSpot: FieldPosition;
    downBeforePlay: 1 | 2 | 3 | 4;
    distanceBeforePlay: number;
    possessionBeforePlay: TeamSide;
    phaseBeforePlay: GamePhase;
    nextPhase: GamePhase;
    postChangePossessionSpot?: FieldPosition;
    scoringTeam?: TeamSide;
    possessionChanged: boolean;
  };
};

export type AppliedPenalty = {
  code: string;
  result: "accepted" | "declined" | "offsetting";
  enforcementType: "previous_spot" | "spot" | "dead_ball" | "succeeding_spot";
  timing: "live_ball" | "dead_ball" | "post_possession" | "post_score";
  yards: number;
  noPlay: boolean;
};

export type FinalizedPlayResult = {
  play: PlayRecord;
  baseResult: BasePlayResult;
  finalState: DerivedGameState;
  summary: string;
  appliedPenalties: AppliedPenalty[];
  statCredits: StatCredit[];
};

export type RebuildTimelineItem = {
  sequence: string;
  result: FinalizedPlayResult;
};

export type GameProjection = {
  currentState: DerivedGameState;
  timeline: RebuildTimelineItem[];
  stats: StatProjection;
};

export type PartialRebuildOptions = {
  fromSequence?: string;
  seedState?: DerivedGameState;
  priorTimeline?: RebuildTimelineItem[];
};
