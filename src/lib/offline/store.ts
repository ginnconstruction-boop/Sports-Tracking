"use client";

import Dexie, { type Table } from "dexie";
import type { GameDaySnapshot } from "@/lib/domain/game-day";
import type { PlayRecord } from "@/lib/domain/play-log";
import type { OutboxMutation } from "@/lib/offline/outbox";

export type OfflineGameSessionRecord = {
  gameId: string;
  deviceKey: string;
  status: "local_only" | "syncing" | "synced" | "conflict";
  isActiveWriter: boolean;
  localRevision: number;
  remoteRevision: number;
  writerLeaseExpiresAt?: string | null;
  pendingMutationCount?: number;
  lastSyncError?: string | null;
  updatedAt: string;
};

export type OfflineGameCacheRecord = {
  gameId: string;
  snapshot: GameDaySnapshot;
  playLog: PlayRecord[];
  updatedAt: string;
};

export type ActiveGameRecord = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  path: string;
  updatedAt: string;
};

class TrackingOfflineDb extends Dexie {
  activeGames!: Table<ActiveGameRecord, string>;
  gameSessions!: Table<OfflineGameSessionRecord, string>;
  playCache!: Table<OfflineGameCacheRecord, string>;
  outbox!: Table<OutboxMutation, string>;

  constructor() {
    super("tracking-the-game-offline");
    this.version(1).stores({
      activeGames: "gameId, updatedAt",
      gameSessions: "gameId, updatedAt",
      playCache: "gameId, updatedAt",
      outbox: "id, gameId, queuedAt"
    });
  }
}

const offlineDb = new TrackingOfflineDb();

export async function saveActiveGame(record: ActiveGameRecord) {
  await offlineDb.activeGames.put(record);
}

export async function getMostRecentActiveGame() {
  return offlineDb.activeGames.orderBy("updatedAt").last();
}

export async function removeActiveGame(gameId: string) {
  await offlineDb.activeGames.delete(gameId);
}

export async function saveOfflineSession(record: OfflineGameSessionRecord) {
  await offlineDb.gameSessions.put(record);
}

export async function getOfflineSession(gameId: string) {
  return offlineDb.gameSessions.get(gameId);
}

export async function saveOfflineGameCache(record: OfflineGameCacheRecord) {
  await offlineDb.playCache.put(record);
}

export async function getOfflineGameCache(gameId: string) {
  return offlineDb.playCache.get(gameId);
}

export async function queueOutboxMutation(mutation: OutboxMutation) {
  await offlineDb.outbox.put(mutation);
}

export async function listOutboxMutations(gameId: string) {
  return offlineDb.outbox.where("gameId").equals(gameId).sortBy("queuedAt");
}

export async function replaceOutboxMutations(gameId: string, mutations: OutboxMutation[]) {
  const existing = await offlineDb.outbox.where("gameId").equals(gameId).primaryKeys();
  await offlineDb.transaction("rw", offlineDb.outbox, async () => {
    if (existing.length > 0) {
      await offlineDb.outbox.bulkDelete(existing);
    }
    if (mutations.length > 0) {
      await offlineDb.outbox.bulkPut(mutations);
    }
  });
}

export async function removeOutboxMutation(id: string) {
  await offlineDb.outbox.delete(id);
}
