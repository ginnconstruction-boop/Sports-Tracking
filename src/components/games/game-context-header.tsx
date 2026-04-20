"use client";

import type { GameAdminRecord } from "@/lib/domain/game-admin";

type Props = {
  record: GameAdminRecord;
  compact?: boolean;
};

const stableDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC"
});

function formatDateTime(value?: string | null) {
  return value ? stableDateTimeFormatter.format(new Date(value)) : "TBD";
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export function GameContextHeader({ record, compact = false }: Props) {
  const venueLabel = record.venue
    ? joinParts([
        record.venue.name,
        record.venue.fieldName ? `Field ${record.venue.fieldName}` : null,
        record.venue.city,
        record.venue.state
      ])
    : "Venue TBD";

  const subtitleParts = [
    record.season.label,
    `${record.team.name} ${record.team.level}`,
    `status ${record.game.status.replaceAll("_", " ")}`
  ];

  if (compact) {
    return (
      <section className="section-card pad-md stack-sm context-shell compact-context-shell">
        <div className="entry-header compact-context-header">
          <div className="stack-sm">
            <span className="eyebrow context-eyebrow">Game context</span>
            <h2 style={{ margin: 0 }}>
              {record.sideLabels.away} at {record.sideLabels.home}
            </h2>
            <p className="kicker context-subtitle" style={{ margin: 0 }}>
              {subtitleParts.join(" | ")}
            </p>
          </div>
          <div className="pill-row context-meta-pills compact-context-pills">
            <span className="chip">Kickoff {formatDateTime(record.game.kickoffAt)}</span>
            <span className="chip">{venueLabel}</span>
            <span className="chip">Revision {record.game.currentRevision}</span>
            <span className="chip">
              {record.game.publicLiveEnabled || record.game.publicReportsEnabled ? "Public enabled" : "Private"}
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`section-card ${compact ? "pad-md" : "pad-lg"} stack-md context-shell`}>
      <div className="entry-header">
        <div className="stack-sm">
          <span className="eyebrow context-eyebrow">Game context</span>
          <h2 style={{ margin: 0 }}>
            {record.sideLabels.away} at {record.sideLabels.home}
          </h2>
          <p className="kicker context-subtitle" style={{ margin: 0 }}>
            {subtitleParts.join(" | ")}
          </p>
        </div>
        <div className="pill-row context-meta-pills">
          <span className="chip">Kickoff {formatDateTime(record.game.kickoffAt)}</span>
          <span className="chip">Arrival {formatDateTime(record.game.arrivalAt)}</span>
          <span className="chip">Report {formatDateTime(record.game.reportAt)}</span>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Venue</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {venueLabel}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Weather</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {record.game.weatherConditions || "Not set"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Field conditions</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {record.game.fieldConditions || "Not set"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Revision count</div>
          <div className="metric-value">{record.game.currentRevision}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Roster confirmed</div>
          <div className="metric-value">
            {record.game.rosterConfirmedAt ? formatDateTime(record.game.rosterConfirmedAt) : "Pending"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Public sharing</div>
          <div className="metric-value" style={{ fontSize: "1.05rem" }}>
            {record.game.publicLiveEnabled || record.game.publicReportsEnabled ? "Enabled" : "Private"}
          </div>
        </div>
      </div>

      <div className="three-column context-notes-grid">
        <div className="section-card stack-sm context-note-card" style={{ padding: 18 }}>
          <strong>Opponent prep</strong>
          <p className="kicker" style={{ margin: 0 }}>
            {record.game.opponentPrepNotes || "No opponent prep notes yet."}
          </p>
        </div>
        <div className="section-card stack-sm context-note-card" style={{ padding: 18 }}>
          <strong>Staff notes</strong>
          <p className="kicker" style={{ margin: 0 }}>
            {record.game.staffNotes || "No internal notes yet."}
          </p>
        </div>
        <div className="section-card stack-sm context-note-card" style={{ padding: 18 }}>
          <strong>Logistics</strong>
          <p className="kicker" style={{ margin: 0 }}>
            {record.game.logisticsNotes || "No logistics notes yet."}
          </p>
        </div>
      </div>
    </section>
  );
}
