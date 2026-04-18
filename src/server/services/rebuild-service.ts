import type { MembershipRole } from "@/lib/auth/roles";
import type {
  PlayParticipantRole,
  PlayPenaltyEnforcement,
  PlayPenaltyResult,
  PlayPenaltyTiming,
  PlayRecord,
  PlayType
} from "@/lib/domain/play-log";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { compareSequence } from "@/lib/engine/sequence";
import { logServerError } from "@/lib/server/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireGameRole } from "@/server/services/game-access";

type GameRow = {
  id: string;
  current_revision: number;
  status: string;
  last_rebuilt_at: string | null;
};

type PlayEventRow = {
  id: string;
  sequence: string | number;
  quarter: number;
  clock_seconds: number;
  possession: "home" | "away";
  play_type: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
};

type PlayParticipantRow = {
  play_id: string;
  game_roster_entry_id: string | null;
  role: string;
  side: "home" | "away";
  credit_units: number;
  stat_payload: Record<string, unknown> | null;
};

type PlayPenaltyRow = {
  play_id: string;
  penalized_side: "home" | "away";
  code: string;
  yards: number;
  result: string;
  enforcement_type: string;
  timing: string;
  foul_spot: Record<string, unknown> | null;
  automatic_first_down: boolean;
  loss_of_down: boolean;
  replay_down: boolean;
  no_play: boolean;
};

function normalizeSequenceToken(sequence: string | number) {
  return typeof sequence === "string" ? sequence : String(sequence);
}

export async function projectGameFromPlayLog(
  gameId: string,
  minimumRole: MembershipRole = "read_only",
  options: { fromSequence?: string; skipAuth?: boolean } = {}
) {
  if (!options.skipAuth) {
    await requireGameRole(gameId, minimumRole);
  }
  const supabaseAdmin = createSupabaseAdminClient();

  const [gameResult, eventsResult] = await Promise.all([
    supabaseAdmin
      .from("games")
      .select("id,current_revision,status,last_rebuilt_at")
      .eq("id", gameId)
      .maybeSingle<GameRow>(),
    supabaseAdmin
      .from("play_events")
      .select("id,sequence,quarter,clock_seconds,possession,play_type,summary,payload")
      .eq("game_id", gameId)
      .order("sequence", { ascending: true })
      .returns<PlayEventRow[]>()
  ]);

  if (gameResult.error) {
    throw new Error(gameResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const game = gameResult.data;
  const events = eventsResult.data ?? [];

  if (!game) {
    throw new Error("Game not found.");
  }

  const playIds = events.map((event) => event.id);
  let participants: PlayParticipantRow[] = [];
  let penalties: PlayPenaltyRow[] = [];

  if (playIds.length > 0) {
    const [participantsRows, penaltiesRows] = await Promise.all([
      supabaseAdmin
        .from("play_participants")
        .select("play_id,game_roster_entry_id,role,side,credit_units,stat_payload")
        .in("play_id", playIds)
        .returns<PlayParticipantRow[]>(),
      supabaseAdmin
        .from("play_penalties")
        .select("play_id,penalized_side,code,yards,result,enforcement_type,timing,foul_spot,automatic_first_down,loss_of_down,replay_down,no_play")
        .in("play_id", playIds)
        .returns<PlayPenaltyRow[]>()
    ]);

    if (participantsRows.error) {
      throw new Error(participantsRows.error.message);
    }

    if (penaltiesRows.error) {
      throw new Error(penaltiesRows.error.message);
    }

    participants = participantsRows.data ?? [];
    penalties = penaltiesRows.data ?? [];
  }

  const typedEvents: PlayRecord[] = events.map((event) => ({
      id: event.id,
      gameId,
      sequence: normalizeSequenceToken(event.sequence),
      quarter: event.quarter as 1 | 2 | 3 | 4 | 5,
      clockSeconds: event.clock_seconds,
      possession: event.possession,
      playType: event.play_type as PlayType,
      summary: event.summary,
      payload: (event.payload ?? {}) as any,
      participants: participants
        .filter((participant) => participant.play_id === event.id)
        .map((participant) => ({
          gameRosterEntryId: participant.game_roster_entry_id ?? undefined,
          role: participant.role as PlayParticipantRole,
          side: participant.side,
          creditUnits: participant.credit_units,
          statPayload: (participant.stat_payload ?? undefined) as Record<string, unknown> | undefined
        })),
      penalties: penalties
        .filter((penalty) => penalty.play_id === event.id)
        .map((penalty) => ({
          penalizedSide: penalty.penalized_side,
          code: penalty.code,
          yards: penalty.yards,
          result: penalty.result as PlayPenaltyResult,
          enforcementType: penalty.enforcement_type as PlayPenaltyEnforcement,
          timing: penalty.timing as PlayPenaltyTiming,
          foulSpot: (penalty.foul_spot ?? undefined) as any,
          automaticFirstDown: penalty.automatic_first_down,
          lossOfDown: penalty.loss_of_down,
          replayDown: penalty.replay_down,
          noPlay: penalty.no_play
        }))
    }));

  const projection =
    options.fromSequence && typedEvents.some((event) => compareSequence(event.sequence, options.fromSequence!) < 0)
      ? (() => {
          const prefixEvents = typedEvents.filter(
            (event) => compareSequence(event.sequence, options.fromSequence!) < 0
          );
          const prefixProjection = rebuildFromPlayLog(prefixEvents);
          return rebuildFromPlayLog(typedEvents, {
            fromSequence: options.fromSequence,
            seedState: prefixProjection.currentState,
            priorTimeline: prefixProjection.timeline
          });
        })()
      : rebuildFromPlayLog(typedEvents);

  return {
    game,
    projection
  };
}

export async function rebuildGameFromPlayLog(
  gameId: string,
  minimumRole: MembershipRole = "stat_operator",
  options: { fromSequence?: string; skipAuth?: boolean } = {}
) {
  try {
    const { game, projection } = await projectGameFromPlayLog(gameId, minimumRole, options);
    const supabaseAdmin = createSupabaseAdminClient();
    const rebuiltAt = new Date().toISOString();

    const [cacheResult, gameUpdateResult] = await Promise.all([
      supabaseAdmin.from("game_state_caches").upsert(
        {
          game_id: gameId,
          revision: game.current_revision,
          state: projection.currentState,
          timeline_preview: projection.timeline.slice(-10),
          rebuilt_at: rebuiltAt
        },
        {
          onConflict: "game_id"
        }
      ),
      supabaseAdmin
        .from("games")
        .update({
          last_rebuilt_at: rebuiltAt
        })
        .eq("id", gameId)
    ]);

    if (cacheResult.error) {
      throw new Error(cacheResult.error.message);
    }

    if (gameUpdateResult.error) {
      throw new Error(gameUpdateResult.error.message);
    }

    return projection;
  } catch (error) {
    logServerError("rebuild-service", "rebuild_failed", error, {
      gameId,
      fromSequence: options.fromSequence ?? null
    });
    throw error;
  }
}
