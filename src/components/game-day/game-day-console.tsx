"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import type { GameDayPlayView, GameDaySnapshot } from "@/lib/domain/game-day";
import type { PlayRecord } from "@/lib/domain/play-log";
import type { GameStateCorrection } from "@/lib/domain/state-corrections";
import type { ScoreCorrection } from "@/lib/domain/score-corrections";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { buildGameDaySnapshot } from "@/lib/game-day/snapshot";
import { parseClockToSeconds } from "@/lib/engine/clock";
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
import { LiveEntryCenter, LiveGameCenter } from "@/components/game-day/live-game-center";

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
  record: GameAdminRecord;
  initialSnapshot: GameDaySnapshot;
  surface?: "overview" | "live";
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

type SituationCorrectionResponse = {
  item: GameStateCorrection;
  live: GameDaySnapshot;
};

type SituationCorrectionsResponse = {
  items: GameStateCorrection[];
};

type ScoreCorrectionsResponse = {
  items: ScoreCorrection[];
};

type ScoreCorrectionResponse = {
  item: ScoreCorrection;
  live: GameDaySnapshot;
};

function latestActiveCorrection(corrections: GameStateCorrection[]) {
  return corrections.find((item) => !item.voidedAt) ?? null;
}

function latestActiveScoreCorrection(corrections: ScoreCorrection[]) {
  return corrections.find((item) => !item.voidedAt) ?? null;
}

type SituationCorrectionSubmission = {
  appliesAfterSequence: string;
  possession: "home" | "away";
  ballOn: {
    side: "home" | "away";
    yardLine: number;
  };
  down: 1 | 2 | 3 | 4;
  distance: number;
  quarter?: 1 | 2 | 3 | 4 | 5;
  reasonCategory: "missed_play" | "live_resync" | "official_correction" | "other";
  reasonNote: string;
};

type VoidSituationCorrectionSubmission = {
  correctionId: string;
  reasonNote: string;
};

type ScoreCorrectionSubmission = {
  appliesAfterSequence: string;
  score: {
    home: number;
    away: number;
  };
  reasonCategory: "missed_play" | "live_resync" | "official_correction" | "other";
  reasonNote: string;
};

