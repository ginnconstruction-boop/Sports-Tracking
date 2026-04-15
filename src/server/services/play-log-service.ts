import { and, asc, eq } from "drizzle-orm";
import type { CreatePlayEventInput, UpdatePlayEventInput } from "@/lib/contracts/play-log";
import { compareSequence } from "@/lib/engine/sequence";
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

async function currentGameRevision(tx: DbTransaction, gameId: string) {
  const game = await tx.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
  }

  return game.currentRevision;
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

export async function listPlayEvents(gameId: string) {
  await requireGameRole(gameId, "read_only");
  const db = getDb();

  return db.query.playEvents.findMany({
    where: eq(playEvents.gameId, gameId),
    orderBy: (fields) => [asc(fields.sequence)]
  });
}

export async function createPlayEvent(gameId: string, input: CreatePlayEventInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const db = getDb();

  return db.transaction(async (tx) => {
    if (input.clientMutationId) {
      const existing = await tx.query.playEvents.findFirst({
        where: and(
          eq(playEvents.gameId, gameId),
          eq(playEvents.clientMutationId, input.clientMutationId)
        )
      });

      if (existing) {
        return {
          play: existing,
          rebuildFromSequence: existing.sequence,
          revision: await currentGameRevision(tx, gameId),
          deduped: true
        };
      }
    }

    await assertSequenceAvailable(tx, gameId, input.sequence);

    const inserted = await tx
      .insert(playEvents)
      .values({
        gameId,
        sequence: input.sequence,
        clientMutationId: input.clientMutationId,
        quarter: input.quarter,
        clockSeconds: input.clockSeconds,
        possession: input.possession,
        playType: input.playType,
        payload: input.payload,
        summary: input.summary,
        createdByUserId: user.id
      })
      .returning();

    const play = inserted[0];

    if (input.participants.length > 0) {
      await tx.insert(playParticipants).values(
        input.participants.map((participant) => ({
          playId: play.id,
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
          playId: play.id,
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
      playId: play.id,
      gameId,
      action: "created",
      nextSnapshot: {
        playId: play.id,
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

    return {
      play,
      rebuildFromSequence: input.sequence,
      revision
    };
  });
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
