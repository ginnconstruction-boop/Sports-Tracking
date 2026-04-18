import { and, eq } from "drizzle-orm";
import type { CreatePlayEventInput, UpdatePlayEventInput } from "@/lib/contracts/play-log";
import type {
  PlayParticipantRole,
  PlayPenaltyEnforcement,
  PlayPenaltyResult,
  PlayPenaltyTiming,
  PlayRecord,
  PlayType
} from "@/lib/domain/play-log";
import { compareSequence } from "@/lib/engine/sequence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import {
  games,
  playEventAudits,
  playEvents,
  playParticipants,
  playPenalties
} from "@/server/db/schema";
import { requireGameRole } from "@/server/services/game-access";

type DbTransaction = any;

type PlaySnapshot = {
  playId: string;
  gameId: string;
  sequence: string;
  quarter: number;
  clockSeconds: number;
  possession: "home" | "away";
  playType: string;
  summary?: string | null;
  payload: unknown;
  participants: {
    gameRosterEntryId?: string | null;
    role: string;
    side: "home" | "away";
    creditUnits: number;
    statPayload?: unknown;
  }[];
  penalties: {
    penalizedSide: "home" | "away";
    code: string;
    yards: number;
    result: "accepted" | "declined" | "offsetting";
    enforcementType: "previous_spot" | "spot" | "dead_ball" | "succeeding_spot";
    timing: "live_ball" | "dead_ball" | "post_possession" | "post_score";
    foulSpot?: unknown;
    automaticFirstDown: boolean;
    lossOfDown: boolean;
    replayDown: boolean;
    noPlay: boolean;
  }[];
};

type PlayEventRow = {
  id: string;
  sequence: string;
  client_mutation_id: string | null;
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

type PlayEventMutationRow = {
  id: string;
  game_id: string;
  sequence: string;
  client_mutation_id: string | null;
  quarter: number;
  clock_seconds: number;
  possession: "home" | "away";
  play_type: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type GameRevisionRow = {
  id: string;
  current_revision: number;
};

async function bumpGameRevision(tx: DbTransaction, gameId: string) {
  const game = await tx.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
  }

  const updated = await tx
    .update(games)
    .set({
      currentRevision: game.currentRevision + 1
    })
    .where(eq(games.id, gameId))
    .returning();

  return updated[0].currentRevision;
}

async function assertSequenceAvailable(tx: DbTransaction, gameId: string, sequence: string, excludingPlayId?: string) {
  const existing = await tx.query.playEvents.findFirst({
    where: and(eq(playEvents.gameId, gameId), eq(playEvents.sequence, sequence))
  });

  if (existing && existing.id !== excludingPlayId) {
    throw new Error("Sequence token is already in use for this game.");
  }
}

function normalizePenaltyFlags<T extends { automaticFirstDown?: boolean; lossOfDown?: boolean; replayDown?: boolean; noPlay?: boolean }>(
  penalty: T
) {
  return {
    automaticFirstDown: penalty.automaticFirstDown ?? false,
    lossOfDown: penalty.lossOfDown ?? false,
    replayDown: penalty.replayDown ?? false,
    noPlay: penalty.noPlay ?? false
  };
}

async function writePlayAudit(
  tx: DbTransaction,
  audit: {
    playId: string;
    gameId: string;
    action: "created" | "updated" | "deleted";
    previousSnapshot?: PlaySnapshot;
    nextSnapshot?: PlaySnapshot;
    changedByUserId: string;
  }
) {
  await tx.insert(playEventAudits).values({
    playId: audit.playId,
    gameId: audit.gameId,
    action: audit.action,
    previousSnapshot: audit.previousSnapshot,
    nextSnapshot: audit.nextSnapshot ?? audit.previousSnapshot,
    changedByUserId: audit.changedByUserId
  });
}

function mapMutatedPlay(row: PlayEventMutationRow) {
  return {
    id: row.id,
    gameId: row.game_id,
    sequence: row.sequence,
    clientMutationId: row.client_mutation_id,
    quarter: row.quarter,
    clockSeconds: row.clock_seconds,
    possession: row.possession,
    playType: row.play_type as PlayType,
    summary: row.summary,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listPlayEvents(gameId: string) {
  await requireGameRole(gameId, "read_only");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: events, error: eventsError } = await supabaseAdmin
    .from("play_events")
    .select("id,sequence,client_mutation_id,quarter,clock_seconds,possession,play_type,summary,payload")
    .eq("game_id", gameId)
    .order("sequence", { ascending: true })
    .returns<PlayEventRow[]>();

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const eventRows = events ?? [];
  const playIds = eventRows.map((event) => event.id);
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

  return eventRows.map(
    (event) =>
      ({
        id: event.id,
        gameId,
        sequence: event.sequence,
        clientMutationId: event.client_mutation_id,
        quarter: event.quarter as 1 | 2 | 3 | 4 | 5,
        clockSeconds: event.clock_seconds,
        possession: event.possession,
        playType: event.play_type as PlayType,
        summary: event.summary,
        payload: (event.payload ?? {}) as PlayRecord["payload"],
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
            foulSpot: (penalty.foul_spot ?? undefined) as PlayRecord["penalties"][number]["foulSpot"],
            automaticFirstDown: penalty.automatic_first_down,
            lossOfDown: penalty.loss_of_down,
            replayDown: penalty.replay_down,
            noPlay: penalty.no_play
          }))
      }) satisfies PlayRecord
  );
}