type VoidScoreCorrectionSubmission = {
  correctionId: string;
  reasonNote: string;
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

function buildLocalSnapshot(
  base: GameDaySnapshot,
  playLog: PlayRecord[],
  revision: number,
  options: {
    corrections?: GameStateCorrection[];
    scoreCorrections?: ScoreCorrection[];
  } = {}
) {
  const projection = rebuildFromPlayLog(orderedPlayLog(playLog), {
    corrections: options.corrections?.filter((item) => !item.voidedAt),
    scoreCorrections: options.scoreCorrections?.filter((item) => !item.voidedAt)
  });

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
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      throw new Error("Server returned an invalid JSON response.");
    }
  }

  if (!response.ok) {
    const errorPayload =
      typeof body === "object" && body !== null
        ? (body as { error?: { message?: string } | string })
        : null;

    const message =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : typeof errorPayload?.error?.message === "string"
          ? errorPayload.error.message
          : `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  if (body === null) {
    throw new Error("Server returned an empty response.");
  }

  return body as T;
}

export function GameDayConsole({ gameId, record, initialSnapshot, surface = "overview" }: GameDayConsoleProps) {
  const canUndoLastPlay = isFeatureEnabled("undo_last_play");
  const [recordState, setRecordState] = useState(record);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [playLog, setPlayLog] = useState<PlayRecord[]>([]);
  const [session, setSession] = useState<GameSessionRecord | null>(null);
  const [deviceKey, setDeviceKey] = useState<string>("");
  const [statusText, setStatusText] = useState("Connecting to live session...");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>("connect");
  const [intent, setIntent] = useState<PlayEntryIntent>({ kind: "append" });
  const [compactMode, setCompactMode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isOffline, setIsOffline] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [latestSituationCorrection, setLatestSituationCorrection] = useState<GameStateCorrection | null>(null);
  const [situationCorrections, setSituationCorrections] = useState<GameStateCorrection[]>([]);
  const [latestScoreCorrection, setLatestScoreCorrection] = useState<ScoreCorrection | null>(null);
  const [scoreCorrections, setScoreCorrections] = useState<ScoreCorrection[]>([]);
  const [liveStatusPromoted, setLiveStatusPromoted] = useState(false);

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

    const [live, plays, corrections, scoreCorrectionItems] = await Promise.all([
      readJson<LiveResponse>(`/api/v1/games/${gameId}/live`),
      readJson<PlaysResponse>(`/api/v1/games/${gameId}/plays`),
      readJson<SituationCorrectionsResponse>(`/api/v1/games/${gameId}/state-corrections`).catch(() => ({
        items: []
      })),
      readJson<ScoreCorrectionsResponse>(`/api/v1/games/${gameId}/score-corrections`).catch(() => ({
        items: []
      }))
    ]);

    setSession(opened.item);
    setSnapshot(live.item);
    setPlayLog(plays.items);
    setSituationCorrections(corrections.items);
    setLatestSituationCorrection(latestActiveCorrection(corrections.items));
    setScoreCorrections(scoreCorrectionItems.items);
    setLatestScoreCorrection(latestActiveScoreCorrection(scoreCorrectionItems.items));
    setIsOffline(false);
    setErrorText(null);
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
      setErrorText(null);
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
      const [live, plays, corrections, scoreCorrectionItems] = await Promise.all([
        readJson<LiveResponse>(`/api/v1/games/${gameId}/live`),
        readJson<PlaysResponse>(`/api/v1/games/${gameId}/plays`),
        readJson<SituationCorrectionsResponse>(`/api/v1/games/${gameId}/state-corrections`).catch(() => ({
          items: []
        })),
        readJson<ScoreCorrectionsResponse>(`/api/v1/games/${gameId}/score-corrections`).catch(() => ({
          items: []
        }))
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
        setSituationCorrections(corrections.items);
        setLatestSituationCorrection(latestActiveCorrection(corrections.items));
        setScoreCorrections(scoreCorrectionItems.items);
        setLatestScoreCorrection(latestActiveScoreCorrection(scoreCorrectionItems.items));
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
      const optimisticSnapshot = buildLocalSnapshot(snapshot, localPlayLog, localRevision, {
        corrections: situationCorrections,
        scoreCorrections
      });
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
      if (isWriterConflict(message)) {
        try {
          await hydrateFromServer(nextDeviceKey, false);
          setErrorText(null);
          setStatusText("Viewer mode. Another writer currently holds the lease.");
          setBusyAction(null);
          return;
        } catch {
          // Fall through to cached/offline handling below if viewer open also fails.
        }
      }

      captureClientIssue("connect_failed", error);

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
      const message = error instanceof Error ? error.message : "Unable to reacquire writer lease.";

      if (isWriterConflict(message)) {
        setErrorText(null);
        setStatusText("Viewer mode. Another writer currently holds the lease.");
      } else {
        captureClientIssue("lease_reacquire_failed", error);
        setErrorText(message);
      }
    } finally {
      setBusyAction(null);
    }
  }

  const ensureLiveGameInProgress = useEffectEvent(async () => {
    if (surface !== "live" || liveStatusPromoted || !session?.isActiveWriter) {
      return;
    }

    const currentStatus = snapshot.status || recordState.game.status;
    if (currentStatus !== "scheduled" && currentStatus !== "ready") {
      return;
    }

    try {
      const updated = await readJson<{ item: { status: string } }>(`/api/v1/games/${gameId}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: recordState.season.id,
          opponentId: recordState.opponent.id,
          venueId: recordState.venue?.id ?? undefined,
          kickoffAt: recordState.game.kickoffAt ?? undefined,
          arrivalAt: recordState.game.arrivalAt ?? undefined,
          reportAt: recordState.game.reportAt ?? undefined,
          homeAway: recordState.game.homeAway,
          status: "in_progress",
          weatherConditions: recordState.game.weatherConditions ?? undefined,
          fieldConditions: recordState.game.fieldConditions ?? undefined,
          staffNotes: recordState.game.staffNotes ?? undefined,
          opponentPrepNotes: recordState.game.opponentPrepNotes ?? undefined,
          logisticsNotes: recordState.game.logisticsNotes ?? undefined,
          publicLiveEnabled: recordState.game.publicLiveEnabled,
          publicReportsEnabled: recordState.game.publicReportsEnabled
        })
      });

      setRecordState((current) => ({
        ...current,
        game: {
          ...current.game,
          status: updated.item.status
        }
      }));
      setSnapshot((current) => ({
        ...current,
        status: updated.item.status
      }));
      setLiveStatusPromoted(true);
    } catch (error) {
      captureClientIssue("auto_promote_live_status_failed", error, {
        currentStatus
      });
    }
  });

  useEffect(() => {
    if (surface === "live" && session?.isActiveWriter && !isOffline) {
      void ensureLiveGameInProgress();
    }
  }, [ensureLiveGameInProgress, isOffline, session?.isActiveWriter, surface]);

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
        const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + nextMutations.length, {
          corrections: situationCorrections,
          scoreCorrections
        });
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
      const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + 1, {
        corrections: situationCorrections,
        scoreCorrections
      });
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
        const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + Math.max(0, nextMutations.length), {
          corrections: situationCorrections,
          scoreCorrections
        });
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
      const nextSnapshot = buildLocalSnapshot(snapshot, nextPlayLog, snapshot.revision + 1, {
        corrections: situationCorrections,
        scoreCorrections
      });
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

  async function recoverSituation(correction: SituationCorrectionSubmission) {
    setErrorText(null);
    setBusyAction("recover");
    setStatusText("Applying situation correction...");

    try {
      const response = await readJson<SituationCorrectionResponse>(`/api/v1/games/${gameId}/state-corrections`, {
        method: "POST",
        body: JSON.stringify(correction)
      });

      const nextSession = session
        ? {
            ...session,
            localRevision: response.live.revision,
            remoteRevision: Math.max(session.remoteRevision, response.live.revision)
          }
        : session;

      setSnapshot(response.live);
      if (nextSession) {
        setSession(nextSession);
      }
      const nextCorrections = [response.item, ...situationCorrections.filter((item) => item.id !== response.item.id)];
      setLatestSituationCorrection(response.item);
      setSituationCorrections(nextCorrections);
      setStatusText("Situation corrected.");
      await persistLocalState(response.live, playLog, nextSession);
    } catch (error) {
      captureClientIssue("recover_situation_failed", error, {
        appliesAfterSequence: correction.appliesAfterSequence
      });
      setErrorText(error instanceof Error ? error.message : "Unable to recover situation.");
      setStatusText("Situation correction failed.");
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function voidSituationCorrectionAction(correction: VoidSituationCorrectionSubmission) {
    setErrorText(null);
    setBusyAction("void-correction");
    setStatusText("Voiding situation correction...");

    try {
      const response = await readJson<SituationCorrectionResponse>(
        `/api/v1/games/${gameId}/state-corrections/${correction.correctionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            reasonNote: correction.reasonNote
          })
        }
      );

      const nextCorrections = situationCorrections.map((item) =>
        item.id === response.item.id ? response.item : item
      );
      const nextSession = session
        ? {
            ...session,
            localRevision: response.live.revision,
            remoteRevision: Math.max(session.remoteRevision, response.live.revision)
          }
        : session;

      setSnapshot(response.live);
      setSituationCorrections(nextCorrections);
      setLatestSituationCorrection(latestActiveCorrection(nextCorrections));
      if (nextSession) {
        setSession(nextSession);
      }
      setStatusText("Situation correction voided.");
      await persistLocalState(response.live, playLog, nextSession);
    } catch (error) {
      captureClientIssue("void_situation_correction_failed", error, {
        correctionId: correction.correctionId
      });
      setErrorText(error instanceof Error ? error.message : "Unable to void situation correction.");
      setStatusText("Unable to void situation correction.");
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function overrideScore(correction: ScoreCorrectionSubmission) {
    setErrorText(null);
    setBusyAction("score-correction");
    setStatusText("Applying score override...");

    try {
      const response = await readJson<ScoreCorrectionResponse>(`/api/v1/games/${gameId}/score-corrections`, {
        method: "POST",
        body: JSON.stringify(correction)
      });

      const nextSession = session
        ? {
            ...session,
            localRevision: response.live.revision,
            remoteRevision: Math.max(session.remoteRevision, response.live.revision)
          }
        : session;

      const nextCorrections = [response.item, ...scoreCorrections.filter((item) => item.id !== response.item.id)];
      setSnapshot(response.live);
      setScoreCorrections(nextCorrections);
      setLatestScoreCorrection(latestActiveScoreCorrection(nextCorrections));
      if (nextSession) {
        setSession(nextSession);
      }
      setStatusText("Score corrected.");
      await persistLocalState(response.live, playLog, nextSession);
    } catch (error) {
      captureClientIssue("score_correction_failed", error, {
        appliesAfterSequence: correction.appliesAfterSequence
      });
      setErrorText(error instanceof Error ? error.message : "Unable to override score.");
      setStatusText("Score correction failed.");
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function voidScoreCorrectionAction(correction: VoidScoreCorrectionSubmission) {
    setErrorText(null);
    setBusyAction("void-score-correction");
    setStatusText("Clearing score override...");

    try {
      const response = await readJson<ScoreCorrectionResponse>(
        `/api/v1/games/${gameId}/score-corrections/${correction.correctionId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            reasonNote: correction.reasonNote
          })
        }
      );

      const nextCorrections = scoreCorrections.map((item) =>
        item.id === response.item.id ? response.item : item
      );
      const nextSession = session
        ? {
            ...session,
            localRevision: response.live.revision,
            remoteRevision: Math.max(session.remoteRevision, response.live.revision)
          }
        : session;

      setSnapshot(response.live);
      setScoreCorrections(nextCorrections);
      setLatestScoreCorrection(latestActiveScoreCorrection(nextCorrections));
      if (nextSession) {
        setSession(nextSession);
      }
      setStatusText("Score override cleared.");
      await persistLocalState(response.live, playLog, nextSession);
    } catch (error) {
      captureClientIssue("void_score_correction_failed", error, {
        correctionId: correction.correctionId
      });
      setErrorText(error instanceof Error ? error.message : "Unable to clear score override.");
      setStatusText("Unable to clear score override.");
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  const latestPlay = snapshot.recentPlays[0];
  const canWrite = Boolean(session?.isActiveWriter);
    const playEntryPanel = (
      <PlayEntryPanel
        snapshot={snapshot}
        intent={intent}
        disabled={!canWrite}
        viewerMode={!canWrite}
        submitting={isPending}
        compactMode={compactMode}
        storageKey={`game-day-play-entry-collapsed:${gameId}`}
        surface={surface}
        onSubmit={submitPlay}
        onCancelIntent={() => setIntent({ kind: "append" })}
      />
    );

  const sharedProps = {
    gameId,
    record: recordState,
    snapshot,
    session,
    statusText,
    errorText,
    busyAction,
    pendingMutations,
    isOffline,
    compactMode,
    hasDeviceKey: Boolean(deviceKey),
    canUndoLastPlay,
    latestSituationCorrection,
    situationCorrections,
    latestScoreCorrection,
    scoreCorrections,
    playEntryPanel,
    onToggleCompactMode: () => setCompactMode((current) => !current),
    onFreshPlay: () => setIntent({ kind: "append" }),
    onUndoLast: () => {
      if (latestPlay) {
        void deletePlay(latestPlay.playId);
      }
    },
    onEditPlay: (play: GameDayPlayView) => setIntent({ kind: "edit", play }),
    onInsertBefore: (play: GameDayPlayView) => setIntent({ kind: "insert", beforePlay: play }),
    onRefresh: () => void refreshLiveSnapshot(),
    onRetrySync: () => {
      if (deviceKey) {
        void flushOutbox(deviceKey);
      }
    },
    onReleaseWriter: () => void releaseWriterLease(),
    onReacquireWriter: () => void reacquireWriterLease(),
    onRecoverSituation: recoverSituation,
    onVoidSituationCorrection: voidSituationCorrectionAction,
    onOverrideScore: overrideScore,
    onVoidScoreCorrection: voidScoreCorrectionAction
  };

  return surface === "live" ? <LiveEntryCenter {...sharedProps} /> : <LiveGameCenter {...sharedProps} />;
}
