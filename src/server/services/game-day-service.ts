import type { MembershipRole } from "@/lib/auth/roles";
import type {
  GameDayRosterEntry,
  GameDaySnapshot
} from "@/lib/domain/game-day";
import { buildGameDaySnapshot } from "@/lib/game-day/snapshot";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireGameRole } from "@/server/services/game-access";
import { projectGameFromPlayLog } from "@/server/services/rebuild-service";

type GameSideRow = {
  id: string;
  side: "home" | "away";
  display_name: string | null;
};

type GameRosterEntryRow = {
  id: string;
  game_side_id: string;
  jersey_number: string | null;
  display_name: string;
  position: string | null;
  grade: string | null;
};

type PlayReviewAnnotationRow = {
  play_id: string;
  game_id: string;
  tags: string[] | null;
  note: string | null;
  film_url: string | null;
  updated_at: string;
};

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
  const supabaseAdmin = createSupabaseAdminClient();
  const { game, projection } = await projectGameFromPlayLog(gameId, minimumRole, options);

  const { data: sides, error: sidesError } = await supabaseAdmin
    .from("game_sides")
    .select("id,side,display_name")
    .eq("game_id", gameId)
    .order("side", { ascending: true })
    .returns<GameSideRow[]>();

  if (sidesError) {
    throw new Error(sidesError.message);
  }

  const sideRows = sides ?? [];

  const sideIds = sideRows.map((side) => side.id);
  const rosterRows =
    sideIds.length > 0
      ? await (async () => {
          const { data, error } = await supabaseAdmin
            .from("game_roster_entries")
            .select("id,game_side_id,jersey_number,display_name,position,grade")
            .in("game_side_id", sideIds)
            .order("jersey_number", { ascending: true })
            .returns<GameRosterEntryRow[]>();

          if (error) {
            throw new Error(error.message);
          }

          return data ?? [];
        })()
      : [];

  const rosterBySide: Record<"home" | "away", GameDayRosterEntry[]> = {
    home: [],
    away: []
  };
  const sideIdToKey = new Map(sideRows.map((side) => [side.id, side.side]));

  for (const row of rosterRows) {
    const side = sideIdToKey.get(row.game_side_id);

    if (!side) {
      continue;
    }

    rosterBySide[side].push({
      id: row.id,
      side,
      jerseyNumber: row.jersey_number ?? "",
      displayName: row.display_name,
      position: row.position,
      grade: row.grade
    });
  }

  const homeTeam = sideRows.find((side) => side.side === "home")?.display_name ?? "Home";
  const awayTeam = sideRows.find((side) => side.side === "away")?.display_name ?? "Away";
  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from("play_review_annotations")
    .select("play_id,game_id,tags,note,film_url,updated_at")
    .eq("game_id", gameId)
    .returns<PlayReviewAnnotationRow[]>();

  if (reviewError) {
    throw new Error(reviewError.message);
  }

  return buildGameDaySnapshot({
    gameId,
    revision: game.current_revision,
    status: game.status,
    lastRebuiltAt: game.last_rebuilt_at ?? null,
    homeTeam,
    awayTeam,
    rosters: rosterBySide,
    projection,
    playReviews: (reviewRows ?? []).map((item) => ({
      playId: item.play_id,
      gameId: item.game_id,
      tags: Array.isArray(item.tags) ? item.tags : [],
      note: item.note,
      filmUrl: item.film_url,
      updatedAt: item.updated_at
    }))
  });
}