export async function createPlayEvent(gameId: string, input: CreatePlayEventInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const supabaseAdmin = createSupabaseAdminClient();

  if (input.clientMutationId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("play_events")
      .select(
        "id,game_id,sequence,client_mutation_id,quarter,clock_seconds,possession,play_type,summary,payload,created_by_user_id,created_at,updated_at"
      )
      .eq("game_id", gameId)
      .eq("client_mutation_id", input.clientMutationId)
      .maybeSingle<PlayEventMutationRow>();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      const { data: gameRevisionRow, error: revisionError } = await supabaseAdmin
        .from("games")
        .select("id,current_revision")
        .eq("id", gameId)
        .maybeSingle<GameRevisionRow>();

      if (revisionError) {
        throw new Error(revisionError.message);
      }

      if (!gameRevisionRow) {
        throw new Error("Game not found.");
      }

      return {
        play: mapMutatedPlay(existing),
        rebuildFromSequence: existing.sequence,
        revision: gameRevisionRow.current_revision,
        deduped: true
      };
    }
  }

  const { data: sequenceConflict, error: sequenceError } = await supabaseAdmin
    .from("play_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("sequence", input.sequence)
    .maybeSingle<{ id: string }>();

  if (sequenceError) {
    throw new Error(sequenceError.message);
  }

  if (sequenceConflict) {
    throw new Error("Sequence token is already in use for this game.");
  }

  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id,current_revision")
    .eq("id", gameId)
    .maybeSingle<GameRevisionRow>();

  if (gameError) {
    throw new Error(gameError.message);
  }

  if (!gameRow) {
    throw new Error("Game not found.");
  }

  const { data: insertedPlay, error: insertPlayError } = await supabaseAdmin
    .from("play_events")
    .insert({
      game_id: gameId,
      sequence: input.sequence,
      client_mutation_id: input.clientMutationId ?? null,
      quarter: input.quarter,
      clock_seconds: input.clockSeconds,
      possession: input.possession,
      play_type: input.playType,
      payload: input.payload,
      summary: input.summary ?? null,
      created_by_user_id: user.id
    })
    .select(
      "id,game_id,sequence,client_mutation_id,quarter,clock_seconds,possession,play_type,summary,payload,created_by_user_id,created_at,updated_at"
    )
    .single<PlayEventMutationRow>();

  if (insertPlayError) {
    throw new Error(insertPlayError.message);
  }

  if (input.participants.length > 0) {
    const { error: participantsError } = await supabaseAdmin.from("play_participants").insert(
      input.participants.map((participant) => ({
        play_id: insertedPlay.id,
        game_roster_entry_id: participant.gameRosterEntryId ?? null,
        role: participant.role,
        side: participant.side,
        credit_units: participant.creditUnits,
        stat_payload: participant.statPayload ?? null
      }))
    );

    if (participantsError) {
      throw new Error(participantsError.message);
    }
  }

  if (input.penalties.length > 0) {
    const { error: penaltiesError } = await supabaseAdmin.from("play_penalties").insert(
      input.penalties.map((penalty) => ({
        play_id: insertedPlay.id,
        penalized_side: penalty.penalizedSide,
        code: penalty.code,
        yards: penalty.yards,
        result: penalty.result,
        enforcement_type: penalty.enforcementType,
        timing: penalty.timing,
        foul_spot: penalty.foulSpot ?? null,
        automatic_first_down: penalty.automaticFirstDown,
        loss_of_down: penalty.lossOfDown,
        replay_down: penalty.replayDown,
        no_play: penalty.noPlay
      }))
    );

    if (penaltiesError) {
      throw new Error(penaltiesError.message);
    }
  }

  const { error: auditError } = await supabaseAdmin.from("play_event_audits").insert({
    play_id: insertedPlay.id,
    game_id: gameId,
    action: "created",
    previous_snapshot: null,
    next_snapshot: {
      playId: insertedPlay.id,
      gameId,
      sequence: input.sequence,
      quarter: input.quarter,
      clockSeconds: input.clockSeconds,
      possession: input.possession,
      playType: input.playType,
      summary: input.summary,
      payload: input.payload,
      participants: input.participants,
      penalties: input.penalties.map((penalty) => ({
        ...penalty,
        ...normalizePenaltyFlags(penalty)
      }))
    },
    changed_by_user_id: user.id
  });

  if (auditError) {
    throw new Error(auditError.message);
  }

  const revision = gameRow.current_revision + 1;
  const { error: revisionUpdateError } = await supabaseAdmin
    .from("games")
    .update({
      current_revision: revision
    })
    .eq("id", gameId);

  if (revisionUpdateError) {
    throw new Error(revisionUpdateError.message);
  }

  return {
    play: mapMutatedPlay(insertedPlay),
    rebuildFromSequence: input.sequence,
    revision
  };
}

