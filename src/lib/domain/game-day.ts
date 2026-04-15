import type { DerivedGameState, RebuildTimelineItem } from "@/lib/domain/game-state";
import type { PlayRecord, TeamSide } from "@/lib/domain/play-log";
import type { PlayReviewAnnotation } from "@/lib/domain/play-review";
import type { StatProjection, StatType } from "@/lib/domain/stats";

export type GameDayRosterEntry = {
  id: string;
  side: TeamSide;
  jerseyNumber: string;
  displayName: string;
  position?: string | null;
  grade?: string | null;
};

export type GameDayPlayView = {
  playId: string;
  sequence: string;
  previousSequence?: string;
  nextSequence?: string;
  playType: PlayRecord["playType"];
  summary: string;
  quarter: number;
  clockSeconds: number;
  state: DerivedGameState;
  play: PlayRecord;
};

export type GameDayQuarterSummary = {
  quarter: number;
  playCount: number;
  homePoints: number;
  awayPoints: number;
};

export type GameDayDriveResult =
  | "in_progress"
  | "touchdown"
  | "field_goal"
  | "punt"
  | "turnover"
  | "downs"
  | "missed_field_goal"
  | "end_of_half";

export type GameDayDriveSummary = {
  id: string;
  side: TeamSide;
  quarter: number;
  startClockSeconds: number;
  endClockSeconds: number;
  startFieldPosition: string;
  endFieldPosition: string;
  result: GameDayDriveResult;
  playCount: number;
  yardsGained: number;
  timeConsumedSeconds: number;
};

export type GameDayTeamStatLine = {
  side: TeamSide;
  label: string;
  totals: Partial<Record<StatType, number>>;
};

export type GameDayPlayerStatLine = {
  gameRosterEntryId: string;
  side: TeamSide;
  jerseyNumber?: string;
  displayName: string;
  position?: string | null;
  totals: Partial<Record<StatType, number>>;
};

export type GameDayPossessionSummary = {
  id: string;
  side: TeamSide;
  startSequence: string;
  endSequence: string;
  playCount: number;
  result: GameDayDriveResult;
};

export type GameDaySnapshot = {
  gameId: string;
  revision: number;
  status: string;
  lastRebuiltAt?: string | null;
  homeTeam: string;
  awayTeam: string;
  currentState: DerivedGameState;
  recentPlays: GameDayPlayView[];
  scoringSummary: GameDayPlayView[];
  quarterSummary: GameDayQuarterSummary[];
  driveSummaries: GameDayDriveSummary[];
  lastScoringPlay: GameDayPlayView | null;
  lastTurnoverPlay: GameDayPlayView | null;
  lastPenaltyPlay: GameDayPlayView | null;
  possessionSummary: GameDayPossessionSummary[];
  turnoverTracker: GameDayPlayView[];
  penaltyTracker: GameDayPlayView[];
  fullPlayLog: GameDayPlayView[];
  playReviews: PlayReviewAnnotation[];
  rosters: Record<TeamSide, GameDayRosterEntry[]>;
  teamStats: GameDayTeamStatLine[];
  playerStats: GameDayPlayerStatLine[];
  rawStats: StatProjection;
};
