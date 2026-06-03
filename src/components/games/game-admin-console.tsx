"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { gameStatusValues } from "@/lib/contracts/admin";
import { hasCapability } from "@/lib/auth/roles";
import { isFeatureEnabled } from "@/lib/features/runtime";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import { PilotSettingsPanel } from "@/components/games/pilot-settings-panel";

type Venue = {
  id: string;
  organizationId: string;
  name: string;
  fieldName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

type Opponent = {
  id: string;
  organizationId: string;
  schoolName: string;
  mascot?: string | null;
  shortCode?: string | null;
  archivedAt?: string | null;
};

type Props = {
  record: GameAdminRecord;
  opponents: Opponent[];
  venues: Venue[];
  launchReadiness: {
    exportCount: number;
    completedExportCount: number;
    exportFormats: string[];
  };
};

type FormState = {
  opponentId: string;
  venueId: string;
  kickoffAt: string;
  arrivalAt: string;
  reportAt: string;
  homeAway: "home" | "away";
  status: (typeof gameStatusValues)[number];
  weatherConditions: string;
  fieldConditions: string;
  staffNotes: string;
  opponentPrepNotes: string;
  logisticsNotes: string;
  publicLiveEnabled: boolean;
  publicReportsEnabled: boolean;
};

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
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
    throw body;
  }
  return body as T;
}