export async function updatePlayEvent(gameId: string, input: UpdatePlayEventInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const db = getDb();

  const existing = await db.query.playEvents.findFirst({
    where: and(eq(playEvents.id, input.playId), eq(playEvents.gameId, gameId))
  });

  if (!existing) {
    throw new Error("Play not found.");
  }

  const existingParticipants = await db.query.playParticipants.findMany({
    where: eq(playParticipants.playId, input.playId)
  });
  const existingPenalties = await db.query.playPenalties.findMany({
    where: eq(playPenalties.playId, input.playId)
  });

  return db.transaction(async (tx) => {
    await assertSequenceAvailable(tx, gameId, input.sequence, input.playId);

    const updated = await tx
      .update(playEvents)
      .set({
        sequence: input.sequence,
        quarter: input.quarter,
        clockSeconds: input.clockSeconds,
        possession: input.possession,
        playType: input.playType,
        payload: input.payload,
        summary: input.summary,
        updatedAt: new Date()
      })
      .where(eq(playEvents.id, input.playId))
      .returning();

    await tx.delete(playParticipants).where(eq(playParticipants.playId, input.playId));
    await tx.delete(playPenalties).where(eq(playPenalties.playId, input.playId));

    if (input.participants.length > 0) {
      await tx.insert(playParticipants).values(
        input.participants.map((participant) => ({
          playId: input.playId,
          gameRosterEntryId: participant.gameRosterEntryId,
          role: participant.role,
          side: participant.side,
          creditUnits: participant.creditUnits,
          statPayload: participant.statPayload
        }))
      );
    }

    if (input.penalties.length > 0) {
      await tx.insert(playPenalties).values(
        input.penalties.map((penalty) => ({
          playId: input.playId,
          penalizedSide: penalty.penalizedSide,
          code: penalty.code,
          yards: penalty.yards,
          result: penalty.result,
          enforcementType: penalty.enforcementType,
          timing: penalty.timing,
          foulSpot: penalty.foulSpot,
          automaticFirstDown: penalty.automaticFirstDown,
          lossOfDown: penalty.lossOfDown,
          replayDown: penalty.replayDown,
          noPlay: penalty.noPlay
        }))
      );
    }

    await writePlayAudit(tx, {
      playId: input.playId,
      gameId,
      action: "updated",
      previousSnapshot: {
        playId: input.playId,
        gameId,
        sequence: existing.sequence,
        quarter: existing.quarter,
        clockSeconds: existing.clockSeconds,
        possession: existing.possession,
        playType: existing.playType,
        summary: existing.summary,
        payload: existing.payload,
        participants: existingParticipants.map((participant) => ({
          gameRosterEntryId: participant.gameRosterEntryId,
          role: participant.role,
          side: participant.side,
          creditUnits: participant.creditUnits,
          statPayload: participant.statPayload
        })),
        penalties: existingPenalties.map((penalty) => ({
          penalizedSide: penalty.penalizedSide,
          code: penalty.code,
          yards: penalty.yards,
          result: penalty.result,
          enforcementType: penalty.enforcementType,
          timing: penalty.timing,
          foulSpot: penalty.foulSpot,
          automaticFirstDown: penalty.automaticFirstDown,
          lossOfDown: penalty.lossOfDown,
          replayDown: penalty.replayDown,
          noPlay: penalty.noPlay
        }))
      },
      nextSnapshot: {
        playId: input.playId,
        gameId,
        sequence: input.sequence,
        quarter: input.quarter,
        clockSeconds: input.clockSeconds,
        possession: input.possession,
        playType: input.playType,
        summary: input.summary,
        payload: input.payload,
        participants: input.participants,
        penalties: input.penalties.map((penalty) => ({
          ...penalty,
          ...normalizePenaltyFlags(penalty)
        }))
      },
      changedByUserId: user.id
    });

    const revision = await bumpGameRevision(tx, gameId);
    const rebuildFromSequence =
      compareSequence(existing.sequence, input.sequence) <= 0 ? existing.sequence : input.sequence;

    return {
      play: updated[0],
      rebuildFromSequence,
      revision
    };
  });
}

