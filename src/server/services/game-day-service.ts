import { asc, eq, inArray } from "drizzle-orm";
import type { MembershipRole } from "@/lib/auth/roles";
import type {
  GameDayRosterEntry,
  GameDaySnapshot
} from "@/lib/domain/game-day";
import { buildGameDaySnapshot } from "@/lib/game-day/snapshot";
import { getDb } from "@/server/db/client";
import { gameRosterEntries, games, gameSides, playReviewAnnotations } from "@/server/db/schema";
import { requireGameRole } from "@/server/services/game-access";
import { projectGameFromPlayLog } from "@/server/services/rebuild-service";

function byJersey(left: { jerseyNumber?: string | null }, right: { jerseyNumber?: string | null }) {
  return Number.parseInt(left.jerseyNumber ?? "0", 10) - Number.parseInt(right.jerseyNumber ?? "0", 10);
}

export async function getGameDaySnapshot(
  gameId: string,
  minimumRole: MembershipRole = "read_only",
  options: { skipAuth?: boolean } = {}
): Promise<GameDaySnapshot> {
  if (!options.skipAuth) {
    await requireGameRole(gameId, minimumRole);
  }
  const db = getDb();
  const { game, projection } = await projectGameFromPlayLog(gameId, minimumRole, options);

  const sides = await db.query.gameSides.findMany({
    where: eq(gameSides.gameId, gameId),
    orderBy: (fields) => [asc(fields.side)]
  });

  const sideIds = sides.map((side) => side.id);
  const rosterRows =
    sideIds.length > 0
      ? await db.query.gameRosterEntries.findMany({
          where: inArray(gameRosterEntries.gameSideId, sideIds),
          orderBy: (fields) => [asc(fields.jerseyNumber)]
        })
      : [];

  const rosterBySide: Record<"home" | "away", GameDayRosterEntry[]> = {
    home: [],
    away: []
  };
  const sideIdToKey = new Map(sides.map((side) => [side.id, side.side]));

  for (const row of rosterRows) {
    const side = sideIdToKey.get(row.gameSideId);

    if (!side) {
      continue;
    }

    rosterBySide[side].push({
      id: row.id,
      side,
      jerseyNumber: row.jerseyNumber,
      displayName: row.displayName,
      position: row.position,
      grade: row.grade
    });
  }

  const homeTeam = sides.find((side) => side.side === "home")?.displayName ?? "Home";
  const awayTeam = sides.find((side) => side.side === "away")?.displayName ?? "Away";
  const reviewRows = await db.query.playReviewAnnotations.findMany({
    where: eq(playReviewAnnotations.gameId, gameId)
  });

  return buildGameDaySnapshot({
    gameId,
    revision: game.currentRevision,
    status: game.status,
    lastRebuiltAt: game.lastRebuiltAt?.toISOString() ?? null,
    homeTeam,
    awayTeam,
    rosters: rosterBySide,
    projection,
    playReviews: reviewRows.map((item) => ({
      playId: item.playId,
      gameId: item.gameId,
      tags: Array.isArray(item.tags) ? item.tags : [],
      note: item.note,
      filmUrl: item.filmUrl,
      updatedAt: item.updatedAt.toISOString()
    }))
  });
}
