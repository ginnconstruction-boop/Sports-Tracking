"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import type { GameDayPlayView, GameDaySnapshot } from "@/lib/domain/game-day";
import type { DerivedGameState } from "@/lib/domain/game-state";
import type { GameStateCorrection } from "@/lib/domain/state-corrections";
import { brandingCssVariables } from "@/lib/domain/organization-settings";

type GameSessionSummary = {
  status: "local_only" | "syncing" | "synced" | "conflict";
  isActiveWriter: boolean;
  writerLeaseExpiresAt?: string | null;
};

type Props = {
  gameId: string;
  record: GameAdminRecord;
  snapshot: GameDaySnapshot;
  session: GameSessionSummary | null;
  statusText: string;
  errorText: string | null;
  busyAction: string | null;
  pendingMutations: number;
  isOffline: boolean;
  compactMode: boolean;
  hasDeviceKey: boolean;
  canUndoLastPlay: boolean;
  latestSituationCorrection: GameStateCorrection | null;
  situationCorrections: GameStateCorrection[];
  playEntryPanel: ReactNode;
  onToggleCompactMode: () => void;
  onFreshPlay: () => void;
  onUndoLast: () => void;
  onEditPlay: (play: GameDayPlayView) => void;
  onInsertBefore: (play: GameDayPlayView) => void;
  onRefresh: () => void;
  onRetrySync: () => void;
  onReleaseWriter: () => void;
  onReacquireWriter: () => void;
  onRecoverSituation: (correction: SituationCorrectionSubmission) => Promise<void>;
  onVoidSituationCorrection: (correction: VoidSituationCorrectionSubmission) => Promise<void>;
};

type TeamSide = "home" | "away";
type RelativeFieldSide = "own" | "opp";
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
const stableHeaderDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});
const correctionTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});
const liveLeaseFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit"
});

function formatKickoffDate(value?: string | null) {
  return value ? stableHeaderDateFormatter.format(new Date(value)) : "Date TBD";
}

function formatQuarterLabel(quarter: number) {
  return quarter === 5 ? "OT" : `Q${quarter}`;
}

function formatDownLabel(down: number) {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

function formatDownDistance(state: DerivedGameState) {
  return `${formatDownLabel(state.down)} & ${state.distance}`;
}

function formatOffenseRelativeSpot(state: DerivedGameState) {
  const relativeSide = state.ballOn.side === state.possession ? "OWN" : "OPP";
  return `${relativeSide} ${state.ballOn.yardLine}`;
}

function formatPossessionLabel(state: DerivedGameState, snapshot: GameDaySnapshot) {
  return state.possession === "home" ? snapshot.homeTeam : snapshot.awayTeam;
}

function absoluteBallSideForPossession(possession: TeamSide, relativeSide: RelativeFieldSide): TeamSide {
  return relativeSide === "own" ? possession : possession === "home" ? "away" : "home";
}

function relativeFieldSide(state: DerivedGameState): RelativeFieldSide {
  return state.ballOn.side === state.possession ? "own" : "opp";
}

function toStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function teamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() ?? "")
    .join("");
}

function getHomeTeamIsPrimary(record: GameAdminRecord) {
  return record.game.homeAway === "home";
}

function getTeamToneStyle(record: GameAdminRecord, side: TeamSide): CSSProperties {
  const isPrimarySide = getHomeTeamIsPrimary(record) ? side === "home" : side === "away";
  const primary = record.branding?.primaryColor ?? "#5b8def";
  const accent = record.branding?.accentColor ?? "#d18d1f";

  return {
    "--team-line": isPrimarySide ? primary : "#d9ddd8",
    "--team-glow": isPrimarySide ? `${primary}55` : "rgba(255,255,255,0.14)",
    "--team-fill": isPrimarySide ? `${primary}1a` : "rgba(255,255,255,0.06)",
    "--team-accent": isPrimarySide ? accent : "#f3efe6"
  } as CSSProperties;
}

function getTeamLogoSrc(record: GameAdminRecord, side: TeamSide) {
  const brandingPath = record.branding?.wordmarkPath;
  const isPrimarySide = getHomeTeamIsPrimary(record) ? side === "home" : side === "away";
  return isPrimarySide ? brandingPath ?? null : null;
}

function getTeamStat(snapshot: GameDaySnapshot, side: TeamSide, stat: string) {
  return snapshot.teamStats.find((entry) => entry.side === side)?.totals?.[stat as keyof typeof snapshot.teamStats[number]["totals"]] ?? 0;
}

function formatThirdDownSnapshot(snapshot: GameDaySnapshot, side: TeamSide) {
  const made = getTeamStat(snapshot, side, "third_down_conversion");
  const attempts = getTeamStat(snapshot, side, "third_down_attempt");
  return `${made}/${attempts}`;
}

function formatCorrectionTimestamp(value: string) {
  return correctionTimestampFormatter.format(new Date(value));
}

function formatWriterLeaseExpiry(value?: string | null) {
  if (!value) {
    return null;
  }

  return liveLeaseFormatter.format(new Date(value));
}

