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
  stats: StatProjection;
};

export type ExportArtifact = {
  fileName: string;
  format: ExportFormat;
  contentType: string;
  body: string | Uint8Array;
};
