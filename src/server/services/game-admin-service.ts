import { eq } from "drizzle-orm";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import { getDb } from "@/server/db/client";
import { games, gameSides, opponents, organizations, seasons, teams, venues } from "@/server/db/schema";
import { requireGameRole } from "@/server/services/game-access";

export async function getGameAdminRecord(
  gameId: string,
  options: { skipAuth?: boolean } = {}
): Promise<GameAdminRecord> {
  if (!options.skipAuth) {
    await requireGameRole(gameId, "read_only");
  }
  const db = getDb();

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
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

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, team.organizationId)
  });

  const opponent = await db.query.opponents.findFirst({
    where: eq(opponents.id, game.opponentId)
  });

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  const venue = game.venueId
    ? await db.query.venues.findFirst({
        where: eq(venues.id, game.venueId)
      })
    : null;

  const sides = await db.query.gameSides.findMany({
    where: eq(gameSides.gameId, gameId)
  });

  return {
    game: {
      id: game.id,
      status: game.status,
      kickoffAt: game.kickoffAt?.toISOString() ?? null,
      arrivalAt: game.arrivalAt?.toISOString() ?? null,
      reportAt: game.reportAt?.toISOString() ?? null,
      homeAway: game.homeAway,
      weatherConditions: game.weatherConditions,
      fieldConditions: game.fieldConditions,
      staffNotes: game.staffNotes,
      opponentPrepNotes: game.opponentPrepNotes,
      logisticsNotes: game.logisticsNotes,
      rosterConfirmedAt: game.rosterConfirmedAt?.toISOString() ?? null,
      publicShareToken: game.publicShareToken,
      publicLiveEnabled: game.publicLiveEnabled,
      publicReportsEnabled: game.publicReportsEnabled,
      currentRevision: game.currentRevision,
      lastRebuiltAt: game.lastRebuiltAt?.toISOString() ?? null
    },
    organizationId: team.organizationId,
    branding: organization
      ? {
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          publicDisplayName: organization.publicDisplayName,
          primaryColor: organization.primaryColor,
          secondaryColor: organization.secondaryColor,
          accentColor: organization.accentColor,
          wordmarkPath: organization.wordmarkPath
        }
      : null,
    team: {
      id: team.id,
      name: team.name,
      level: team.level
    },
    season: {
      id: season.id,
      label: season.label,
      year: season.year
    },
    opponent: {
      id: opponent.id,
      schoolName: opponent.schoolName,
      mascot: opponent.mascot,
      shortCode: opponent.shortCode
    },
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          fieldName: venue.fieldName,
          addressLine1: venue.addressLine1,
          addressLine2: venue.addressLine2,
          city: venue.city,
          state: venue.state,
          postalCode: venue.postalCode
        }
      : null,
    sideLabels: {
      home: sides.find((side) => side.side === "home")?.displayName ?? "Home",
      away: sides.find((side) => side.side === "away")?.displayName ?? "Away"
    }
  };
}