function formatCorrectionSituation(correction: GameStateCorrection) {
  const relativeSide = correction.ballOn.side === correction.possession ? "OWN" : "OPP";
  return `${correction.possession === "home" ? "Home" : "Away"} • ${relativeSide} ${correction.ballOn.yardLine} • ${formatDownLabel(correction.down)} & ${correction.distance}`;
}

function TeamLogoBadge({
  name,
  src,
  sideStyle
}: {
  name: string;
  src?: string | null;
  sideStyle: CSSProperties;
}) {
  const [showFallback, setShowFallback] = useState(!src);

  return (
    <div className="live-team-logo" style={sideStyle}>
      {!showFallback && src ? (
        <img
          alt={`${name} logo`}
          className="live-team-logo-image"
          src={src}
          onError={() => setShowFallback(true)}
        />
      ) : (
        <span className="live-team-logo-fallback">{teamInitials(name)}</span>
      )}
    </div>
  );
}

function LiveTeamScoreCard({
  teamName,
  score,
  scorePulse,
  toneStyle,
  logoSrc,
  side
}: {
  teamName: string;
  score: number;
  scorePulse: boolean;
  toneStyle: CSSProperties;
  logoSrc?: string | null;
  side: TeamSide;
}) {
  return (
    <article
      className={scorePulse ? "live-team-score-card score-pulse-active" : "live-team-score-card"}
      data-side={side}
      style={toneStyle}
    >
      <div className="live-team-score-head">
        <TeamLogoBadge name={teamName} src={logoSrc} sideStyle={toneStyle} />
        <div className="stack-sm">
          <span className="live-team-card-label">{side === "home" ? "Home" : "Away"}</span>
          <strong className="live-team-card-name">{teamName}</strong>
        </div>
      </div>
      <div className="live-team-score-value">{score}</div>
    </article>
  );
}

function LiveGameHeaderBand({
  record,
  snapshot,
  homePulse,
  awayPulse,
  variant = "overview"
}: {
  record: GameAdminRecord;
  snapshot: GameDaySnapshot;
  homePulse: boolean;
  awayPulse: boolean;
  variant?: "overview" | "live";
}) {
  const state = snapshot.currentState;
  const status = toStatusLabel(snapshot.status || record.game.status);
  const kickoffDate = formatKickoffDate(record.game.kickoffAt);
  const venue = record.venue?.name ?? "Venue TBD";
  const homeStyle = getTeamToneStyle(record, "home");
  const awayStyle = getTeamToneStyle(record, "away");
  const possessionLabel = formatPossessionLabel(state, snapshot);
  const downDistanceLabel = formatDownDistance(state);
  const ballSpotLabel = formatOffenseRelativeSpot(state);
  const isLiveVariant = variant === "live";

  return (
    <header
      className={isLiveVariant ? "live-game-header-band live-game-header-band-live" : "live-game-header-band"}
      data-testid="live-game-header"
    >
      <LiveTeamScoreCard
        teamName={record.sideLabels.home}
        score={state.score.home}
        scorePulse={homePulse}
        toneStyle={homeStyle}
        logoSrc={getTeamLogoSrc(record, "home")}
        side="home"
      />
      <div className={isLiveVariant ? "live-game-header-center live-game-header-center-live" : "live-game-header-center"}>
        {isLiveVariant ? (
          <div className="live-entry-header-meta">
            <span className="eyebrow live-game-center-eyebrow">Live Entry</span>
            <div className="live-entry-header-copy">
              <strong>
                {record.sideLabels.away} at {record.sideLabels.home}
              </strong>
              <span>
                {formatQuarterLabel(state.quarter)} • {status}
              </span>
            </div>
          </div>
        ) : (
          <>
            <span className="eyebrow live-game-center-eyebrow">Live Game Center</span>
            <h1 className="live-game-title">
              {record.sideLabels.away} at {record.sideLabels.home}
            </h1>
            <p className="live-game-meta">
              <span>{record.season.label}</span>
              <span>{kickoffDate}</span>
              <span>{venue}</span>
            </p>
          </>
        )}
        <div className="live-game-situation-bar" data-testid="game-day-scoreboard-state">
          <div className="live-game-situation-core live-game-situation-core-spot">
            <span className="live-status-label">Ball spot</span>
            <strong>{ballSpotLabel}</strong>
          </div>
          <div className="live-game-situation-core live-game-situation-core-down">
            <span className="live-status-label">Down &amp; distance</span>
            <strong>{downDistanceLabel}</strong>
          </div>
          <div className="live-game-situation-core live-game-situation-core-possession">
            <span className="live-status-label">Possession</span>
            <strong>{possessionLabel}</strong>
          </div>
        </div>
        <div className="live-game-status-ribbon">
          <div className="live-status-core">
            <span className="live-status-label">Quarter</span>
            <strong>{formatQuarterLabel(state.quarter)}</strong>
          </div>
          <div className="live-status-core">
            <span className="live-status-label">Status</span>
            <strong>{status}</strong>
          </div>
        </div>
      </div>
      <LiveTeamScoreCard
        teamName={record.sideLabels.away}
        score={state.score.away}
        scorePulse={awayPulse}
        toneStyle={awayStyle}
        logoSrc={getTeamLogoSrc(record, "away")}
        side="away"
      />
    </header>
  );
}

