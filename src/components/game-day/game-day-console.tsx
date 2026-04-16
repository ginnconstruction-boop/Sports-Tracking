"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import type { GameDaySnapshot } from "@/lib/domain/game-day";
import type { PlayRecord } from "@/lib/domain/play-log";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { buildGameDaySnapshot } from "@/lib/game-day/snapshot";
import { formatClock, parseClockToSeconds } from "@/lib/engine/clock";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { compareSequence } from "@/lib/engine/sequence";
import { mergeOutboxMutations, type OutboxMutation } from "@/lib/offline/outbox";
import {
  getOfflineGameCache,
  getOfflineSession,
  listOutboxMutations,
  replaceOutboxMutations,
  saveActiveGame,
  saveOfflineGameCache,
  saveOfflineSession,
  type OfflineGameSessionRecord
} from "@/lib/offline/store";
import {
  PlayEntryPanel,
  type PlayEntryIntent,
  type PlaySubmission
} from "@/components/game-day/play-entry-panel";
import { PlayReviewPanel } from "@/components/game-day/play-review-panel";

type GameSessionRecord = {
  id: string;
  status: "local_only" | "syncing" | "synced" | "conflict";
  isActiveWriter: boolean;
  localRevision: number;
  remoteRevision: number;
  writerLeaseExpiresAt?: string | null;
  pendingMutationCount?: number;
  lastSyncError?: string | null;
};

type GameDayConsoleProps = {
  gameId: string;
  initialSnapshot: GameDaySnapshot;
};

type PlaysResponse = {
  items: PlayRecord[];
};

type LiveResponse = {
  item: GameDaySnapshot;
};

type SessionResponse = {
  item: GameSessionRecord;
};

type MutationResponse = {
  live: GameDaySnapshot;
  revision: number;
};

function getDeviceKey() {
  const storageKey = "tracking-the-game:device-key";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function localPlayId() {
  return `local-${crypto.randomUUID()}`;
}

function isWriterConflict(message: string) {
  return message.toLowerCase().includes("active stat writer");
}

function orderedPlayLog(playLog: PlayRecord[]) {
  return [...playLog].sort((left, right) => compareSequence(left.sequence, right.sequence));
}

function buildLocalSnapshot(base: GameDaySnapshot, playLog: PlayRecord[], revision: number) {
  const projection = rebuildFromPlayLog(orderedPlayLog(playLog));

  return buildGameDaySnapshot({
    gameId: base.gameId,
    revision,
    status: base.status,
    lastRebuiltAt: new Date().toISOString(),
    homeTeam: base.homeTeam,
    awayTeam: base.awayTeam,
    rosters: base.rosters,
    projection,
    playReviews: base.playReviews
  });
}

function createLocalPlay(gameId: string, submission: PlaySubmission, playId?: string): PlayRecord {
  return {
    id: playId ?? submission.playId ?? localPlayId(),
    gameId,
    sequence: submission.body.sequence,
    clientMutationId: submission.body.clientMutationId ?? null,
    quarter: submission.body.quarter,
    clockSeconds: parseClockToSeconds(submission.body.clock),
    possession: submission.body.possession,
    playType: submission.body.playType,
    summary: submission.body.summary ?? null,
    payload: submission.body.payload as PlayRecord["payload"],
    participants: submission.body.participants,
    penalties: submission.body.penalties
  };
}

function applyMutationToPlayLog(playLog: PlayRecord[], mutation: OutboxMutation) {
  switch (mutation.kind) {
    case "append_play": {
      const play = mutation.payload.play as PlayRecord;
      return orderedPlayLog([...playLog.filter((item) => item.id !== play.id), play]);
    }
    case "edit_play": {
      const play = mutation.payload.play as PlayRecord;
      return orderedPlayLog(playLog.map((item) => (item.id === play.id ? play : item)));
    }
    case "delete_play": {
      const playId = mutation.payload.playId as string;
      return playLog.filter((item) => item.id !== playId);
    }
    default:
      return playLog;
  }
}

function statusFromOfflineSession(session?: OfflineGameSessionRecord | null): GameSessionRecord | null {
  if (!session) return null;
  return {
    id: session.gameId,
    status: session.status,
    isActiveWriter: session.isActiveWriter,
    localRevision: session.localRevision,
    remoteRevision: session.remoteRevision,
    writerLeaseExpiresAt: session.writerLeaseExpiresAt ?? null,
    pendingMutationCount: session.pendingMutationCount ?? 0,
    lastSyncError: session.lastSyncError ?? null
  };
}

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.error ?? "Request failed.");
  }
  return body as T;
}

