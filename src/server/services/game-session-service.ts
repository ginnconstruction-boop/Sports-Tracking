import { and, eq, lt, ne } from "drizzle-orm";
import type { OpenGameSessionInput, SyncGameSessionInput } from "@/lib/contracts/game-session";
import { requireAuthenticatedUser } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { gameSessions } from "@/server/db/schema";
import { requireGameRole } from "@/server/services/game-access";

export class ActiveWriterConflictError extends Error {
  constructor() {
    super("Another active stat writer already holds the game session lease.");
  }
}

function writerLeaseExpiry(leaseDurationSeconds: number) {
  return new Date(Date.now() + leaseDurationSeconds * 1000);
}

export async function openGameSession(gameId: string, input: OpenGameSessionInput) {
  await requireGameRole(gameId, "stat_operator");
  const user = await requireAuthenticatedUser();
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx
      .update(gameSessions)
      .set({
        isActiveWriter: false
      })
      .where(
        and(
          eq(gameSessions.gameId, gameId),
          eq(gameSessions.isActiveWriter, true),
          lt(gameSessions.writerLeaseExpiresAt, new Date())
        )
      );

    if (input.requestActiveWriter) {
      const activeWriter = await tx.query.gameSessions.findFirst({
        where: and(
          eq(gameSessions.gameId, gameId),
          eq(gameSessions.isActiveWriter, true),
          ne(gameSessions.deviceKey, input.deviceKey)
        )
      });

      if (activeWriter) {
        throw new ActiveWriterConflictError();
      }
    }

    const existing = await tx.query.gameSessions.findFirst({
      where: and(eq(gameSessions.gameId, gameId), eq(gameSessions.deviceKey, input.deviceKey))
    });

    if (existing) {
      const updated = await tx
        .update(gameSessions)
        .set({
          userId: user.id,
          status: "local_only",
          isActiveWriter: input.requestActiveWriter,
          writerLeaseExpiresAt: input.requestActiveWriter ? writerLeaseExpiry(input.leaseDurationSeconds) : null,
          localRevision: input.localRevision,
          remoteRevision: input.remoteRevision
        })
        .where(and(eq(gameSessions.gameId, gameId), eq(gameSessions.deviceKey, input.deviceKey)))
        .returning();

      return updated[0];
    }

    const inserted = await tx
      .insert(gameSessions)
      .values({
        gameId,
        deviceKey: input.deviceKey,
        userId: user.id,
        status: "local_only",
        isActiveWriter: input.requestActiveWriter,
        writerLeaseExpiresAt: input.requestActiveWriter ? writerLeaseExpiry(input.leaseDurationSeconds) : null,
        localRevision: input.localRevision,
        remoteRevision: input.remoteRevision
      })
      .returning();

    return inserted[0];
  });
}

export async function syncGameSession(gameId: string, input: SyncGameSessionInput) {
  await requireGameRole(gameId, "stat_operator");
  const db = getDb();

  const updated = await db
    .update(gameSessions)
    .set({
      status: input.status,
      isActiveWriter: input.releaseWriter ? false : input.extendWriterLease,
      writerLeaseExpiresAt: input.releaseWriter
        ? null
        : input.extendWriterLease
          ? writerLeaseExpiry(input.leaseDurationSeconds)
          : null,
      localRevision: input.localRevision,
      remoteRevision: input.remoteRevision,
      lastSyncedAt: new Date()
    })
    .where(and(eq(gameSessions.gameId, gameId), eq(gameSessions.deviceKey, input.deviceKey)))
    .returning();

  if (!updated[0]) {
    throw new Error("Game session not found for device.");
  }

  return updated[0];
}
