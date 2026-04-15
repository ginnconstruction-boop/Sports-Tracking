import { and, eq, inArray } from "drizzle-orm";
import { createPlayEventInputSchema } from "@/lib/contracts/play-log";
import type { TeamSide } from "@/lib/domain/play-log";
import { sampleGameSeed, type SampleRosterSeed } from "@/lib/demo/sample-game";
import { getDb } from "@/server/db/client";
import {
  appUsers,
  gameRosterEntries,
  gameSides,
  games,
  opponents,
  organizationMemberships,
  organizations,
  players,
  seasonRosterEntries,
  seasons,
  teams,
  venues
} from "@/server/db/schema";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { createPlayEvent } from "@/server/services/play-log-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";

function displayNameForRosterPlayer(player: SampleRosterSeed) {
  return player.preferredName ?? `${player.firstName} ${player.lastName}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function ensureSampleOrganizationForUser(userId: string) {
  const db = getDb();
  const slug = `sample-${userId.slice(0, 8)}`;

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug)
  });

  const organization =
    existing ??
    (
      await db
        .insert(organizations)
        .values({
          name: sampleGameSeed.organizationName,
          slug
        })
        .returning()
    )[0];

  const membership = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organization.id),
      eq(organizationMemberships.userId, userId)
    )
  });

  if (!membership) {
    await db.insert(organizationMemberships).values({
      organizationId: organization.id,
      userId,
      role: "admin"
    });
  }

  return organization;
}

async function ensureTeamGraph(organizationId: string) {
  const db = getDb();

  const team =
    (await db.query.teams.findFirst({
      where: and(eq(teams.organizationId, organizationId), eq(teams.name, sampleGameSeed.teamName))
    })) ??
    (
      await db
        .insert(teams)
        .values({
          organizationId,
          name: sampleGameSeed.teamName,
          level: sampleGameSeed.teamLevel
        })
        .returning()
    )[0];

  const season =
    (await db.query.seasons.findFirst({
      where: and(eq(seasons.teamId, team.id), eq(seasons.year, sampleGameSeed.seasonYear))
    })) ??
    (
      await db
        .insert(seasons)
        .values({
          teamId: team.id,
          label: sampleGameSeed.seasonLabel,
          year: sampleGameSeed.seasonYear,
          isActive: true
        })
        .returning()
    )[0];

  const opponent =
    (await db.query.opponents.findFirst({
      where: and(
        eq(opponents.organizationId, organizationId),
        eq(opponents.schoolName, sampleGameSeed.opponentSchoolName)
      )
    })) ??
    (
      await db
        .insert(opponents)
        .values({
          organizationId,
          schoolName: sampleGameSeed.opponentSchoolName,
          mascot: sampleGameSeed.opponentMascot,
          shortCode: sampleGameSeed.opponentShortCode
        })
        .returning()
    )[0];

  const venue =
    (await db.query.venues.findFirst({
      where: and(eq(venues.organizationId, organizationId), eq(venues.name, sampleGameSeed.venueName))
    })) ??
    (
      await db
        .insert(venues)
        .values({
          organizationId,
          name: sampleGameSeed.venueName,
          city: sampleGameSeed.venueCity,
          state: sampleGameSeed.venueState
        })
        .returning()
    )[0];

  return {
    team,
    season,
    opponent,
    venue
  };
}

async function replaceSampleRoster(
  organizationId: string,
  seasonId: string,
  roster: SampleRosterSeed[]
) {
  const db = getDb();

  await db.delete(seasonRosterEntries).where(eq(seasonRosterEntries.seasonId, seasonId));

  for (const player of roster) {
    const existingPlayer = await db.query.players.findFirst({
      where: and(
        eq(players.organizationId, organizationId),
        eq(players.firstName, player.firstName),
        eq(players.lastName, player.lastName)
      )
    });

    const playerRecord =
      existingPlayer ??
      (
        await db
          .insert(players)
          .values({
            organizationId,
            firstName: player.firstName,
            lastName: player.lastName,
            preferredName: player.preferredName,
            defaultPosition: player.position
          })
          .returning()
      )[0];

    await db.insert(seasonRosterEntries).values({
      seasonId,
      playerId: playerRecord.id,
      jerseyNumber: player.jerseyNumber,
      grade: player.grade ?? "12",
      position: player.position,
      offenseRole: player.offenseRole ?? false,
      defenseRole: player.defenseRole ?? false,
      specialTeamsRole: player.specialTeamsRole ?? false
    });
  }
}

async function deleteExistingSampleGames(seasonId: string, opponentId: string) {
  const db = getDb();
  const existingGames = await db.query.games.findMany({
    where: and(eq(games.seasonId, seasonId), eq(games.opponentId, opponentId))
  });

  for (const existingGame of existingGames) {
    await db.delete(games).where(eq(games.id, existingGame.id));
  }
}

async function createSampleGameRecord(
  seasonId: string,
  opponentId: string,
  venueId: string
) {
  const db = getDb();
  const [game] = await db
    .insert(games)
    .values({
      seasonId,
      opponentId,
      venueId,
      kickoffAt: new Date(sampleGameSeed.kickoffAt),
      homeAway: sampleGameSeed.homeAway,
      status: "in_progress"
    })
    .returning();

  const [homeSide, awaySide] = await db
    .insert(gameSides)
    .values([
      {
        gameId: game.id,
        side: "home",
        isPrimaryTeam: true,
        displayName: sampleGameSeed.teamName,
        shortCode: sampleGameSeed.teamLevel
      },
      {
        gameId: game.id,
        side: "away",
        isPrimaryTeam: false,
        displayName: sampleGameSeed.opponentSchoolName,
        shortCode: sampleGameSeed.opponentShortCode
      }
    ])
    .returning();

  return { game, homeSide, awaySide };
}

async function seedGameRosters(
  sideId: string,
  roster: SampleRosterSeed[],
  seasonId?: string
) {
  const db = getDb();
  const seasonEntries = seasonId
    ? await db.query.seasonRosterEntries.findMany({
        where: eq(seasonRosterEntries.seasonId, seasonId)
      })
    : [];
  const seasonEntryByJersey = new Map(seasonEntries.map((entry) => [entry.jerseyNumber, entry]));

  await db.insert(gameRosterEntries).values(
    roster.map((player) => ({
      gameSideId: sideId,
      seasonRosterEntryId: seasonEntryByJersey.get(player.jerseyNumber)?.id,
      jerseyNumber: player.jerseyNumber,
      displayName: displayNameForRosterPlayer(player),
      grade: player.grade ?? "12",
      position: player.position
    }))
  );
}

async function gameRosterIndex(gameId: string) {
  const db = getDb();
  const sides = await db.query.gameSides.findMany({
    where: eq(gameSides.gameId, gameId)
  });
  const entries =
    sides.length === 0
      ? []
      : await db.query.gameRosterEntries.findMany({
          where: inArray(
            gameRosterEntries.gameSideId,
            sides.map((side) => side.id)
          )
        });
  const sideByGameSideId = new Map(sides.map((side) => [side.id, side.side]));

  const index = new Map<string, string>();
  for (const entry of entries) {
    const side = sideByGameSideId.get(entry.gameSideId) as TeamSide | undefined;
    if (!side) continue;
    index.set(`${side}:${entry.jerseyNumber}`, entry.id);
  }

  return index;
}

export async function seedSampleGameForCurrentUser() {
  const user = await requireAuthenticatedUser();
  const organization = await ensureSampleOrganizationForUser(user.id);
  const { season, opponent, venue } = await ensureTeamGraph(organization.id);

  await replaceSampleRoster(organization.id, season.id, sampleGameSeed.homeRoster);
  await deleteExistingSampleGames(season.id, opponent.id);

  const { game, homeSide, awaySide } = await createSampleGameRecord(season.id, opponent.id, venue.id);
  await seedGameRosters(homeSide.id, sampleGameSeed.homeRoster, season.id);
  await seedGameRosters(awaySide.id, sampleGameSeed.awayRoster);

  const rosterIds = await gameRosterIndex(game.id);

  for (const seededPlay of sampleGameSeed.plays) {
    const parsed = createPlayEventInputSchema.parse({
      sequence: seededPlay.sequence,
      quarter: seededPlay.quarter,
      clock: seededPlay.clock,
      possession: seededPlay.possession,
      playType: seededPlay.playType,
      summary: seededPlay.summary,
      payload: seededPlay.payload,
      participants: (seededPlay.participants ?? []).map((participant) => ({
        gameRosterEntryId: rosterIds.get(`${participant.side}:${participant.jerseyNumber}`),
        role: participant.role,
        side: participant.side,
        creditUnits: participant.creditUnits ?? 1
      })),
      penalties: seededPlay.penalties ?? []
    });

    await createPlayEvent(game.id, parsed);
  }

  await rebuildGameFromPlayLog(game.id, "stat_operator");

  return {
    organizationId: organization.id,
    seasonId: season.id,
    gameId: game.id
  };
}
