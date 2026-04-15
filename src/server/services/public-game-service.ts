import { eq } from "drizzle-orm";
import { assertFeatureEnabled } from "@/lib/features/server";
import { getDb } from "@/server/db/client";
import { games, seasons, teams } from "@/server/db/schema";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { getOrganizationBranding } from "@/server/services/organization-settings-service";
import { buildGameReportDocument } from "@/server/services/report-service";

async function resolvePublicGame(token: string) {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.publicShareToken, token)
  });

  if (!game) {
    throw new Error("Public game link not found.");
  }

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, game.seasonId)
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

  return { game, season, team };
}

export async function getPublicLiveGame(token: string) {
  assertFeatureEnabled("live_public_tracker");
  const { game, team } = await resolvePublicGame(token);

  if (!game.publicLiveEnabled) {
    throw new Error("Public live tracking is not enabled for this game.");
  }

  const [snapshot, record, branding] = await Promise.all([
    getGameDaySnapshot(game.id, "read_only", { skipAuth: true }),
    getGameAdminRecord(game.id, { skipAuth: true }),
    getOrganizationBranding(team.organizationId, { skipAuth: true })
  ]);

  return { snapshot, record, branding };
}

export async function getPublicGameReport(token: string) {
  assertFeatureEnabled("live_public_tracker");
  const { game, team } = await resolvePublicGame(token);

  if (!game.publicReportsEnabled) {
    throw new Error("Public reports are not enabled for this game.");
  }

  const [report, record, branding] = await Promise.all([
    buildGameReportDocument(game.id, "game_report", "read_only", { skipAuth: true }),
    getGameAdminRecord(game.id, { skipAuth: true }),
    getOrganizationBranding(team.organizationId, { skipAuth: true })
  ]);

  return { report, record, branding };
}
