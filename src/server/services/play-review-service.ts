import { and, eq, inArray } from "drizzle-orm";
import type { PlayReviewAnnotation } from "@/lib/domain/play-review";
import { requireGameRole } from "@/server/services/game-access";
import { getDb } from "@/server/db/client";
import { playEvents, playReviewAnnotations } from "@/server/db/schema";
import { requireAuthenticatedUser } from "@/server/auth/context";

function toAnnotation(record: typeof playReviewAnnotations.$inferSelect): PlayReviewAnnotation {
  return {
    playId: record.playId,
    gameId: record.gameId,
    tags: Array.isArray(record.tags) ? record.tags : [],
    note: record.note,
    filmUrl: record.filmUrl,
    updatedAt: record.updatedAt.toISOString()
  };
}

export async function listPlayReviewAnnotations(gameId: string) {
  await requireGameRole(gameId, "read_only");
  const db = getDb();
  const rows = await db.query.playReviewAnnotations.findMany({
    where: eq(playReviewAnnotations.gameId, gameId)
  });
  return rows.map(toAnnotation);
}

export async function upsertPlayReviewAnnotation(input: {
  gameId: string;
  playId: string;
  tags: string[];
  note?: string;
  filmUrl?: string;
}) {
  await requireGameRole(input.gameId, "assistant_coach");
  const user = await requireAuthenticatedUser();
  const db = getDb();
  const play = await db.query.playEvents.findFirst({
    where: and(eq(playEvents.id, input.playId), eq(playEvents.gameId, input.gameId))
  });

  if (!play) {
    throw new Error("Play not found.");
  }

  const inserted = await db
    .insert(playReviewAnnotations)
    .values({
      gameId: input.gameId,
      playId: input.playId,
      tags: input.tags,
      note: input.note ?? null,
      filmUrl: input.filmUrl ?? null,
      updatedByUserId: user.id
    })
    .onConflictDoUpdate({
      target: playReviewAnnotations.playId,
      set: {
        tags: input.tags,
        note: input.note ?? null,
        filmUrl: input.filmUrl ?? null,
        updatedByUserId: user.id,
        updatedAt: new Date()
      }
    })
    .returning();

  return toAnnotation(inserted[0]);
}

export async function deletePlayReviewAnnotations(gameId: string, playIds: string[]) {
  await requireGameRole(gameId, "assistant_coach");
  if (playIds.length === 0) {
    return { success: true };
  }
  const db = getDb();
  await db
    .delete(playReviewAnnotations)
    .where(and(eq(playReviewAnnotations.gameId, gameId), inArray(playReviewAnnotations.playId, playIds)));
  return { success: true };
}