export function GameDayConsole({ gameId, initialSnapshot }: GameDayConsoleProps) {
  const canUndoLastPlay = isFeatureEnabled("undo_last_play");
  const showDriveSummary = isFeatureEnabled("drive_summary");
  const showInternalReview = isFeatureEnabled("internal_debug_tools");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [playLog, setPlayLog] = useState<PlayRecord[]>([]);
  const [session, setSession] = useState<GameSessionRecord | null>(null);
  const [deviceKey, setDeviceKey] = useState<string>("");
  const [statusText, setStatusText] = useState("Connecting to live session...");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>("connect");
  const [intent, setIntent] = useState<PlayEntryIntent>({ kind: "append" });
  const [selectedReviewPlayId, setSelectedReviewPlayId] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [selectedPlayIds, setSelectedPlayIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isOffline, setIsOffline] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const reviewByPlayId = useMemo(
    () => new Map(snapshot.playReviews.map((item) => [item.playId, item])),
    [snapshot.playReviews]
  );

  function captureClientIssue(event: string, error: unknown, context: Record<string, unknown> = {}) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        : {
            message: String(error)
          };

    console.error(
      JSON.stringify({
        level: "error",
        ts: new Date().toISOString(),
        scope: "game-day-console",
        event,
        gameId,
        ...context,
        error: details
      })
    );
  }

  async function persistLocalState(
    nextSnapshot: GameDaySnapshot,
    nextPlayLog: PlayRecord[],
    nextSession?: GameSessionRecord | null
  ) {
    await saveOfflineGameCache({
      gameId,
      snapshot: nextSnapshot,
      playLog: nextPlayLog,
      updatedAt: new Date().toISOString()
    });

    await saveActiveGame({
      gameId,
      homeTeam: nextSnapshot.homeTeam,
      awayTeam: nextSnapshot.awayTeam,
      path: `/games/${gameId}/gameday`,
      updatedAt: new Date().toISOString()
    });

    if (nextSession) {
      await saveOfflineSession({
        gameId,
        deviceKey,
        status: nextSession.status,
        isActiveWriter: nextSession.isActiveWriter,
        localRevision: nextSession.localRevision,
        remoteRevision: nextSession.remoteRevision,
        writerLeaseExpiresAt: nextSession.writerLeaseExpiresAt ?? null,
        pendingMutationCount: nextSession.pendingMutationCount ?? 0,
        lastSyncError: nextSession.lastSyncError ?? null,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async function hydrateFromServer(nextDeviceKey: string, requestActiveWriter = true) {
    const opened = await readJson<SessionResponse>(`/api/v1/games/${gameId}/session`, {
      method: "POST",
      body: JSON.stringify({
        deviceKey: nextDeviceKey,
        requestActiveWriter,
        leaseDurationSeconds: 300,
        localRevision: snapshot.revision,
        remoteRevision: snapshot.revision
      })
    });

    const [live, plays] = await Promise.all([
      readJson<LiveResponse>(`/api/v1/games/${gameId}/live`),
      readJson<PlaysResponse>(`/api/v1/games/${gameId}/plays`)
    ]);

    setSession(opened.item);
    setSnapshot(live.item);
    setPlayLog(plays.items);
    setIsOffline(false);
    setStatusText(requestActiveWriter ? "Writer lock acquired." : "Viewer session opened.");
    await persistLocalState(live.item, plays.items, opened.item);
  }

  async function flushOutbox(nextDeviceKey: string, basePlayLog?: PlayRecord[]) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
      return;
    }

    const queued = await listOutboxMutations(gameId);
    setPendingMutations(queued.length);
    if (queued.length === 0) {
      return;
    }

    setStatusText(`Syncing ${queued.length} queued update${queued.length === 1 ? "" : "s"}...`);

    try {
      for (const mutation of queued) {
        if (mutation.kind === "append_play") {
          await readJson<MutationResponse>(`/api/v1/games/${gameId}/plays`, {
            method: "POST",
            body: JSON.stringify(mutation.payload.body)
          });
        }

        if (mutation.kind === "edit_play") {
          const playId = mutation.payload.playId as string | undefined;
          if (!playId || playId.startsWith("local-")) {
            continue;
          }

          await readJson<MutationResponse>(`/api/v1/games/${gameId}/plays/${playId}`, {
            method: "PATCH",
            body: JSON.stringify(mutation.payload.body)
          });
        }

        if (mutation.kind === "delete_play") {
          const playId = mutation.payload.playId as string | undefined;
          if (!playId || playId.startsWith("local-")) {
            continue;
          }

          await readJson<MutationResponse>(`/api/v1/games/${gameId}/plays/${playId}`, {
            method: "DELETE"
          });
        }
      }

      await replaceOutboxMutations(gameId, []);
      const [live, plays] = await Promise.all([
        readJson<LiveResponse>(`/api/v1/games/${gameId}/live`),
        readJson<PlaysResponse>(`/api/v1/games/${gameId}/plays`)
      ]);

      const syncedSession = deviceKey
        ? await readJson<SessionResponse>(`/api/v1/games/${gameId}/session`, {
            method: "PATCH",
            body: JSON.stringify({
              deviceKey: nextDeviceKey,
              extendWriterLease: true,
              releaseWriter: false,
              leaseDurationSeconds: 300,
              localRevision: live.item.revision,
              remoteRevision: live.item.revision,
              status: "synced"
            })
          })
        : null;

      startTransition(() => {
        setSnapshot(live.item);
        setPlayLog(plays.items);
        setPendingMutations(0);
        if (syncedSession) {
          setSession({
            ...syncedSession.item,
            pendingMutationCount: 0,
            lastSyncError: null
          });
        }
      });

      await persistLocalState(
        live.item,
        plays.items,
        syncedSession
          ? {
              ...syncedSession.item,
              pendingMutationCount: 0,
              lastSyncError: null
            }
          : session
      );
      setStatusText("Derived state rebuilt from play log.");
      setIsOffline(false);
      setErrorText(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync live updates.";
      captureClientIssue("sync_failed", error, {
        queuedMutations: queued.length
      });
      const localPlayLog = basePlayLog ?? playLog;
      const localRevision = snapshot.revision + queued.length;
      const optimisticSnapshot = buildLocalSnapshot(snapshot, localPlayLog, localRevision);
      const offlineSession: GameSessionRecord = {
        id: session?.id ?? gameId,
        status: isWriterConflict(message) ? "conflict" : "local_only",
        isActiveWriter: session?.isActiveWriter ?? true,
        localRevision,
        remoteRevision: session?.remoteRevision ?? snapshot.revision,
        writerLeaseExpiresAt: session?.writerLeaseExpiresAt ?? null,
        pendingMutationCount: queued.length,
        lastSyncError: message
      };

      setSnapshot(optimisticSnapshot);
      setSession(offlineSession);
      setPendingMutations(queued.length);
      setIsOffline(true);
      setStatusText("Offline queue active. Changes will sync when the connection returns.");
      setErrorText(message);
      await persistLocalState(optimisticSnapshot, localPlayLog, offlineSession);
    }
  }

  const connectToSession = useEffectEvent(async (nextDeviceKey: string) => {
    const [cachedGame, cachedSession] = await Promise.all([
      getOfflineGameCache(gameId),
      getOfflineSession(gameId)
    ]);

    if (cachedGame) {
      setSnapshot(cachedGame.snapshot);
      setPlayLog(cachedGame.playLog);
      setStatusText("Loaded cached sideline state.");
    }

    if (cachedSession) {
      setSession(statusFromOfflineSession(cachedSession));
    }

    try {
      await hydrateFromServer(nextDeviceKey);
      await flushOutbox(nextDeviceKey);
      setBusyAction(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open the game session.";
      captureClientIssue("connect_failed", error);
      if (isWriterConflict(message)) {
        try {
          await hydrateFromServer(nextDeviceKey, false);
          setErrorText(message);
          setStatusText("Viewer mode. Another writer currently holds the lease.");
          setBusyAction(null);
          return;
        } catch {
          // Fall through to cached/offline handling below if viewer open also fails.
        }
      }

      if (cachedGame) {
        const fallbackSession =
          statusFromOfflineSession(cachedSession) ??
          ({
            id: gameId,
            status: "local_only",
            isActiveWriter: true,
            localRevision: cachedGame.snapshot.revision,
            remoteRevision: cachedGame.snapshot.revision,
            writerLeaseExpiresAt: null
          } satisfies GameSessionRecord);

        setSession(fallbackSession);
        setIsOffline(true);
        setErrorText(null);
        setStatusText("Offline local mode.");
        setBusyAction(null);
        await persistLocalState(cachedGame.snapshot, cachedGame.playLog, fallbackSession);
        return;
      }

      setErrorText(message);
      setStatusText("Read-only mode.");
      setBusyAction(null);
    }
  });

  const releaseWriterLeaseOnPageHide = useEffectEvent(() => {
    void releaseWriterLease();
  });

  const flushOutboxOnReconnect = useEffectEvent(() => {
    setIsOffline(false);
    if (deviceKey) {
      void flushOutbox(deviceKey);
    }
  });

  useEffect(() => {
    const nextDeviceKey = getDeviceKey();
    setDeviceKey(nextDeviceKey);
    void connectToSession(nextDeviceKey);
  }, [gameId]);

  useEffect(() => {
    function handlePageHide() {
      releaseWriterLeaseOnPageHide();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => {
    function handleOnline() {
      flushOutboxOnReconnect();
    }

    function handleOffline() {
      setIsOffline(true);
      setStatusText("Offline queue active.");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!deviceKey || !session?.isActiveWriter || isOffline) return;

    const timer = window.setInterval(() => {
      void readJson<SessionResponse>(`/api/v1/games/${gameId}/session`, {
        method: "PATCH",
        body: JSON.stringify({
          deviceKey,
          extendWriterLease: true,
          releaseWriter: false,
          leaseDurationSeconds: 300,
          localRevision: snapshot.revision,
          remoteRevision: snapshot.revision,
          status: pendingMutations > 0 ? "syncing" : "synced"
        })
      })
        .then((result) => {
          setSession({
            ...result.item,
            pendingMutationCount: pendingMutations,
            lastSyncError: errorText
          });
          return saveOfflineSession({
            gameId,
            deviceKey,
            status: result.item.status,
            isActiveWriter: result.item.isActiveWriter,
            localRevision: result.item.localRevision,
            remoteRevision: result.item.remoteRevision,
            writerLeaseExpiresAt: result.item.writerLeaseExpiresAt ?? null,
            pendingMutationCount: pendingMutations,
            lastSyncError: errorText,
            updatedAt: new Date().toISOString()
          });
        })
        .catch(() => undefined);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [deviceKey, errorText, gameId, isOffline, pendingMutations, session?.isActiveWriter, snapshot.revision]);

  async function queueAndApplyMutation(
    mutation: OutboxMutation,
    nextPlayLog: PlayRecord[],
    nextSnapshot: GameDaySnapshot
  ) {
    const existing = await listOutboxMutations(gameId);
    const nextMutations = mergeOutboxMutations(existing, mutation);
    await replaceOutboxMutations(gameId, nextMutations);
    setPendingMutations(nextMutations.length);

    const nextSession: GameSessionRecord = {
      id: session?.id ?? gameId,
      status: isOffline ? "local_only" : "syncing",
      isActiveWriter: session?.isActiveWriter ?? true,
      localRevision: nextSnapshot.revision,
      remoteRevision: session?.remoteRevision ?? snapshot.revision,
      writerLeaseExpiresAt: session?.writerLeaseExpiresAt ?? null,
      pendingMutationCount: nextMutations.length,
      lastSyncError: session?.lastSyncError ?? null
    };

    startTransition(() => {
      setSnapshot(nextSnapshot);
      setPlayLog(nextPlayLog);
      setSession(nextSession);
      setIntent({ kind: "append" });
    });

    await persistLocalState(nextSnapshot, nextPlayLog, nextSession);

    if (!isOffline && deviceKey) {
      await flushOutbox(deviceKey, nextPlayLog);
    } else {
      setStatusText("Saved locally. Waiting to sync.");
    }
  }

  async function refreshLiveSnapshot() {
    if (!deviceKey) return;
    setErrorText(null);
    setBusyAction("refresh");
    setStatusText("Refreshing live snapshot...");

    try {
      await hydrateFromServer(deviceKey, session?.isActiveWriter ?? false);
      await flushOutbox(deviceKey);
    } catch (error) {
      captureClientIssue("refresh_failed", error);
      setErrorText(error instanceof Error ? error.message : "Unable to refresh live snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function reacquireWriterLease() {
    if (!deviceKey) return;
    setErrorText(null);
    setBusyAction("lease");
    setStatusText("Reacquiring writer lease...");

    try {
      await hydrateFromServer(deviceKey, true);
      await flushOutbox(deviceKey);
    } catch (error) {
      captureClientIssue("lease_reacquire_failed", error);
      setErrorText(error instanceof Error ? error.message : "Unable to reacquire writer lease.");
    } finally {
      setBusyAction(null);
    }
  }

  async function releaseWriterLease() {
    if (!deviceKey || !session?.isActiveWriter) return;

    try {
      const released = await readJson<SessionResponse>(`/api/v1/games/${gameId}/session`, {
        method: "PATCH",
        body: JSON.stringify({
          deviceKey,
          extendWriterLease: false,
          releaseWriter: true,
          leaseDurationSeconds: 0,
          localRevision: snapshot.revision,
          remoteRevision: snapshot.revision,
          status: pendingMutations > 0 ? "syncing" : "synced"
        })
      });

      const nextSession = {
        ...released.item,
        pendingMutationCount: pendingMutations,
        lastSyncError: errorText
      };
      setSession(nextSession);
      await persistLocalState(snapshot, playLog, nextSession);
      setStatusText("Writer lease released.");
    } catch {
      // Best effort only when leaving the page.
    }
  }

  async function submitPlay(submission: PlaySubmission) {
    setErrorText(null);
    setBusyAction(submission.mode === "edit" ? "edit" : "submit");
    const now = new Date().toISOString();
    setStatusText(submission.mode === "edit" ? "Saving play edit..." : "Submitting play...");

    try {
      const normalizedBody = {
        ...submission.body,
        clientMutationId:
          submission.mode === "create"
            ? submission.body.clientMutationId ?? crypto.randomUUID()
            : submission.body.clientMutationId
      };
      const normalizedSubmission = {
        ...submission,
        body: normalizedBody
      } satisfies PlaySubmission;

      const optimisticPlay =
        submission.mode === "edit" && submission.playId
          ? createLocalPlay(gameId, normalizedSubmission, submission.playId)
          : createLocalPlay(gameId, normalizedSubmission);

      const currentOutbox = await listOutboxMutations(gameId);

      if (submission.mode === "edit" && submission.playId?.startsWith("local-")) {
        const nextMutations = currentOutbox.map((item) =>
          item.kind === "append_play" && item.payload.playId === submission.playId
            ? {
                ...item,
                payload: {
                  ...item.payload,
                  play: optimisticPlay,
                  body: normalizedBody
                }
              }
            : item
        );
        const nextPlayLog = orderedPlayLog(playLog.map((item) => (item.id === submission.playId ? optimisticPlay : item)));
        const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + nextMutations.length);
        await replaceOutboxMutations(gameId, nextMutations);
        setPendingMutations(nextMutations.length);
        startTransition(() => {
          setSnapshot(nextSnapshot);
          setPlayLog(nextPlayLog);
          setIntent({ kind: "append" });
        });
        await persistLocalState(nextSnapshot, nextPlayLog, session);
        return;
      }

      const mutation: OutboxMutation =
        submission.mode === "edit" && submission.playId
          ? {
              id: crypto.randomUUID(),
              gameId,
              kind: "edit_play",
              payload: {
                playId: submission.playId,
                play: optimisticPlay,
                body: normalizedBody
              },
              expectedRevision: snapshot.revision,
              queuedAt: now
            }
          : {
              id: crypto.randomUUID(),
              gameId,
              kind: "append_play",
              payload: {
                playId: optimisticPlay.id,
                play: optimisticPlay,
                body: normalizedBody
              },
              expectedRevision: snapshot.revision,
              queuedAt: now
            };

      const nextPlayLog =
        submission.mode === "edit" && submission.playId
          ? orderedPlayLog(playLog.map((item) => (item.id === submission.playId ? optimisticPlay : item)))
          : orderedPlayLog([...playLog, optimisticPlay]);
      const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + 1);
      await queueAndApplyMutation(mutation, nextPlayLog, nextSnapshot);
    } catch (error) {
      captureClientIssue("submit_failed", error, {
        mode: submission.mode,
        playType: submission.body.playType
      });
      setErrorText(error instanceof Error ? error.message : "Unable to submit play.");
      setStatusText("Play submission failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deletePlay(playId: string) {
    setErrorText(null);
    setBusyAction("delete");
    const now = new Date().toISOString();
    try {
      const currentOutbox = await listOutboxMutations(gameId);

      if (playId.startsWith("local-")) {
        const nextMutations = currentOutbox.filter(
          (item) =>
            !(
              item.kind === "append_play" &&
              (item.payload.playId === playId || (item.payload.play as PlayRecord | undefined)?.id === playId)
            )
        );
        const nextPlayLog = playLog.filter((item) => item.id !== playId);
        const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + Math.max(0, nextMutations.length));
        await replaceOutboxMutations(gameId, nextMutations);
        setPendingMutations(nextMutations.length);
        startTransition(() => {
          setSnapshot(nextSnapshot);
          setPlayLog(nextPlayLog);
        });
        await persistLocalState(nextSnapshot, nextPlayLog, session);
        setStatusText("Removed unsynced play locally.");
        return;
      }

      const mutation: OutboxMutation = {
        id: crypto.randomUUID(),
        gameId,
        kind: "delete_play",
        payload: {
          playId
        },
        expectedRevision: snapshot.revision,
        queuedAt: now
      };

      const nextPlayLog = playLog.filter((item) => item.id !== playId);
      const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + 1);
      setStatusText("Undoing last play...");
      await queueAndApplyMutation(mutation, nextPlayLog, nextSnapshot);
    } catch (error) {
      captureClientIssue("delete_failed", error, {
        playId
      });
      setErrorText(error instanceof Error ? error.message : "Unable to delete play.");
      setStatusText("Unable to remove play.");
    } finally {
      setBusyAction(null);
    }
  }

  async function savePlayReview(payload: {
    playId: string;
    tags: string[];
    note?: string;
    filmUrl?: string;
  }) {
    setStatusText("Saving play review...");
    setErrorText(null);

    try {
      const response = await readJson<{ item: GameDaySnapshot["playReviews"][number] }>(
        `/api/v1/games/${gameId}/plays/${payload.playId}/review`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );

      setSnapshot((current) => ({
        ...current,
        playReviews: [
          ...current.playReviews.filter((item) => item.playId !== payload.playId),
          response.item
        ]
      }));
      setStatusText("Play review saved.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unable to save review.");
    }
  }

  async function deletePlayReview(playId: string) {
    setStatusText("Clearing play review...");
    setErrorText(null);

    try {
      await readJson<{ item: { success: true } }>(`/api/v1/games/${gameId}/plays/${playId}/review`, {
        method: "DELETE"
      });
      setSnapshot((current) => ({
        ...current,
        playReviews: current.playReviews.filter((item) => item.playId !== playId)
      }));
      setStatusText("Play review cleared.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unable to clear review.");
    }
  }

  const state = snapshot.currentState;
  const writerLabel = session?.isActiveWriter ? "Active writer" : "Viewer";
  const syncLabel = session?.status ? session.status.replace("_", " ") : "session pending";
  const latestPlay = snapshot.recentPlays[0];
  const offlineLabel = isOffline ? "offline" : "online";
  const canWrite = Boolean(session?.isActiveWriter);
  const driveResultLabel = (result: GameDaySnapshot["driveSummaries"][number]["result"]) =>
    result.replaceAll("_", " ");
  const currentDrive = snapshot.driveSummaries[0] ?? null;
  const selectedReviewPlay =
    snapshot.fullPlayLog.find((item) => item.playId === selectedReviewPlayId) ?? snapshot.fullPlayLog[0] ?? null;
  const selectedCorrectionPlays = snapshot.fullPlayLog.filter((item) => selectedPlayIds.includes(item.playId));
  const pressureCues = [
    state.down >= 3 ? `${state.down === 3 ? "Third" : "Fourth"} down` : null,
    state.ballOn.side === "away" && state.ballOn.yardLine <= 20 ? "Red zone" : null,
    state.ballOn.side === "home" && state.ballOn.yardLine <= 10 ? "Backed up" : null,
    currentDrive?.result === "in_progress" && currentDrive.playCount >= 8 ? "Long drive" : null
  ].filter(Boolean) as string[];

  function toggleSelectedPlay(playId: string) {
    setSelectedPlayIds((current) =>
      current.includes(playId) ? current.filter((item) => item !== playId) : [...current, playId]
    );
  }

  return (
    <section className="app-grid">
      <div className="board">
        <div className="board-header">
          <div className="score-strip">
            <div className="score-box">
              <span>{snapshot.awayTeam}</span>
              <strong>{state.score.away}</strong>
            </div>
            <div className="score-box">
              <span>{state.phase}</span>
              <strong>{formatClock(state.clockSeconds)}</strong>
            </div>
            <div className="score-box">
              <span>{snapshot.homeTeam}</span>
              <strong>{state.score.home}</strong>
            </div>
          </div>

        </div>

        <div className="board-body stack-lg">
          <PlayEntryPanel
            snapshot={snapshot}
            intent={intent}
            disabled={!canWrite}
            submitting={isPending}
            compactMode={compactMode}
            onSubmit={submitPlay}
            onCancelIntent={() => setIntent({ kind: "append" })}
          />
          <div className="status-strip">
            <span className="status-pill strong">{writerLabel}</span>
            <span className="status-pill">{offlineLabel}</span>
            <span className="status-pill">{syncLabel}</span>
            <span className="status-pill">Revision {snapshot.revision}</span>
            <span className="status-pill">
              {state.down}&amp;{state.distance} on {state.ballOn.side === "home" ? "own" : "opp"} {state.ballOn.yardLine}
            </span>
            <span className="status-pill">
              Possession {state.possession === "home" ? snapshot.homeTeam : snapshot.awayTeam}
            </span>
            {pressureCues.map((cue) => (
              <span className="status-pill" key={cue}>
                {cue}
              </span>
            ))}
            {pendingMutations > 0 ? (
              <span className="status-pill">{pendingMutations} queued</span>
            ) : null}
          </div>

          <details className="session-details">
            <summary className="session-summary">Session &amp; drive info</summary>
            <div className="stack-md" style={{ marginTop: 14 }}>
              <div className="split-panel split-panel-balanced">
                <div className="list-panel">
                  <h3 style={{ marginTop: 0 }}>Session</h3>
                  <div className="stack-sm">
                    <div className="mono">{statusText}</div>
                    {session?.writerLeaseExpiresAt ? (
                      <div className="mono">Lease until {new Date(session.writerLeaseExpiresAt).toLocaleTimeString()}</div>
                    ) : null}
                    {snapshot.lastRebuiltAt ? (
                      <div className="mono">Last rebuild {new Date(snapshot.lastRebuiltAt).toLocaleTimeString()}</div>
                    ) : null}
                    {errorText ? <div className="error-note">{errorText}</div> : null}
                    <div className="timeline-actions">
                      <button className="mini-button" disabled={busyAction !== null} type="button" onClick={() => setCompactMode((current) => !current)}>
                        {compactMode ? "Standard mode" : "Ultra-fast mode"}
                      </button>
                      {showInternalReview ? (
                        <button className="mini-button" type="button" onClick={() => setCorrectionMode((current) => !current)}>
                          {correctionMode ? "Hide correction" : "Correction queue"}
                        </button>
                      ) : null}
                      <button className="mini-button" disabled={busyAction !== null || !deviceKey} type="button" onClick={() => void refreshLiveSnapshot()}>
                        {busyAction === "refresh" ? "Refreshing..." : "Refresh live"}
                      </button>
                      <button className="mini-button" disabled={busyAction !== null || !deviceKey || pendingMutations === 0} type="button" onClick={() => void flushOutbox(deviceKey)}>
                        Retry sync
                      </button>
                      {session?.isActiveWriter ? (
                        <button className="mini-button" disabled={busyAction !== null} type="button" onClick={() => void releaseWriterLease()}>
                          Release writer
                        </button>
                      ) : null}
                      {!session?.isActiveWriter ? (
                        <button className="mini-button" disabled={busyAction !== null || !deviceKey} type="button" onClick={() => void reacquireWriterLease()}>
                          {busyAction === "lease" ? "Trying..." : "Try writer lease"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="list-panel">
                  <h3 style={{ marginTop: 0 }}>Quarter summary</h3>
                  <div className="table-like compact">
                    {snapshot.quarterSummary.map((item) => (
                      <div className="table-row compact" key={item.quarter}>
                        <span className="mono">Q{item.quarter}</span>
                        <span>{item.playCount} plays</span>
                        <span className="mono">
                          {item.awayPoints}-{item.homePoints}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="list-panel">
                <div className="entry-header" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>Current drive</h3>
                  <div className="timeline-actions">
                    <Link className="mini-button" href={`/games/${gameId}/manage`}>
                      Game admin
                    </Link>
                    {showInternalReview ? (
                      <Link className="mini-button" href={`/games/${gameId}/review`}>
                        Review workspace
                      </Link>
                    ) : null}
                  </div>
                </div>
                {currentDrive ? (
                  <div className="stack-sm">
                    <div className="mono">
                      {currentDrive.side === "home" ? snapshot.homeTeam : snapshot.awayTeam} from {currentDrive.startFieldPosition}
                    </div>
                    <div className="pill-row">
                      <span className="chip">{currentDrive.playCount} plays</span>
                      <span className="chip">{currentDrive.yardsGained} yards</span>
                      <span className="chip">{driveResultLabel(currentDrive.result)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="kicker">Drive summary will appear once live plays are entered.</div>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="section-grid">
        {showInternalReview && (correctionMode || selectedCorrectionPlays.length > 0) ? (
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Correction queue</h2>
              <span className="chip">{selectedCorrectionPlays.length} selected</span>
            </div>
            <div className="pill-row">
              <button className="mini-button" type="button" onClick={() => setSelectedPlayIds([])}>
                Clear selection
              </button>
              {selectedCorrectionPlays[0] ? (
                <>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => setIntent({ kind: "edit", play: selectedCorrectionPlays[0] })}
                  >
                    Edit first selected
                  </button>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => setIntent({ kind: "insert", beforePlay: selectedCorrectionPlays[0] })}
                  >
                    Insert before first
                  </button>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => setSelectedReviewPlayId(selectedCorrectionPlays[0].playId)}
                  >
                    Review first
                  </button>
                </>
              ) : null}
            </div>
            <div className="table-like">
              {selectedCorrectionPlays.length === 0 ? (
                <div className="kicker">Select plays from the full log explorer to build a correction queue.</div>
              ) : (
                selectedCorrectionPlays.map((item) => (
                  <div className="timeline-card" key={`selected-${item.playId}`}>
                    <div className="timeline-top">
                      <strong>{item.summary}</strong>
                      <span className="mono">
                        Q{item.quarter} {formatClock(item.clockSeconds)} | {item.sequence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {!compactMode ? (
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Live oversight</h2>
              <span className="chip">{snapshot.possessionSummary.length} recent possessions</span>
            </div>
            <div className="three-column">
              <div className="section-card stack-sm" style={{ padding: 18 }}>
                <strong>Last score</strong>
                <p className="kicker" style={{ margin: 0 }}>
                  {snapshot.lastScoringPlay?.summary ?? "No scoring play yet."}
                </p>
              </div>
              <div className="section-card stack-sm" style={{ padding: 18 }}>
                <strong>Last turnover</strong>
                <p className="kicker" style={{ margin: 0 }}>
                  {snapshot.lastTurnoverPlay?.summary ?? "No possession swing logged yet."}
                </p>
              </div>
              <div className="section-card stack-sm" style={{ padding: 18 }}>
                <strong>Last penalty</strong>
                <p className="kicker" style={{ margin: 0 }}>
                  {snapshot.lastPenaltyPlay?.summary ?? "No penalties in the visible log."}
                </p>
              </div>
            </div>
            <div className="pill-row">
              {snapshot.possessionSummary.map((item) => (
                <span className="chip" key={item.id}>
                  {(item.side === "home" ? snapshot.homeTeam : snapshot.awayTeam)} | {item.playCount} plays | {driveResultLabel(item.result)}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {!compactMode && showInternalReview ? (
          <section className="three-column">
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Turnover tracker</h2>
                <span className="chip">{snapshot.turnoverTracker.length}</span>
              </div>
              <div className="table-like">
                {snapshot.turnoverTracker.slice(0, 6).map((item) => (
                  <div className="timeline-card" key={`turnover-${item.playId}`}>
                    <div className="timeline-top">
                      <strong>{item.summary}</strong>
                      <span className="mono">{item.sequence}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Penalty tracker</h2>
                <span className="chip">{snapshot.penaltyTracker.length}</span>
              </div>
              <div className="table-like">
                {snapshot.penaltyTracker.slice(0, 6).map((item) => (
                  <div className="timeline-card" key={`penalty-${item.playId}`}>
                    <div className="timeline-top">
                      <strong>{item.summary}</strong>
                      <span className="mono">{item.sequence}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <PlayReviewPanel
              play={selectedReviewPlay}
              review={selectedReviewPlay ? reviewByPlayId.get(selectedReviewPlay.playId) ?? null : null}
              onSave={savePlayReview}
              onDelete={deletePlayReview}
            />
          </section>
        ) : null}

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Recent plays</h2>
            <div className="pill-row">
              <button className="mini-button" type="button" onClick={() => setIntent({ kind: "append" })}>
                Fresh play
              </button>
              {canUndoLastPlay && latestPlay ? (
                <button className="mini-button" type="button" onClick={() => void deletePlay(latestPlay.playId)}>
                  Undo last
                </button>
              ) : null}
              {latestPlay ? (
                <button className="mini-button" type="button" onClick={() => setIntent({ kind: "edit", play: latestPlay })}>
                  Edit last
                </button>
              ) : null}
              {latestPlay ? (
                <button className="mini-button" type="button" onClick={() => setIntent({ kind: "insert", beforePlay: latestPlay })}>
                  Insert before last
                </button>
              ) : null}
              <span className="chip">{snapshot.recentPlays.length} visible</span>
            </div>
          </div>
          <div className="table-like">
            {snapshot.recentPlays.length === 0 ? (
              <div className="kicker">No plays logged yet. Start with the next live snap.</div>
            ) : null}
            {snapshot.recentPlays.map((item, index) => (
              <div className="timeline-card" key={item.playId}>
                <div className="timeline-top">
                  <span className="mono">
                    Q{item.quarter} {formatClock(item.clockSeconds)}
                  </span>
                  <span className="mono">{item.sequence}</span>
                </div>
                <strong>{item.summary}</strong>
                <div className="timeline-meta">
                  <span>{item.playType.replaceAll("_", " ")}</span>
                  <span>
                    {item.state.down}&amp;{item.state.distance} {item.state.ballOn.side === "home" ? "own" : "opp"}{" "}
                    {item.state.ballOn.yardLine}
                  </span>
                </div>
                <div className="timeline-actions">
                  {index === 0 ? (
                    <>
                      <button className="mini-button" type="button" onClick={() => setIntent({ kind: "edit", play: item })}>
                        Edit last
                      </button>
                      {canUndoLastPlay ? (
                        <button className="mini-button" type="button" onClick={() => void deletePlay(item.playId)}>
                          Delete last
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  <button className="mini-button" type="button" onClick={() => setIntent({ kind: "insert", beforePlay: item })}>
                    Insert before
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>Scoring summary</h2>
          <div className="table-like">
            {snapshot.scoringSummary.length === 0 ? <div className="kicker">No scoring plays yet.</div> : null}
            {snapshot.scoringSummary.map((item) => (
              <div className="timeline-card" key={`score-${item.playId}`}>
                <div className="timeline-top">
                  <span className="mono">Q{item.quarter}</span>
                  <span className="mono">
                    {item.state.score.away}-{item.state.score.home}
                  </span>
                </div>
                <strong>{item.summary}</strong>
              </div>
            ))}
          </div>
        </section>

        {showDriveSummary ? (
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Drive summary</h2>
              <span className="chip">{snapshot.driveSummaries.length} drives</span>
            </div>
            <div className="table-like">
              {snapshot.driveSummaries.length === 0 ? <div className="kicker">Drives will appear as plays are logged.</div> : null}
              {snapshot.driveSummaries.map((drive) => (
                <div className="timeline-card" key={drive.id}>
                  <div className="timeline-top">
                    <strong>{drive.side === "home" ? snapshot.homeTeam : snapshot.awayTeam}</strong>
                    <span className="mono">Q{drive.quarter}</span>
                  </div>
                  <div className="timeline-meta">
                    <span>
                      {drive.startFieldPosition} to {drive.endFieldPosition}
                    </span>
                    <span className="mono">{driveResultLabel(drive.result)}</span>
                  </div>
                  <div className="pill-row">
                    <span className="chip">{drive.playCount} plays</span>
                    <span className="chip">{drive.yardsGained} yards</span>
                    <span className="chip">{formatClock(drive.timeConsumedSeconds)} used</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {showInternalReview ? (
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Full play log explorer</h2>
              <span className="chip">{snapshot.fullPlayLog.length} tracked plays</span>
            </div>
            <div className="table-like">
              {snapshot.fullPlayLog.map((item) => {
                const review = reviewByPlayId.get(item.playId);
                return (
                  <div className="timeline-card" key={`full-${item.playId}`}>
                    <div className="timeline-top">
                      <strong>{item.summary}</strong>
                      <span className="mono">
                        Q{item.quarter} {formatClock(item.clockSeconds)} | {item.sequence}
                      </span>
                    </div>
                    <div className="pill-row">
                      <span className="chip">
                        {item.state.down}&amp;{item.state.distance} {item.state.ballOn.side === "home" ? "own" : "opp"}{" "}
                        {item.state.ballOn.yardLine}
                      </span>
                      {review?.tags.map((tag) => (
                        <span className="chip" key={`${item.playId}-${tag}`}>
                          {tag}
                        </span>
                      ))}
                      {review?.filmUrl ? <span className="chip">film linked</span> : null}
                    </div>
                    <div className="timeline-actions">
                      <button className="mini-button" type="button" onClick={() => setIntent({ kind: "edit", play: item })}>
                        Edit play
                      </button>
                      <button className="mini-button" type="button" onClick={() => setIntent({ kind: "insert", beforePlay: item })}>
                        Insert before
                      </button>
                      <button className="mini-button" type="button" onClick={() => setSelectedReviewPlayId(item.playId)}>
                        Review / film
                      </button>
                      <button className="mini-button" type="button" onClick={() => toggleSelectedPlay(item.playId)}>
                        {selectedPlayIds.includes(item.playId) ? "Unqueue" : "Queue fix"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
