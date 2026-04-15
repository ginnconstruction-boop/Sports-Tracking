import type { GameDaySnapshot } from "@/lib/domain/game-day";
import type { GameProjection } from "@/lib/domain/game-state";
import type { GameReportDocument, ReportType } from "@/lib/domain/reports";
import type { OrganizationBranding } from "@/lib/domain/organization-settings";

type ReportContextInput = GameReportDocument["context"];

function scoringPlaysOnly(report: GameReportDocument) {
  return report.fullTimeline.filter((item) => {
    const before = item.result.baseResult.metadata.scoringTeam;
    return Boolean(before) || item.result.summary.toLowerCase().includes("touchdown");
  });
}

export function buildCanonicalGameReportDocument(params: {
  gameId: string;
  reportType: ReportType;
  snapshot: GameDaySnapshot;
  projection: GameProjection;
  context: ReportContextInput;
  branding?: OrganizationBranding | null;
}): GameReportDocument {
  const base: GameReportDocument = {
    kind: "game_report",
    generatedAt: new Date().toISOString(),
    gameId: params.gameId,
    reportType: params.reportType,
    context: params.context,
    branding: params.branding ?? null,
    currentState: params.snapshot.currentState,
    scoringSummary: [],
    recentTimeline: params.projection.timeline.slice(-10),
    fullTimeline: params.projection.timeline,
    penaltyTracker: params.snapshot.penaltyTracker,
    turnoverTracker: params.snapshot.turnoverTracker,
    quarterSummary: params.snapshot.quarterSummary,
    driveSummaries: params.snapshot.driveSummaries,
    teamStats: params.snapshot.teamStats,
    playerStats: params.snapshot.playerStats,
    highlights: {
      lastScoringSummary: params.snapshot.lastScoringPlay?.summary ?? null,
      lastTurnoverSummary: params.snapshot.lastTurnoverPlay?.summary ?? null,
      lastPenaltySummary: params.snapshot.lastPenaltyPlay?.summary ?? null
    },
    halftimeSummary: {
      score: {
        home: params.snapshot.quarterSummary
          .filter((item) => item.quarter <= 2)
          .reduce((sum, item) => sum + item.homePoints, 0),
        away: params.snapshot.quarterSummary
          .filter((item) => item.quarter <= 2)
          .reduce((sum, item) => sum + item.awayPoints, 0)
      },
      note: `Halftime pace: ${params.snapshot.driveSummaries.filter((drive) => drive.quarter <= 2).length} drives, ${params.snapshot.recentPlays.length} recent tracked plays in live memory.`
    },
    finalSummary: {
      score: params.snapshot.currentState.score,
      note: `${params.snapshot.awayTeam} ${params.snapshot.currentState.score.away} - ${params.snapshot.homeTeam} ${params.snapshot.currentState.score.home}`,
      totalPlays: params.projection.timeline.length,
      totalDrives: params.snapshot.driveSummaries.length
    },
    stats: params.projection.stats
  };

  return {
    ...base,
    scoringSummary: scoringPlaysOnly(base)
  };
}