export async function deletePlayEvent(gameId: string, playId: string) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const db = getDb();

  const existing = await db.query.playEvents.findFirst({
    where: and(eq(playEvents.id, playId), eq(playEvents.gameId, gameId))
  });

  if (!existing) {
    throw new Error("Play not found.");
  }

  const existingParticipants = await db.query.playParticipants.findMany({
    where: eq(playParticipants.playId, playId)
  });
  const existingPenalties = await db.query.playPenalties.findMany({
    where: eq(playPenalties.playId, playId)
  });

  return db.transaction(async (tx) => {
    await writePlayAudit(tx, {
      playId,
      gameId,
      action: "deleted",
      previousSnapshot: {
        playId,
        gameId,
        sequence: existing.sequence,
        quarter: existing.quarter,
        clockSeconds: existing.clockSeconds,
        possession: existing.possession,
        playType: existing.playType,
        summary: existing.summary,
        payload: existing.payload,
        participants: existingParticipants.map((participant) => ({
          gameRosterEntryId: participant.gameRosterEntryId,
          role: participant.role,
          side: participant.side,
          creditUnits: participant.creditUnits,
          statPayload: participant.statPayload
        })),
        penalties: existingPenalties.map((penalty) => ({
          penalizedSide: penalty.penalizedSide,
          code: penalty.code,
          yards: penalty.yards,
          result: penalty.result,
          enforcementType: penalty.enforcementType,
          timing: penalty.timing,
          foulSpot: penalty.foulSpot,
          automaticFirstDown: penalty.automaticFirstDown,
          lossOfDown: penalty.lossOfDown,
          replayDown: penalty.replayDown,
          noPlay: penalty.noPlay
        }))
      },
      changedByUserId: user.id
    });

    await tx.delete(playEvents).where(eq(playEvents.id, playId));
    const revision = await bumpGameRevision(tx, gameId);

    return {
      playId,
      rebuildFromSequence: existing.sequence,
      revision
    };
  });
}