function LiveEntryRecentStrip({
  plays,
  canUndoLastPlay,
  canWrite,
  onUndoLast
}: {
  plays: GameDayPlayView[];
  canUndoLastPlay: boolean;
  canWrite: boolean;
  onUndoLast: () => void;
}) {
  return (
    <section className="live-entry-recent-strip" data-testid="live-entry-recent-strip">
      <div className="live-entry-recent-strip-header">
        <div>
          <span className="eyebrow live-board-eyebrow">Last plays</span>
          <h2 className="live-entry-strip-title">Recent sequence</h2>
        </div>
        {canWrite ? (
          <button
            className="mini-button live-entry-undo-button"
            data-testid="live-entry-undo-last"
            disabled={!canUndoLastPlay || !plays[0]}
            type="button"
            onClick={onUndoLast}
          >
            Undo last play
          </button>
        ) : (
          <span className="chip">Read only</span>
        )}
      </div>
      <div className="live-entry-recent-grid">
        {plays.length === 0 ? <div className="kicker">No plays logged yet. Start with the next live snap.</div> : null}
        {plays.map((item, index) => (
          <article
            className={index === 0 ? "live-entry-recent-card live-entry-recent-card-latest" : "live-entry-recent-card"}
            key={item.playId}
          >
            <div className="timeline-top">
              <span className="mono">{formatQuarterLabel(item.quarter)}</span>
              <span className="mono">{item.sequence}</span>
            </div>
            <strong className="recent-play-result">{item.summary}</strong>
            <div className="timeline-meta recent-play-meta">
              <span>{item.playType.replaceAll("_", " ")}</span>
              <span>
                {formatDownLabel(item.state.down)} &amp; {item.state.distance} • {formatOffenseRelativeSpot(item.state)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LivePrimaryControlStrip({
  gameId,
  snapshot,
  session,
  statusText,
  errorText,
  busyAction,
  pendingMutations,
  isOffline,
  compactMode,
  hasDeviceKey,
  latestSituationCorrection,
  theme,
  onToggleTheme,
  onToggleCompactMode,
  onRefresh,
  onRetrySync,
  onReleaseWriter,
  onReacquireWriter,
  onRecoverSituation
}: {
  gameId: string;
  snapshot: GameDaySnapshot;
  session: GameSessionSummary | null;
  statusText: string;
  errorText: string | null;
  busyAction: string | null;
  pendingMutations: number;
  isOffline: boolean;
  compactMode: boolean;
  hasDeviceKey: boolean;
  latestSituationCorrection: GameStateCorrection | null;
  theme: "broadcast" | "contrast";
  onToggleTheme: () => void;
  onToggleCompactMode: () => void;
  onRefresh: () => void;
  onRetrySync: () => void;
  onReleaseWriter: () => void;
  onReacquireWriter: () => void;
  onRecoverSituation: (correction: SituationCorrectionSubmission) => Promise<void>;
}) {
  const state = snapshot.currentState;
  const latestPlay = snapshot.recentPlays[0] ?? null;
  const isWriterMode = Boolean(session?.isActiveWriter);
  const writerLabel = session?.isActiveWriter ? "Active writer" : "Viewer mode";
  const syncLabel = session?.status ? toStatusLabel(session.status) : "session pending";
  const actionFeedback = errorText
    ? "errors"
    : isOffline
      ? "offline"
      : pendingMutations > 0 || session?.status === "syncing"
        ? "saved"
        : "synced";
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverPossession, setRecoverPossession] = useState<TeamSide>(state.possession);
  const [recoverRelativeSide, setRecoverRelativeSide] = useState<RelativeFieldSide>(relativeFieldSide(state));
  const [recoverYardLine, setRecoverYardLine] = useState(String(state.ballOn.yardLine));
  const [recoverDown, setRecoverDown] = useState(String(state.down));
  const [recoverDistance, setRecoverDistance] = useState(String(state.distance));
  const [recoverQuarter, setRecoverQuarter] = useState("");
  const [recoverReasonCategory, setRecoverReasonCategory] =
    useState<SituationCorrectionSubmission["reasonCategory"]>("live_resync");
  const [recoverReasonNote, setRecoverReasonNote] = useState("");
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const canOpenRecover = Boolean(latestPlay && session?.isActiveWriter && !isOffline && hasDeviceKey);

  function openRecoverPanel() {
    if (!latestPlay) {
      return;
    }

    setRecoverPossession(state.possession);
    setRecoverRelativeSide(relativeFieldSide(state));
    setRecoverYardLine(String(state.ballOn.yardLine));
    setRecoverDown(String(state.down));
    setRecoverDistance(String(state.distance));
    setRecoverQuarter("");
    setRecoverReasonCategory("live_resync");
    setRecoverReasonNote("");
    setRecoverError(null);
    setRecoverOpen(true);
  }

  async function submitRecoverSituation() {
    if (!latestPlay) {
      return;
    }

    const yardLine = Number(recoverYardLine);
    const down = Number(recoverDown);
    const distance = Number(recoverDistance);
    const quarter = recoverQuarter ? Number(recoverQuarter) : undefined;

    if (!Number.isInteger(yardLine) || yardLine < 1 || yardLine > 99) {
      setRecoverError("Ball spot must be between 1 and 99.");
      return;
    }

    if (!Number.isInteger(down) || down < 1 || down > 4) {
      setRecoverError("Down must be 1 through 4.");
      return;
    }

    if (!Number.isInteger(distance) || distance < 1 || distance > 99) {
      setRecoverError("Distance must be between 1 and 99.");
      return;
    }

    if (recoverReasonNote.trim().length < 3) {
      setRecoverError("Reason note is required.");
      return;
    }

    setRecoverError(null);
    await onRecoverSituation({
      appliesAfterSequence: latestPlay.sequence,
      possession: recoverPossession,
      ballOn: {
        side: absoluteBallSideForPossession(recoverPossession, recoverRelativeSide),
        yardLine
      },
      down: down as 1 | 2 | 3 | 4,
      distance,
      quarter: quarter as 1 | 2 | 3 | 4 | 5 | undefined,
      reasonCategory: recoverReasonCategory,
      reasonNote: recoverReasonNote.trim()
    });
    setRecoverOpen(false);
  }

  return (
    <section
      className={isWriterMode ? "live-primary-control-strip live-primary-control-strip-writer" : "live-primary-control-strip live-primary-control-strip-viewer"}
      data-testid="game-day-status-bar"
    >
      <div className="live-session-panel">
        <div className="status-strip">
          <span
            className="status-pill strong"
            data-testid={isWriterMode ? "writer-mode-banner" : "viewer-mode-banner"}
          >
            {isWriterMode ? "Writer Mode" : "Viewer Mode"}
          </span>
          <span className="status-pill strong">{writerLabel}</span>
          <span className="status-pill">{isOffline ? "offline" : "online"}</span>
          <span className="status-pill">{syncLabel}</span>
          <span
            className={`status-pill action-feedback-pill action-feedback-${actionFeedback}`}
            data-testid="game-day-action-feedback"
          >
            {actionFeedback}
          </span>
          <span className="status-pill">Revision {snapshot.revision}</span>
          {pendingMutations > 0 ? <span className="status-pill">{pendingMutations} queued</span> : null}
        </div>
        <div className="live-session-copy">
          <strong>{statusText}</strong>
          {errorText ? <div className="error-note">{errorText}</div> : null}
        </div>
      </div>
      <div className="live-control-actions">
        {isWriterMode ? (
          <>
            <button
              className="mini-button"
              data-testid="state-correction-controls"
              disabled={!canOpenRecover || busyAction !== null}
              type="button"
              onClick={openRecoverPanel}
            >
              Recover situation
            </button>
          </>
        ) : null}
        <button className="mini-button" disabled={busyAction !== null || !hasDeviceKey} type="button" onClick={onRefresh}>
          {busyAction === "refresh" ? "Refreshing..." : "Refresh live"}
        </button>
        <button
          className="mini-button"
          disabled={busyAction !== null || !hasDeviceKey || pendingMutations === 0}
          type="button"
          onClick={onRetrySync}
        >
          Retry sync
        </button>
        {session?.isActiveWriter ? (
          <button className="mini-button" disabled={busyAction !== null} type="button" onClick={onReleaseWriter}>
            Release writer
          </button>
        ) : (
          <button className="mini-button" disabled={busyAction !== null || !hasDeviceKey} type="button" onClick={onReacquireWriter}>
            {busyAction === "lease" ? "Trying..." : "Try writer lease"}
          </button>
        )}
        {isWriterMode ? (
          <button className="mini-button" type="button" onClick={onToggleCompactMode}>
            {compactMode ? "Standard entry" : "Compact entry"}
          </button>
        ) : null}
        <button className="mini-button" type="button" onClick={onToggleTheme}>
          {theme === "broadcast" ? "Contrast theme" : "Broadcast theme"}
        </button>
        <Link className="mini-button" href={`/games/${gameId}/manage`}>
          Game admin
        </Link>
        <Link className="mini-button" href={`/games/${gameId}/reports`}>
          Reports
        </Link>
      </div>
      {latestSituationCorrection ? (
        <div className="live-correction-banner" data-testid="game-day-situation-corrected-banner">
          <strong>Situation corrected</strong>
          <span>
            {latestSituationCorrection.createdByDisplayName ?? "Unknown operator"} •{" "}
            {formatCorrectionTimestamp(latestSituationCorrection.createdAt)}
          </span>
          <span>
            {latestSituationCorrection.reasonCategory.replaceAll("_", " ")} • {latestSituationCorrection.reasonNote}
          </span>
        </div>
      ) : null}
      {recoverOpen ? (
        <section className="recover-situation-panel" data-testid="recover-situation-panel">
          <div className="entry-header">
            <div>
              <span className="eyebrow live-board-eyebrow">Recover situation</span>
              <h2 className="live-panel-heading">Recover situation</h2>
            </div>
            <span className="chip">After play {latestPlay?.sequence ?? "—"}</span>
          </div>
          <p className="recover-situation-warning">
            Use this only when the live situation cannot be fixed quickly by editing or adding plays.
          </p>
          <div className="form-grid recover-situation-grid">
            <label className="field">
              <span>Possession</span>
              <select value={recoverPossession} onChange={(event) => setRecoverPossession(event.target.value as TeamSide)}>
                <option value="home">{snapshot.homeTeam}</option>
                <option value="away">{snapshot.awayTeam}</option>
              </select>
            </label>
            <label className="field">
              <span>Ball side</span>
              <select value={recoverRelativeSide} onChange={(event) => setRecoverRelativeSide(event.target.value as RelativeFieldSide)}>
                <option value="own">OWN</option>
                <option value="opp">OPP</option>
              </select>
            </label>
            <label className="field">
              <span>Yard line</span>
              <input inputMode="numeric" value={recoverYardLine} onChange={(event) => setRecoverYardLine(event.target.value)} />
            </label>
            <label className="field">
              <span>Down</span>
              <select value={recoverDown} onChange={(event) => setRecoverDown(event.target.value)}>
                <option value="1">1st</option>
                <option value="2">2nd</option>
                <option value="3">3rd</option>
                <option value="4">4th</option>
              </select>
            </label>
            <label className="field">
              <span>Distance</span>
              <input inputMode="numeric" value={recoverDistance} onChange={(event) => setRecoverDistance(event.target.value)} />
            </label>
            <label className="field">
              <span>Quarter (optional)</span>
              <select value={recoverQuarter} onChange={(event) => setRecoverQuarter(event.target.value)}>
                <option value="">Keep current</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
                <option value="5">OT</option>
              </select>
            </label>
            <label className="field">
              <span>Reason category</span>
              <select
                value={recoverReasonCategory}
                onChange={(event) =>
                  setRecoverReasonCategory(event.target.value as SituationCorrectionSubmission["reasonCategory"])
                }
              >
                <option value="missed_play">Missed play</option>
                <option value="live_resync">Live resync</option>
                <option value="official_correction">Official correction</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field field-span-2">
              <span>Reason note</span>
              <textarea value={recoverReasonNote} onChange={(event) => setRecoverReasonNote(event.target.value)} />
            </label>
          </div>
          {recoverError ? <div className="error-note">{recoverError}</div> : null}
          <div className="timeline-actions">
            <button className="mini-button" type="button" onClick={() => setRecoverOpen(false)}>
              Cancel
            </button>
            <button
              className="button-primary button-primary-small"
              disabled={busyAction !== null}
              type="button"
              onClick={() => void submitRecoverSituation()}
            >
              {busyAction === "recover" ? "Correcting..." : "Apply correction"}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function RecentPlaysRail({
  plays,
  canEdit,
  canUndoLastPlay,
  onEditPlay,
  onInsertBefore,
  onUndoLast,
  onFreshPlay
}: {
  plays: GameDayPlayView[];
  canEdit: boolean;
  canUndoLastPlay: boolean;
  onEditPlay: (play: GameDayPlayView) => void;
  onInsertBefore: (play: GameDayPlayView) => void;
  onUndoLast: () => void;
  onFreshPlay: () => void;
}) {
  return (
    <section
      className="recent-plays-rail section-card pad-lg stack-md"
      data-mode={canEdit ? "writer" : "viewer"}
      data-testid="game-day-recent-plays"
    >
      <div className="entry-header">
        <div>
          <span className="eyebrow live-board-eyebrow">Recent plays</span>
          <h2 className="live-panel-heading">Recent plays</h2>
          <p className="kicker live-board-copy">
            {canEdit
              ? "Last 3 snaps stay visible for quick correction work without leaving the live surface."
              : "Last 3 snaps stay visible for live review while another writer controls entry."}
          </p>
          </div>
          <span className="chip">{canEdit ? `${plays.length} visible` : "Read only"}</span>
        </div>
      {canEdit ? (
        <div className="timeline-actions recent-plays-actions" data-testid="game-day-recent-play-actions">
          <button className="mini-button recent-plays-action-button" type="button" onClick={onFreshPlay}>
            Fresh play
          </button>
          <button className="mini-button recent-plays-action-button" disabled={!canUndoLastPlay || !plays[0]} type="button" onClick={onUndoLast}>
            Undo last play
          </button>
          <button className="mini-button recent-plays-action-button" disabled={!plays[0]} type="button" onClick={() => plays[0] && onEditPlay(plays[0])}>
            Edit last
          </button>
          <button className="mini-button recent-plays-action-button" disabled={!plays[0]} type="button" onClick={() => plays[0] && onInsertBefore(plays[0])}>
            Insert play
          </button>
        </div>
      ) : null}
      <div className="recent-plays-grid">
        {plays.length === 0 ? <div className="kicker">No plays logged yet. Start with the next live snap.</div> : null}
        {plays.map((item, index) => (
          <article
            className={index === 0 ? "recent-play-card recent-play-card-latest" : "recent-play-card"}
            data-testid={index === 0 ? "recent-play-card-latest" : "recent-play-card"}
            key={item.playId}
          >
            <div className="timeline-top">
              <span className="mono">{formatQuarterLabel(item.quarter)}</span>
              <span className="mono">{item.sequence}</span>
            </div>
            <strong className="recent-play-result">{item.summary}</strong>
            <div className="timeline-meta recent-play-meta">
              <span>{item.playType.replaceAll("_", " ")}</span>
              <span>
                {formatDownLabel(item.state.down)} &amp; {item.state.distance} • {formatOffenseRelativeSpot(item.state)}
              </span>
            </div>
            <div className="timeline-actions">
              {canEdit && index === 0 ? (
                <>
                  <button className="mini-button" type="button" onClick={() => onEditPlay(item)}>
                    Edit last
                  </button>
                  <button className="mini-button" type="button" onClick={onUndoLast}>
                    Delete last
                  </button>
                </>
              ) : null}
              {canEdit ? (
                <button className="mini-button" type="button" onClick={() => onInsertBefore(item)}>
                  Insert before
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryCards({ snapshot }: { snapshot: GameDaySnapshot }) {
  const items = [
    {
      key: "score",
      label: "Last score",
      play: snapshot.lastScoringPlay,
      meta: `${snapshot.homeTeam} ${snapshot.currentState.score.home} - ${snapshot.currentState.score.away} ${snapshot.awayTeam}`
    },
    {
      key: "turnover",
      label: "Last turnover",
      play: snapshot.lastTurnoverPlay,
      meta: `1D ${getTeamStat(snapshot, "home", "first_down")} / ${getTeamStat(snapshot, "away", "first_down")}`
    },
    {
      key: "penalty",
      label: "Last penalty",
      play: snapshot.lastPenaltyPlay,
      meta: `3D ${formatThirdDownSnapshot(snapshot, "home")} / ${formatThirdDownSnapshot(snapshot, "away")}`
    }
  ];

  return (
    <section className="section-card pad-md live-summary-cards" data-testid="game-day-summary-cards">
      <div className="entry-header">
        <div>
          <span className="eyebrow live-board-eyebrow">Summary</span>
          <h2 className="live-panel-heading">Live summary</h2>
        </div>
        <span className="chip">Read only</span>
      </div>
      <div className="live-summary-grid">
        {items.map((item) => (
          <article className="live-summary-card" key={item.key}>
            <span className="live-summary-label">{item.label}</span>
            <strong className="live-summary-value">{item.play?.summary ?? "No event logged"}</strong>
            <span className="live-summary-meta">{item.play ? `Q${item.play.quarter} • ${item.play.sequence}` : item.meta}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SituationCorrectionHistory({
  corrections,
  canVoid,
  busyAction,
  onVoidSituationCorrection
}: {
  corrections: GameStateCorrection[];
  canVoid: boolean;
  busyAction: string | null;
  onVoidSituationCorrection: (correction: VoidSituationCorrectionSubmission) => Promise<void>;
}) {
  const visibleCorrections = corrections.slice(0, 4);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReasonNote, setVoidReasonNote] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);

  async function submitVoid(correctionId: string) {
    if (voidReasonNote.trim().length < 3) {
      setVoidError("Void reason is required.");
      return;
    }

    setVoidError(null);
    await onVoidSituationCorrection({
      correctionId,
      reasonNote: voidReasonNote.trim()
    });
    setVoidingId(null);
    setVoidReasonNote("");
  }

  return (
    <section className="section-card pad-md live-correction-history" data-testid="game-day-correction-history">
      <div className="entry-header">
        <div>
          <span className="eyebrow live-board-eyebrow">Correction history</span>
          <h2 className="live-panel-heading">Situation corrections</h2>
        </div>
        <span className="chip">{corrections.length} logged</span>
      </div>
      {visibleCorrections.length === 0 ? (
        <p className="kicker" style={{ margin: 0 }}>
          No audited situation corrections yet.
        </p>
      ) : (
        <div className="live-correction-history-list">
          {visibleCorrections.map((correction) => (
            <article className="live-correction-history-item" key={correction.id}>
              <div className="timeline-top">
                <strong>After play {correction.appliesAfterSequence}</strong>
                <span className="mono">
                  {correction.voidedAt ? "Voided" : formatCorrectionTimestamp(correction.createdAt)}
                </span>
              </div>
              <strong className="live-correction-history-state">{formatCorrectionSituation(correction)}</strong>
              <div className="timeline-meta">
                <span>{correction.createdByDisplayName ?? "Unknown operator"}</span>
                <span>{correction.reasonCategory.replaceAll("_", " ")}</span>
              </div>
              <p className="kicker live-correction-history-note">{correction.reasonNote}</p>
              {correction.voidedAt ? (
                <div className="live-correction-history-voided">
                  <strong>Voided</strong>
                  <span>
                    {correction.voidedByDisplayName ?? "Unknown operator"} • {formatCorrectionTimestamp(correction.voidedAt)}
                  </span>
                  {correction.voidReasonNote ? <span>{correction.voidReasonNote}</span> : null}
                </div>
              ) : canVoid ? (
                <div className="live-correction-history-actions" data-testid="state-correction-controls">
                  {voidingId === correction.id ? (
                    <div className="live-correction-history-void-form" data-testid="state-correction-void-form">
                      <label className="field">
                        <span>Void reason</span>
                        <textarea
                          value={voidReasonNote}
                          onChange={(event) => setVoidReasonNote(event.target.value)}
                        />
                      </label>
                      {voidError ? <div className="error-note">{voidError}</div> : null}
                      <div className="timeline-actions">
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => {
                            setVoidingId(null);
                            setVoidReasonNote("");
                            setVoidError(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="mini-button"
                          disabled={busyAction !== null}
                          type="button"
                          onClick={() => void submitVoid(correction.id)}
                        >
                          {busyAction === "void-correction" ? "Voiding..." : "Confirm void"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="mini-button"
                      data-testid="state-correction-void-trigger"
                      disabled={busyAction !== null}
                      type="button"
                      onClick={() => {
                        setVoidingId(correction.id);
                        setVoidReasonNote("");
                        setVoidError(null);
                      }}
                    >
                      Void correction
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function LiveGameCenter({
  gameId,
  record,
  snapshot,
  session,
  statusText,
  errorText,
  busyAction,
  pendingMutations,
  isOffline,
  compactMode,
  hasDeviceKey,
  canUndoLastPlay,
  latestSituationCorrection,
  situationCorrections,
  playEntryPanel,
  onToggleCompactMode,
  onFreshPlay,
  onUndoLast,
  onEditPlay,
  onInsertBefore,
  onRefresh,
  onRetrySync,
  onReleaseWriter,
  onReacquireWriter,
  onRecoverSituation,
  onVoidSituationCorrection
}: Props) {
  const [theme, setTheme] = useState<"broadcast" | "contrast">("broadcast");
  const [homePulse, setHomePulse] = useState(false);
  const [awayPulse, setAwayPulse] = useState(false);
  const previousScore = useRef(snapshot.currentState.score);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`game-day-theme:${gameId}`);
      if (saved === "contrast" || saved === "broadcast") {
        setTheme(saved);
      }
    } catch {}
  }, [gameId]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(`game-day-theme:${gameId}`, theme);
    } catch {}
  }, [gameId, theme]);

  useEffect(() => {
    const previous = previousScore.current;
    const next = snapshot.currentState.score;

    if (next.home !== previous.home) {
      setHomePulse(true);
      window.setTimeout(() => setHomePulse(false), 900);
    }
    if (next.away !== previous.away) {
      setAwayPulse(true);
      window.setTimeout(() => setAwayPulse(false), 900);
    }

    previousScore.current = next;
  }, [snapshot.currentState.score]);

  const visibleRecentPlays = snapshot.recentPlays.slice(0, 3);
  const isWriterMode = Boolean(session?.isActiveWriter);

  return (
    <section
      className="live-game-center"
      data-theme={theme}
      style={brandingCssVariables(record.branding)}
    >
      <LiveGameHeaderBand
        record={record}
        snapshot={snapshot}
        homePulse={homePulse}
        awayPulse={awayPulse}
      />

      <LivePrimaryControlStrip
        gameId={gameId}
        snapshot={snapshot}
        session={session}
        statusText={statusText}
        errorText={errorText}
        busyAction={busyAction}
        pendingMutations={pendingMutations}
        isOffline={isOffline}
        compactMode={compactMode}
        hasDeviceKey={hasDeviceKey}
        latestSituationCorrection={latestSituationCorrection}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "broadcast" ? "contrast" : "broadcast"))}
        onToggleCompactMode={onToggleCompactMode}
        onRefresh={onRefresh}
        onRetrySync={onRetrySync}
        onReleaseWriter={onReleaseWriter}
        onReacquireWriter={onReacquireWriter}
        onRecoverSituation={onRecoverSituation}
      />

      <div className="live-game-main-grid live-game-main-grid-corrected">
        <section className="live-entry-frame live-entry-frame-wide">{playEntryPanel}</section>
        <div className="live-game-sidebar-stack">
          <RecentPlaysRail
            plays={visibleRecentPlays}
            canEdit={isWriterMode}
            canUndoLastPlay={canUndoLastPlay}
            onEditPlay={onEditPlay}
            onInsertBefore={onInsertBefore}
            onUndoLast={onUndoLast}
            onFreshPlay={onFreshPlay}
          />
          <SummaryCards snapshot={snapshot} />
          <SituationCorrectionHistory
            corrections={situationCorrections}
            canVoid={Boolean(session?.isActiveWriter && !isOffline)}
            busyAction={busyAction}
            onVoidSituationCorrection={onVoidSituationCorrection}
          />
        </div>
      </div>
    </section>
  );
}

export function LiveEntryCenter({
  gameId,
  record,
  snapshot,
  session,
  statusText,
  errorText,
  busyAction,
  pendingMutations,
  isOffline,
  hasDeviceKey,
  canUndoLastPlay,
  playEntryPanel,
  onUndoLast,
  onReacquireWriter
}: Props) {
  const [homePulse, setHomePulse] = useState(false);
  const [awayPulse, setAwayPulse] = useState(false);
  const previousScore = useRef(snapshot.currentState.score);
  const isWriterMode = Boolean(session?.isActiveWriter);
  const leaseExpiry = formatWriterLeaseExpiry(session?.writerLeaseExpiresAt);
  const actionFeedback = errorText
    ? "errors"
    : isOffline
      ? "offline"
      : pendingMutations > 0 || session?.status === "syncing"
        ? "saved"
        : "synced";

  useEffect(() => {
    const previous = previousScore.current;
    const next = snapshot.currentState.score;

    if (next.home !== previous.home) {
      setHomePulse(true);
      window.setTimeout(() => setHomePulse(false), 900);
    }
    if (next.away !== previous.away) {
      setAwayPulse(true);
      window.setTimeout(() => setAwayPulse(false), 900);
    }

    previousScore.current = next;
  }, [snapshot.currentState.score]);

  return (
    <section className="live-entry-center" style={brandingCssVariables(record.branding)}>
      <div className="live-entry-sticky-top">
        <div className="live-entry-toolbar" data-testid="live-entry-toolbar">
          <Link className="mini-button live-entry-toolbar-link" href={`/games/${gameId}/gameday`}>
            Overview
          </Link>
          <div className="live-entry-toolbar-status">
            <span
              className="status-pill strong"
              data-testid={isWriterMode ? "writer-mode-banner" : "viewer-mode-banner"}
            >
              {isWriterMode ? "Writer Mode" : "Viewer Mode"}
            </span>
            <span className={`status-pill action-feedback-pill action-feedback-${actionFeedback}`}>
              {actionFeedback}
            </span>
            {isWriterMode && errorText ? <span className="status-pill">{errorText}</span> : null}
          </div>
        </div>

        {!isWriterMode ? (
          <section className="live-entry-viewer-banner" data-testid="live-entry-viewer-banner">
            <div className="live-entry-viewer-copy">
              <span className="eyebrow live-game-center-eyebrow">Read only</span>
              <div className="live-entry-viewer-heading-row">
                <h2 className="live-entry-viewer-title">Another writer is active</h2>
                {leaseExpiry ? <span className="chip live-entry-viewer-chip">Lease active until {leaseExpiry}</span> : null}
              </div>
              <p className="live-entry-viewer-text">
                Live Entry is read-only until writer access is acquired. Use Try writer lease to request control, return to overview, or use a fresh game for preview testing.
              </p>
              {errorText ? <div className="error-note live-entry-viewer-error">{errorText}</div> : null}
              <ul className="live-entry-viewer-hints">
                <li>Try writer lease to request control of this game.</li>
                <li>Return to overview if you only need review and correction context.</li>
                <li>Use a different fresh game if this shared preview game is already in use.</li>
              </ul>
            </div>
            <div className="live-entry-viewer-actions" data-testid="state-correction-controls">
              <button
                className="button-primary live-entry-primary-cta"
                data-testid="live-entry-try-writer"
                disabled={!hasDeviceKey || isOffline || busyAction !== null}
                type="button"
                onClick={onReacquireWriter}
              >
                {busyAction === "lease" ? "Requesting writer lease..." : "Try writer lease"}
              </button>
              <Link className="mini-button live-entry-viewer-secondary" href={`/games/${gameId}/gameday`}>
                Return to overview
              </Link>
              <p className="live-entry-viewer-note">
                Single-writer protection stays in place. If another session still holds the lease, this page remains read-only.
              </p>
            </div>
          </section>
        ) : null}

        <LiveGameHeaderBand
          record={record}
          snapshot={snapshot}
          homePulse={homePulse}
          awayPulse={awayPulse}
          variant="live"
        />
      </div>

      <section className="live-entry-workspace" data-mode={isWriterMode ? "writer" : "viewer"}>
        <section className="live-entry-main-panel">
          {playEntryPanel}
        </section>

        <LiveEntryRecentStrip
          plays={snapshot.recentPlays.slice(0, 3)}
          canUndoLastPlay={canUndoLastPlay}
          canWrite={isWriterMode}
          onUndoLast={onUndoLast}
        />
      </section>

      <div className="live-entry-footer-note">
        <strong>{statusText}</strong>
      </div>
    </section>
  );
}
