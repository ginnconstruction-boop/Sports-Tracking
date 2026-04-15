export type OutboxMutation = {
  id: string;
  gameId: string;
  kind: "append_play" | "edit_play" | "delete_play" | "sync_session";
  payload: Record<string, unknown>;
  expectedRevision: number;
  queuedAt: string;
};

export type SyncEnvelope = {
  gameId: string;
  localRevision: number;
  mutations: OutboxMutation[];
};

function playIdFromMutation(mutation: OutboxMutation) {
  return typeof mutation.payload.playId === "string" ? mutation.payload.playId : null;
}

export function mergeOutboxMutations(existing: OutboxMutation[], incoming: OutboxMutation) {
  const sorted = (mutations: OutboxMutation[]) =>
    [...mutations].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));

  const next = existing.filter((item) => item.id !== incoming.id);
  const playId = playIdFromMutation(incoming);

  if (!playId) {
    return sorted([...next, incoming]);
  }

  if (incoming.kind === "delete_play") {
    const withoutPlay = next.filter((item) => playIdFromMutation(item) !== playId);
    return sorted(playId.startsWith("local-") ? withoutPlay : [...withoutPlay, incoming]);
  }

  if (incoming.kind === "edit_play") {
    const appendMatch = next.find(
      (item) => item.kind === "append_play" && playIdFromMutation(item) === playId
    );

    if (appendMatch) {
      return sorted(
        next.map((item) =>
          item.id === appendMatch.id
            ? {
                ...item,
                payload: {
                  ...item.payload,
                  play: incoming.payload.play,
                  body: incoming.payload.body
                }
              }
            : item
        )
      );
    }

    return sorted([
      ...next.filter((item) => !(item.kind === "edit_play" && playIdFromMutation(item) === playId)),
      incoming
    ]);
  }

  return sorted([
    ...next.filter((item) => !(item.kind === "append_play" && playIdFromMutation(item) === playId)),
    incoming
  ]);
}

export const OFFLINE_STORES = {
  activeGames: "active_games",
  gameSessions: "game_sessions",
  playCache: "play_cache",
  outbox: "outbox"
} as const;

export function canUseBackgroundSync() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window;
}
