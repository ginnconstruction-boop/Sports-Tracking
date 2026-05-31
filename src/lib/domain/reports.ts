import type { DerivedGameState, RebuildTimelineItem } from "@/lib/domain/game-state";
import type {
  GameDayDriveSummary,
  GameDayPlayerStatLine,
  GameDayPlayView,
  GameDayQuarterSummary,
  GameDayTeamStatLine
} from "@/lib/domain/game-day";
import type { OrganizationBranding } from "@/lib/domain/organization-settings";
import type { StatProjection } from "@/lib/domain/stats";

export type ExportFormat = "json" | "csv" | "xlsx" | "pdf";
export type ReportType = "game_report";

export type SituationalDistanceBucket =
  | "short_1_3"
  | "medium_4_6"
  | "long_7_10"
  | "very_long_11_plus";

export type SituationalFieldZone =
  | "backed_up"
  | "midfield"
  | "fringe"
  | "red_zone"
  | "goal_to_go";

export type SituationalClockBucket = "opening" | "middle" | "late" | "two_minute";

export type SituationalScoreState =
  | "leading_9_plus"
  | "leading_1_8"
  | "tied"
  | "trailing_1_8"
  | "trailing_9_plus";

export type SituationalPlayFamily =
  | "run"
  | "pass"
  | "special_teams"
  | "turnover"
  | "penalty"
  | "other";

export type GameSituationalBucketLine<TKey extends string = string> = {
  key: TKey;
  plays: number;
  runs: number;
  passes: number;
  yards: number;
  firstDowns: number;
  touchdowns: number;
  turnovers: number;
  explosivePlays: number;
  successfulPlays: number;
  successRate: number;
  runRate: number;
  passRate: number;
  yardsPerPlay: number;
};

export type GameSituationalSummary = {
  totalSituationalPlays: number;
  explosivePlayRate: number;
  overallSuccessRate: number;
  runRate: number;
  passRate: number;
};

export type GameSituationalReport = {
  summary: GameSituationalSummary;
  byDownDistance: GameSituationalBucketLine<SituationalDistanceBucket>[];
  byFieldZone: GameSituationalBucketLine<SituationalFieldZone>[];
  byClock: GameSituationalBucketLine<SituationalClockBucket>[];
  byScoreState: GameSituationalBucketLine<SituationalScoreState>[];
  byPlayFamily: GameSituationalBucketLine<SituationalPlayFamily>[];
};

export type GameReportDocument = {
  kind: "game_report";
  generatedAt: string;
  gameId: string;
  reportType: ReportType;
  context: {
    status: string;
    homeTeam: string;
    awayTeam: string;
    kickoffAt?: string | null;
    arrivalAt?: string | null;
    reportAt?: string | null;
    venueLabel: string;
    weatherConditions?: string | null;
    fieldConditions?: string | null;
    staffNotes?: string | null;
    opponentPrepNotes?: string | null;
    logisticsNotes?: string | null;
  };
  branding?: OrganizationBranding | null;
  currentState: DerivedGameState;
  scoringSummary: RebuildTimelineItem[];
  recentTimeline: RebuildTimelineItem[];
  fullTimeline: RebuildTimelineItem[];
  penaltyTracker: GameDayPlayView[];
  turnoverTracker: GameDayPlayView[];
  quarterSummary: GameDayQuarterSummary[];
  driveSummaries: GameDayDriveSummary[];
  teamStats: GameDayTeamStatLine[];
  playerStats: GameDayPlayerStatLine[];
  highlights: {
    lastScoringSummary?: string | null;
    lastTurnoverSummary?: string | null;
    lastPenaltySummary?: string | null;
  };
  halftimeSummary: {
    score: {
      home: number;
      away: number;
    };
    note: string;
  };
  finalSummary: {
    score: {
      home: number;
      away: number;
    };
    note: string;
    totalPlays: number;
    totalDrives: number;
  };
  situational: GameSituationalReport;
  stats: StatProjection;
};

export type ExportArtifact = {
  fileName: string;
  format: ExportFormat;
  contentType: string;
  body: string | Uint8Array;
};
