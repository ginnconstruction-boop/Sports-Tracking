import { asc, eq } from "drizzle-orm";
import type { MembershipRole } from "@/lib/auth/roles";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { compareSequence } from "@/lib/engine/sequence";
import { logServerError } from "@/lib/server/observability";
import { getDb } from "@/server/db/client";
import { gameStateCaches, games, playEvents, playParticipants, playPenalties } from "@/server/db/schema";
import { requireGameRole } from "@/server/services/game-access";

export async function projectGameFromPlayLog(
  gameId: string,
  minimumRole: MembershipRole = "read_only",
  options: { fromSequence?: string; skipAuth?: boolean } = {}
) {
  if (!options.skipAuth) {
    await requireGameRole(gameId, minimumRole);
  }
  const db = getDb();

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
  }

  const events = await db.query.playEvents.findMany({
    where: eq(playEvents.gameId, gameId),
    orderBy: (fields) => [asc(fields.sequence)]
  });

  const participants = await db.query.playParticipants.findMany();
  const penalties = await db.query.playPenalties.findMany();

  const typedEvents = events.map((event) => ({
      id: event.id,
      gameId,
      sequence: event.sequence,
      quarter: event.quarter as 1 | 2 | 3 | 4 | 5,
      clockSeconds: event.clockSeconds,
      possession: event.possession,
      playType: event.playType,
      summary: event.summary,
      payload: (event.payload ?? {}) as any,
      participants: participants
        .filter((participant) => participant.playId === event.id)
        .map((participant) => ({
          gameRosterEntryId: participant.gameRosterEntryId ?? undefined,
          role: participant.role,
          side: participant.side,
          creditUnits: participant.creditUnits,
          statPayload: (participant.statPayload ?? undefined) as Record<string, unknown> | undefined
        })),
      penalties: penalties
        .filter((penalty) => penalty.playId === event.id)
        .map((penalty) => ({
          penalizedSide: penalty.penalizedSide,
          code: penalty.code,
          yards: penalty.yards,
          result: penalty.result,
          enforcementType: penalty.enforcementType,
          timing: penalty.timing,
          foulSpot: (penalty.foulSpot ?? undefined) as any,
          automaticFirstDown: penalty.automaticFirstDown,
          lossOfDown: penalty.lossOfDown,
          replayDown: penalty.replayDown,
          noPlay: penalty.noPlay
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
    const db = getDb();

    await db
      .insert(gameStateCaches)
      .values({
        gameId,
        revision: game.currentRevision,
        state: projection.currentState,
        timelinePreview: projection.timeline.slice(-10)
      })
      .onConflictDoUpdate({
        target: gameStateCaches.gameId,
        set: {
          revision: game.currentRevision,
          state: projection.currentState,
          timelinePreview: projection.timeline.slice(-10),
          rebuiltAt: new Date()
        }
      });

    await db
      .update(games)
      .set({
        lastRebuiltAt: new Date()
      })
      .where(eq(games.id, gameId));

    return projection;
  } catch (error) {
    logServerError("rebuild-service", "rebuild_failed", error, {
      gameId,
      fromSequence: options.fromSequence ?? null
    });
    throw error;
  }
}