function messageFromError(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "error" in error && typeof error.error === "string") {
    return error.error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function buildOperatorPath(
  record: GameAdminRecord,
  launchReadiness: Props["launchReadiness"]
) {
  const gamePrepared = ["ready", "in_progress", "final", "archived"].includes(record.game.status);
  const hasLiveData = record.game.currentRevision > 0;
  const hasCoachPacket = launchReadiness.completedExportCount > 0;
  const isClosedOut = ["final", "archived"].includes(record.game.status);

  return [
    {
      label: "Roster confirmed",
      complete: Boolean(record.game.rosterConfirmedAt),
      detail: record.game.rosterConfirmedAt
        ? `Confirmed ${new Date(record.game.rosterConfirmedAt).toLocaleString()}.`
        : "Confirm the active sideline roster before kickoff so jersey mapping stays clean."
    },
    {
      label: "Game admin ready",
      complete: gamePrepared,
      detail: gamePrepared
        ? `Status is ${record.game.status.replaceAll("_", " ")} and the game can move into live use.`
        : "Set the game to ready after kickoff, venue, and travel details are verified."
    },
    {
      label: "Live capture started",
      complete: hasLiveData,
      detail: hasLiveData
        ? `${record.game.currentRevision} play-log revisions are already on the record.`
        : "Open Live Entry on the writer device and start capturing the canonical play log."
    },
    {
      label: "Coach packet exported",
      complete: hasCoachPacket,
      detail: hasCoachPacket
        ? `${launchReadiness.completedExportCount} completed export job${launchReadiness.completedExportCount === 1 ? "" : "s"} (${launchReadiness.exportFormats.join(" / ")}).`
        : "Open reports, verify the launch set, and run PDF/XLSX exports for coaches."
    },
    {
      label: "Final status locked",
      complete: isClosedOut,
      detail: isClosedOut
        ? `Game status is ${record.game.status.replaceAll("_", " ")}.`
        : "After staff approves corrections and exports, mark the game final."
    }
  ];
}

function recommendedNextAction(
  record: GameAdminRecord,
  launchReadiness: Props["launchReadiness"]
) {
  if (!record.game.rosterConfirmedAt) {
    return "Confirm the game roster before the writer takes the device live.";
  }

  if (!["ready", "in_progress", "final", "archived"].includes(record.game.status)) {
    return "Set the game to ready once the staff details are locked in.";
  }

  if (record.game.currentRevision === 0) {
    return "Open Live Entry and start the play log from the primary writer device.";
  }

  if (launchReadiness.completedExportCount === 0) {
    return "Open reports, review the coach-ready packet, and run PDF/XLSX exports.";
  }

  if (!["final", "archived"].includes(record.game.status)) {
    return "Mark the game final after the staff signs off on the closeout packet.";
  }

  return "Operator flow is closed out. Archive later only if your staff wants the game moved out of the active list.";
}

export function GameAdminConsole({ record, opponents, venues, launchReadiness }: Props) {
  const showPublicTrackerControls = isFeatureEnabled("live_public_tracker");
  const [adminRecord, setAdminRecord] = useState(record);
  const [statusText, setStatusText] = useState("Game admin ready.");
  const [isBusy, setIsBusy] = useState(false);
  const [archiveUndoTargetStatus, setArchiveUndoTargetStatus] = useState<FormState["status"] | null>(null);
  const [archiveUndoExpiresAt, setArchiveUndoExpiresAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showReopenPanel, setShowReopenPanel] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const canManageGames = hasCapability(adminRecord.currentUserRole, "manage_games");
  const canWriteLivePlays = hasCapability(adminRecord.currentUserRole, "write_live_plays");
  const [form, setForm] = useState<FormState>({
    opponentId: record.opponent.id,
    venueId: record.venue?.id ?? "",
    kickoffAt: toDateTimeLocalValue(record.game.kickoffAt),
    arrivalAt: toDateTimeLocalValue(record.game.arrivalAt),
    reportAt: toDateTimeLocalValue(record.game.reportAt),
    homeAway: record.game.homeAway,
    status: record.game.status as FormState["status"],
    weatherConditions: record.game.weatherConditions ?? "",
    fieldConditions: record.game.fieldConditions ?? "",
    staffNotes: record.game.staffNotes ?? "",
    opponentPrepNotes: record.game.opponentPrepNotes ?? "",
    logisticsNotes: record.game.logisticsNotes ?? "",
    publicLiveEnabled: record.game.publicLiveEnabled,
    publicReportsEnabled: record.game.publicReportsEnabled
  });
  const publicBaseUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/public`;

  const currentVenueLabel = useMemo(() => {
    if (!adminRecord.venue) return "Venue TBD";
    return [
      adminRecord.venue.name,
      adminRecord.venue.fieldName ? `Field ${adminRecord.venue.fieldName}` : null,
      adminRecord.venue.city,
      adminRecord.venue.state
    ]
      .filter(Boolean)
      .join(", ");
  }, [adminRecord.venue]);
  const operatorPath = useMemo(
    () => buildOperatorPath(adminRecord, launchReadiness),
    [adminRecord, launchReadiness]
  );
  const nextAction = useMemo(
    () => recommendedNextAction(adminRecord, launchReadiness),
    [adminRecord, launchReadiness]
  );
  const undoSecondsRemaining = archiveUndoExpiresAt ? Math.max(0, Math.ceil((archiveUndoExpiresAt - nowMs) / 1000)) : 0;

  useEffect(() => {
    if (!archiveUndoExpiresAt) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [archiveUndoExpiresAt]);

  useEffect(() => {
    if (!archiveUndoExpiresAt || nowMs <= archiveUndoExpiresAt) {
      return;
    }
    setArchiveUndoTargetStatus(null);
    setArchiveUndoExpiresAt(null);
  }, [archiveUndoExpiresAt, nowMs]);

  async function saveGame() {
    if (!canManageGames) {
      setStatusText("This role can view game admin details, but cannot save changes.");
      return;
    }

    setIsBusy(true);
    setStatusText("Saving game details...");

    try {
      const response = await readJson<{ item: GameAdminRecord["game"] }>(`/api/v1/games/${adminRecord.game.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: adminRecord.season.id,
          opponentId: form.opponentId,
          venueId: form.venueId || undefined,
          kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : undefined,
          arrivalAt: form.arrivalAt ? new Date(form.arrivalAt).toISOString() : undefined,
          reportAt: form.reportAt ? new Date(form.reportAt).toISOString() : undefined,
          homeAway: form.homeAway,
          status: form.status,
          weatherConditions: form.weatherConditions || undefined,
          fieldConditions: form.fieldConditions || undefined,
          staffNotes: form.staffNotes || undefined,
          opponentPrepNotes: form.opponentPrepNotes || undefined,
          logisticsNotes: form.logisticsNotes || undefined,
          publicLiveEnabled: form.publicLiveEnabled,
          publicReportsEnabled: form.publicReportsEnabled
        })
      });

      const opponent = opponents.find((item) => item.id === form.opponentId) ?? adminRecord.opponent;
      const venue = venues.find((item) => item.id === form.venueId) ?? null;

      setAdminRecord((current) => ({
        ...current,
        game: {
          ...current.game,
          ...response.item,
          weatherConditions: form.weatherConditions || null,
          fieldConditions: form.fieldConditions || null,
          staffNotes: form.staffNotes || null,
          opponentPrepNotes: form.opponentPrepNotes || null,
          logisticsNotes: form.logisticsNotes || null,
          publicLiveEnabled: form.publicLiveEnabled,
          publicReportsEnabled: form.publicReportsEnabled
        },
        opponent: {
          id: opponent.id,
          schoolName: opponent.schoolName,
          mascot: opponent.mascot,
          shortCode: opponent.shortCode
        },
        venue: venue
          ? {
              id: venue.id,
              name: venue.name,
              fieldName: venue.fieldName,
              addressLine1: venue.addressLine1,
              addressLine2: venue.addressLine2,
              city: venue.city,
              state: venue.state,
              postalCode: venue.postalCode
            }
          : null
      }));
      setStatusText("Game details saved.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to save game details."));
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmRoster() {
    if (!canManageGames) {
      setStatusText("This role can view game admin details, but cannot confirm roster changes.");
      return;
    }

    setIsBusy(true);
    setStatusText("Confirming game roster...");

    try {
      const response = await readJson<{ item: { game: { rosterConfirmedAt?: string | null }; confirmedCount: number } }>(
        `/api/v1/games/${adminRecord.game.id}/confirm-roster`,
        {
          method: "POST"
        }
      );

      setAdminRecord((current) => ({
        ...current,
        game: {
          ...current.game,
          rosterConfirmedAt: response.item.game.rosterConfirmedAt ?? new Date().toISOString()
        }
      }));
      setStatusText(`Game roster confirmed with ${response.item.confirmedCount} players.`);
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to confirm game roster."));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyPublicLink(kind: "games" | "reports") {
    const url = `${publicBaseUrl}/${kind}/${adminRecord.game.publicShareToken}`;
    await navigator.clipboard.writeText(url);
    setStatusText(`Copied public ${kind === "games" ? "live tracker" : "report"} link.`);
  }

  async function saveGameWithStatus(nextStatus: FormState["status"]) {
    if (!canManageGames) {
      setStatusText("Only game managers can archive or restore status.");
      return;
    }

    setIsBusy(true);
    setStatusText(nextStatus === "archived" ? "Archiving game..." : "Restoring game status...");

    try {
      const response = await readJson<{ item: GameAdminRecord["game"] }>(`/api/v1/games/${adminRecord.game.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: adminRecord.season.id,
          opponentId: form.opponentId,
          venueId: form.venueId || undefined,
          kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : undefined,
          arrivalAt: form.arrivalAt ? new Date(form.arrivalAt).toISOString() : undefined,
          reportAt: form.reportAt ? new Date(form.reportAt).toISOString() : undefined,
          homeAway: form.homeAway,
          status: nextStatus,
          weatherConditions: form.weatherConditions || undefined,
          fieldConditions: form.fieldConditions || undefined,
          staffNotes: form.staffNotes || undefined,
          opponentPrepNotes: form.opponentPrepNotes || undefined,
          logisticsNotes: form.logisticsNotes || undefined,
          publicLiveEnabled: form.publicLiveEnabled,
          publicReportsEnabled: form.publicReportsEnabled
        })
      });

      setAdminRecord((current) => ({
        ...current,
        game: {
          ...current.game,
          status: response.item.status
        }
      }));
      setForm((current) => ({
        ...current,
        status: response.item.status as FormState["status"]
      }));
      setStatusText(nextStatus === "archived" ? "Game archived." : "Game status restored.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to update game status."));
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function archiveNow() {
    const priorStatus = form.status;
    await saveGameWithStatus("archived");
    setArchiveUndoTargetStatus(priorStatus);
    setArchiveUndoExpiresAt(Date.now() + 120_000);
  }

  async function undoArchive() {
    if (!archiveUndoTargetStatus || !archiveUndoExpiresAt || Date.now() > archiveUndoExpiresAt) {
      setStatusText("Undo window expired.");
      return;
    }

    await saveGameWithStatus(archiveUndoTargetStatus);
    setArchiveUndoTargetStatus(null);
    setArchiveUndoExpiresAt(null);
  }

  async function finalizeAndLock() {
    await saveGameWithStatus("final");
  }

  async function reopenFinalGame() {
    if (!canManageGames) {
      setStatusText("Only game managers can reopen final or archived games.");
      return;
    }

    if (reopenReason.trim().length < 5) {
      setStatusText("Reopen reason is required (at least 5 characters).");
      return;
    }

    setIsBusy(true);
    setStatusText("Reopening game...");

    const reopenNote = `[Reopened ${new Date().toLocaleString()}] ${reopenReason.trim()}`;
    const mergedStaffNotes = [form.staffNotes.trim(), reopenNote].filter(Boolean).join("\n");

    try {
      const response = await readJson<{ item: GameAdminRecord["game"] }>(`/api/v1/games/${adminRecord.game.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          seasonId: adminRecord.season.id,
          opponentId: form.opponentId,
          venueId: form.venueId || undefined,
          kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : undefined,
          arrivalAt: form.arrivalAt ? new Date(form.arrivalAt).toISOString() : undefined,
          reportAt: form.reportAt ? new Date(form.reportAt).toISOString() : undefined,
          homeAway: form.homeAway,
          status: "ready",
          weatherConditions: form.weatherConditions || undefined,
          fieldConditions: form.fieldConditions || undefined,
          staffNotes: mergedStaffNotes || undefined,
          opponentPrepNotes: form.opponentPrepNotes || undefined,
          logisticsNotes: form.logisticsNotes || undefined,
          publicLiveEnabled: form.publicLiveEnabled,
          publicReportsEnabled: form.publicReportsEnabled
        })
      });

      setAdminRecord((current) => ({
        ...current,
        game: {
          ...current.game,
          status: response.item.status,
          staffNotes: mergedStaffNotes || null
        }
      }));
      setForm((current) => ({
        ...current,
        status: "ready",
        staffNotes: mergedStaffNotes
      }));
      setReopenReason("");
      setShowReopenPanel(false);
      setStatusText("Game reopened and set to ready.");
    } catch (error) {
      setStatusText(messageFromError(error, "Unable to reopen game."));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
              Game admin
            </span>
            <h2 style={{ margin: "10px 0 0" }}>{adminRecord.team.name} vs {adminRecord.opponent.schoolName}</h2>
            <p className="kicker">
              Manage schedule details, game status, and operational links from one place before or after live entry.
            </p>
          </div>
          <span className="chip">{statusText}</span>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Season</div>
            <div className="metric-value">{adminRecord.season.label}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Status</div>
            <div className="metric-value">{adminRecord.game.status.replaceAll("_", " ")}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Kickoff</div>
            <div className="metric-value">{adminRecord.game.kickoffAt ? new Date(adminRecord.game.kickoffAt).toLocaleString() : "TBD"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Logged revisions</div>
            <div className="metric-value">{adminRecord.game.currentRevision}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Roster confirmed</div>
            <div className="metric-value">
              {adminRecord.game.rosterConfirmedAt ? new Date(adminRecord.game.rosterConfirmedAt).toLocaleString() : "Pending"}
            </div>
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Edit game details</h2>
            <div className="timeline-actions">
              <Link className="mini-button" href={`/games/${adminRecord.game.id}/gameday`}>Open Game Day</Link>
              {canWriteLivePlays ? <Link className="mini-button" href={`/games/${adminRecord.game.id}/live`}>Open live entry</Link> : null}
              <Link className="mini-button" href={`/games/${adminRecord.game.id}/reports`}>Open reports</Link>
              <Link className="mini-button" href={`/games/${adminRecord.game.id}/operator-guide` as Route}>Operator guide</Link>
            </div>
          </div>

          {!canManageGames ? (
            <div className="kicker">
              Your role is view-only on game management actions. Coaches/admin can save, confirm roster, and archive.
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span>Opponent</span>
              <select value={form.opponentId} onChange={(event) => setForm((current) => ({ ...current, opponentId: event.target.value }))}>
                {opponents.filter((item) => !item.archivedAt || item.id === adminRecord.opponent.id).map((opponent) => (
                  <option key={opponent.id} value={opponent.id}>
                    {opponent.schoolName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Venue</span>
              <select value={form.venueId} onChange={(event) => setForm((current) => ({ ...current, venueId: event.target.value }))}>
                <option value="">Venue TBD</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Kickoff</span>
              <input type="datetime-local" value={form.kickoffAt} onChange={(event) => setForm((current) => ({ ...current, kickoffAt: event.target.value }))} />
            </label>
            <label className="field">
              <span>Arrival time</span>
              <input type="datetime-local" value={form.arrivalAt} onChange={(event) => setForm((current) => ({ ...current, arrivalAt: event.target.value }))} />
            </label>
            <label className="field">
              <span>Report time</span>
              <input type="datetime-local" value={form.reportAt} onChange={(event) => setForm((current) => ({ ...current, reportAt: event.target.value }))} />
            </label>
            <label className="field">
              <span>Primary team side</span>
              <select value={form.homeAway} onChange={(event) => setForm((current) => ({ ...current, homeAway: event.target.value as FormState["homeAway"] }))}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))}>
                {gameStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Weather</span>
              <input value={form.weatherConditions} onChange={(event) => setForm((current) => ({ ...current, weatherConditions: event.target.value }))} />
            </label>
            <label className="field">
              <span>Field conditions</span>
              <input value={form.fieldConditions} onChange={(event) => setForm((current) => ({ ...current, fieldConditions: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>Opponent prep notes</span>
              <textarea value={form.opponentPrepNotes} rows={4} onChange={(event) => setForm((current) => ({ ...current, opponentPrepNotes: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>Staff notes</span>
              <textarea value={form.staffNotes} rows={4} onChange={(event) => setForm((current) => ({ ...current, staffNotes: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>Logistics notes</span>
              <textarea value={form.logisticsNotes} rows={4} onChange={(event) => setForm((current) => ({ ...current, logisticsNotes: event.target.value }))} />
            </label>
            {showPublicTrackerControls ? (
            <label className="checkbox-field">
              <input
                type="checkbox"
                disabled={!canManageGames}
                checked={form.publicLiveEnabled}
                onChange={(event) => setForm((current) => ({ ...current, publicLiveEnabled: event.target.checked }))}
              />
              Enable public live tracker
            </label>
            ) : null}
            {showPublicTrackerControls ? (
            <label className="checkbox-field">
              <input
                type="checkbox"
                disabled={!canManageGames}
                checked={form.publicReportsEnabled}
                onChange={(event) => setForm((current) => ({ ...current, publicReportsEnabled: event.target.checked }))}
              />
              Enable public reports
            </label>
            ) : null}
          </div>

          <div className="timeline-actions">
            <button className="button-primary" type="button" disabled={isBusy || !canManageGames} onClick={() => void saveGame()}>
              Save game details
            </button>
            <button className="button-secondary-light" type="button" disabled={isBusy || !canManageGames} onClick={() => void confirmRoster()}>
              Confirm game roster
            </button>
            <button
              className="button-secondary-light"
              type="button"
              disabled={isBusy || !canManageGames || form.status === "final"}
              onClick={() => void finalizeAndLock()}
            >
              Mark final + lock
            </button>
            <button
              className="button-secondary-light"
              type="button"
              disabled={isBusy || !canManageGames || form.status === "archived"}
              onClick={() => void archiveNow()}
            >
              Archive game
            </button>
            <button
              className="mini-button"
              type="button"
              disabled={
                isBusy ||
                !canManageGames ||
                form.status !== "archived" ||
                !archiveUndoTargetStatus ||
                !archiveUndoExpiresAt ||
                nowMs > archiveUndoExpiresAt
              }
              onClick={() => void undoArchive()}
            >
              Undo archive
            </button>
            <button
              className="mini-button"
              type="button"
              disabled={isBusy || !canManageGames || (form.status !== "final" && form.status !== "archived")}
              onClick={() => setShowReopenPanel((current) => !current)}
            >
              {showReopenPanel ? "Cancel reopen" : "Reopen final game"}
            </button>
          </div>
          {showReopenPanel ? (
            <div className="stack-sm">
              <label className="field">
                <span>Reopen reason (required)</span>
                <textarea rows={3} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} />
              </label>
              <div className="timeline-actions">
                <button className="mini-button" type="button" onClick={() => setShowReopenPanel(false)}>
                  Keep closed
                </button>
                <button className="button-primary button-primary-small" type="button" disabled={isBusy || !canManageGames} onClick={() => void reopenFinalGame()}>
                  Confirm reopen
                </button>
              </div>
            </div>
          ) : null}
          {archiveUndoTargetStatus && form.status === "archived" && undoSecondsRemaining > 0 ? (
            <div className="kicker">Undo window: {undoSecondsRemaining}s remaining.</div>
          ) : null}
        </div>

        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Operational view</h2>
            <span className="chip">{adminRecord.team.level}</span>
          </div>
          <div className="kicker">Recommended next action: {nextAction}</div>
          <div className="table-like">
            {operatorPath.map((item) => (
              <div className="timeline-card" key={item.label}>
                <div className="timeline-top">
                  <strong>{item.label}</strong>
                  <span className="chip">{item.complete ? "complete" : "needs action"}</span>
                </div>
                <div className="kicker">{item.detail}</div>
              </div>
            ))}
          </div>
          <div className="timeline-actions">
            <Link className="mini-button" href={`/games/${adminRecord.game.id}/operator-guide` as Route}>Open operator guide</Link>
            {canWriteLivePlays ? <Link className="mini-button" href={`/games/${adminRecord.game.id}/live`}>Open live entry</Link> : null}
            <Link className="mini-button" href={`/games/${adminRecord.game.id}/reports`}>Open reports</Link>
          </div>
          <h3 style={{ margin: 0 }}>Operational snapshot</h3>
          <div className="table-like">
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Home side</strong>
                <span className="mono">{adminRecord.sideLabels.home}</span>
              </div>
            </div>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Away side</strong>
                <span className="mono">{adminRecord.sideLabels.away}</span>
              </div>
            </div>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Venue</strong>
                <span className="mono">{currentVenueLabel}</span>
              </div>
            </div>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Weather / field</strong>
                <span className="mono">
                  {[adminRecord.game.weatherConditions, adminRecord.game.fieldConditions].filter(Boolean).join(" · ") || "Not set"}
                </span>
              </div>
            </div>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Last rebuild</strong>
                <span className="mono">
                  {adminRecord.game.lastRebuiltAt ? new Date(adminRecord.game.lastRebuiltAt).toLocaleString() : "Not rebuilt yet"}
                </span>
              </div>
            </div>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Game roster</strong>
                <span className="mono">
                  {adminRecord.game.rosterConfirmedAt
                    ? `Confirmed ${new Date(adminRecord.game.rosterConfirmedAt).toLocaleString()}`
                    : "Needs confirmation"}
                </span>
              </div>
            </div>
            {showPublicTrackerControls ? (
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Public sharing</strong>
                <span className="mono">
                  {adminRecord.game.publicLiveEnabled || adminRecord.game.publicReportsEnabled ? "enabled" : "private"}
                </span>
              </div>
              <div className="pill-row">
                <span className="chip">Live {adminRecord.game.publicLiveEnabled ? "on" : "off"}</span>
                <span className="chip">Reports {adminRecord.game.publicReportsEnabled ? "on" : "off"}</span>
              </div>
              <div className="timeline-actions">
                <button
                  className="mini-button"
                  disabled={!adminRecord.game.publicLiveEnabled}
                  type="button"
                  onClick={() => void copyPublicLink("games")}
                >
                  Copy live link
                </button>
                <button
                  className="mini-button"
                  disabled={!adminRecord.game.publicReportsEnabled}
                  type="button"
                  onClick={() => void copyPublicLink("reports")}
                >
                  Copy report link
                </button>
              </div>
            </div>
            ) : null}
          </div>
        </div>
      </section>

      <PilotSettingsPanel
        statusText={statusText}
        onStatusChange={(message) => setStatusText(message)}
        scope={{
          organizationId: adminRecord.organizationId,
          teamId: adminRecord.team.id
        }}
        canResetTeamSettings={canManageGames}
      />
    </section>
  );
}
