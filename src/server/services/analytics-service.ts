import { eq } from "drizzle-orm";
import { assertFeatureEnabled } from "@/lib/features/server";
import { buildSeasonAnalyticsDocument } from "@/lib/analytics/season";
import { getDb } from "@/server/db/client";
import { games, opponents, seasons, teams } from "@/server/db/schema";
import { requireOrganizationRole } from "@/server/auth/context";
import { buildGameReportDocument } from "@/server/services/report-service";

export async function getSeasonAnalytics(seasonId: string) {
  assertFeatureEnabled("advanced_analytics");
  const db = getDb();
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organizationId, "read_only");

  const seasonGames = await db.query.games.findMany({
    where: eq(games.seasonId, seasonId)
  });

  const reports = await Promise.all(
    seasonGames.map(async (game) => {
      const opponent = await db.query.opponents.findFirst({
        where: eq(opponents.id, game.opponentId)
      });

      return {
        gameId: game.id,
        opponentId: opponent?.id ?? "unknown",
        opponentLabel: opponent?.schoolName ?? "Opponent",
        primarySide: game.homeAway,
        report: await buildGameReportDocument(game.id, "game_report", "read_only")
      };
    })
  );

  return buildSeasonAnalyticsDocument({
    organizationId: team.organizationId,
    teamId: team.id,
    seasonId,
    seasonLabel: season.label,
    reports
  });
}
