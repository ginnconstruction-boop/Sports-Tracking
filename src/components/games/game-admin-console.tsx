"use client";

import { useMemo, useState } from "react";
import { gameStatusValues } from "@/lib/contracts/admin";
import { isFeatureEnabled } from "@/lib/features/runtime";
import type { GameAdminRecord } from "@/lib/domain/game-admin";

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

export function GameAdminConsole({ record, opponents, venues }: Props) {
  const showPublicTrackerControls = isFeatureEnabled("live_public_tracker");
  const [adminRecord, setAdminRecord] = useState(record);
  const [statusText, setStatusText] = useState("Game admin ready.");
  const [isBusy, setIsBusy] = useState(false);
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

  async function saveGame() {
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
              <a className="mini-button" href={`/games/${adminRecord.game.id}/gameday`}>Open Game Day</a>
              <a className="mini-button" href={`/games/${adminRecord.game.id}/reports`}>Open reports</a>
            </div>
          </div>

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
                checked={form.publicReportsEnabled}
                onChange={(event) => setForm((current) => ({ ...current, publicReportsEnabled: event.target.checked }))}
              />
              Enable public reports
            </label>
            ) : null}
          </div>

          <div className="timeline-actions">
            <button className="button-primary" type="button" disabled={isBusy} onClick={() => void saveGame()}>
              Save game details
            </button>
            <button className="button-secondary-light" type="button" disabled={isBusy} onClick={() => void confirmRoster()}>
              Confirm game roster
            </button>
          </div>
        </div>

        <div className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Operational view</h2>
            <span className="chip">{adminRecord.team.level}</span>
          </div>
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
    </section>
  );
}
