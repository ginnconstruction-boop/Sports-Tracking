import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { ReportExportPanel } from "@/components/reports/report-export-panel";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { formatClock } from "@/lib/engine/clock";
import { notFound } from "next/navigation";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameReportPreview, listGameExports } from "@/server/services/report-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

function statEntries(totals: Record<string, number | undefined>) {
  return Object.entries(totals).filter(([, value]) => typeof value === "number" && value !== 0).slice(0, 8);
}

function driveResultLabel(result: string) {
  return result.replaceAll("_", " ");
}

function staffNotes(preview: Awaited<ReturnType<typeof getGameReportPreview>>) {
  return [
    preview.context.staffNotes,
    preview.context.opponentPrepNotes,
    preview.context.logisticsNotes
  ].filter(Boolean) as string[];
}

export default async function ReportsPage({ params }: PageProps) {
  if (!isFeatureEnabled("reports_preview")) {
    notFound();
  }
  const { gameId } = await params;
  const [snapshot, preview, exports, record] = await Promise.all([
    getGameDaySnapshot(gameId, "read_only"),
    getGameReportPreview(gameId),
    listGameExports(gameId),
    getGameAdminRecord(gameId)
  ]);
  const showDriveSummary = isFeatureEnabled("drive_summary");
  const showAnalytics = isFeatureEnabled("advanced_analytics");
  const showPublic = isFeatureEnabled("live_public_tracker");
  const showInternalReview = isFeatureEnabled("internal_debug_tools");
  const coachNotes = staffNotes(preview);

  return (
    <AppShell
      gameId={gameId}
      current="reports"
      title="Reports and exports stay downstream from the play log."
      subtitle="The preview on this screen is built from the canonical report document, and the player/team stat tables remain projections of the same ordered event history."
    >
      <section className="section-grid">
        <GameContextHeader record={record} compact />
        <section className="section-card pad-lg stack-lg">
          <div className="stack-sm">
            <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
              Report preview
            </span>
            <h2 style={{ margin: 0 }}>
              {preview.context.awayTeam} at {preview.context.homeTeam}
            </h2>
            <p className="kicker">
              Score {preview.currentState.score.away}-{preview.currentState.score.home}, quarter{" "}
              {preview.currentState.quarter}, clock {formatClock(preview.currentState.clockSeconds)}, phase{" "}
              {preview.currentState.phase}. {preview.context.venueLabel}.
            </p>
          </div>

          <div className="pill-row">
            <span className="chip">Kickoff {preview.context.kickoffAt ? new Date(preview.context.kickoffAt).toLocaleString() : "TBD"}</span>
            {preview.context.weatherConditions ? <span className="chip">Weather {preview.context.weatherConditions}</span> : null}
            {preview.context.fieldConditions ? <span className="chip">Field {preview.context.fieldConditions}</span> : null}
            <span className="chip">Generated {new Date(preview.generatedAt).toLocaleString()}</span>
          </div>

          <div className="report-grid">
            {preview.teamStats.map((team) => (
              <div className="report-card stack-sm" key={team.side}>
                <strong>{team.label}</strong>
                {statEntries(team.totals).map(([key, value]) => (
                  <div className="timeline-meta" key={key}>
                    <span>{key.replaceAll("_", " ")}</span>
                    <span className="mono">{value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="two-column">
          <div className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Coach packet summary</h2>
              <span className="chip">{preview.context.status}</span>
            </div>
            <div className="report-grid">
              <div className="report-card stack-sm">
                <strong>Game flow</strong>
                <div className="pill-row">
                  <span className="chip">{preview.finalSummary.totalPlays} total plays</span>
                  <span className="chip">{preview.finalSummary.totalDrives} total drives</span>
                  <span className="chip">{preview.penaltyTracker.length} penalties tracked</span>
                  <span className="chip">{preview.turnoverTracker.length} turnovers tracked</span>
                </div>
              </div>
              <div className="report-card stack-sm">
                <strong>Staff notes</strong>
                {coachNotes.length === 0 ? <div className="kicker">No game notes attached yet.</div> : null}
                {coachNotes.map((item) => (
                  <div className="kicker" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Team stat view</h2>
              <span className="chip">{preview.teamStats.length} sides</span>
            </div>
            <div className="table-like">
              {preview.teamStats.map((team) => (
                <div className="timeline-card" key={`team-${team.side}`}>
                  <div className="timeline-top">
                    <strong>{team.label}</strong>
                    <span className="mono">{team.side}</span>
                  </div>
                  <div className="pill-row">
                    {statEntries(team.totals).map(([key, value]) => (
                      <span className="chip" key={`${team.side}-${key}`}>
                        {key.replaceAll("_", " ")}: {value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="three-column">
          <div className="section-card pad-lg stack-sm">
            <h2 style={{ margin: 0 }}>Highlights</h2>
            <div className="stack-sm">
              <div className="timeline-card"><strong>Last score</strong><div className="kicker">{preview.highlights.lastScoringSummary || "None yet."}</div></div>
              <div className="timeline-card"><strong>Last turnover</strong><div className="kicker">{preview.highlights.lastTurnoverSummary || "None yet."}</div></div>
              <div className="timeline-card"><strong>Last penalty</strong><div className="kicker">{preview.highlights.lastPenaltySummary || "None yet."}</div></div>
            </div>
          </div>
          <div className="section-card pad-lg stack-sm">
            <h2 style={{ margin: 0 }}>Halftime</h2>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Score</strong>
                <span className="mono">{preview.halftimeSummary.score.away}-{preview.halftimeSummary.score.home}</span>
              </div>
              <div className="kicker">{preview.halftimeSummary.note}</div>
            </div>
          </div>
          <div className="section-card pad-lg stack-sm">
            <h2 style={{ margin: 0 }}>Final outlook</h2>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Score</strong>
                <span className="mono">{preview.finalSummary.score.away}-{preview.finalSummary.score.home}</span>
              </div>
              <div className="pill-row">
                <span className="chip">{preview.finalSummary.totalPlays} plays</span>
                <span className="chip">{preview.finalSummary.totalDrives} drives</span>
              </div>
              <div className="kicker">{preview.finalSummary.note}</div>
            </div>
          </div>
        </section>

        <section className="two-column">
          <div className="section-card pad-lg stack-md">
            <h2 style={{ margin: 0 }}>Scoring summary</h2>
            <div className="table-like">
              {preview.scoringSummary.length === 0 ? <div className="kicker">No scoring plays yet.</div> : null}
              {preview.scoringSummary.map((item) => (
                <div className="timeline-card" key={item.sequence}>
                  <div className="timeline-top">
                    <span className="mono">Q{item.result.finalState.quarter}</span>
                    <span className="mono">
                      {item.result.finalState.score.away}-{item.result.finalState.score.home}
                    </span>
                  </div>
                  <strong>{item.result.summary}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="section-card pad-lg stack-md">
            <ReportExportPanel gameId={gameId} initialExports={exports} />
            <div className="timeline-actions">
              {showAnalytics ? (
                <a className="mini-button" href="/analytics">
                  Open analytics
                </a>
              ) : null}
              {showInternalReview ? (
                <a className="mini-button" href={`/games/${gameId}/review`}>
                  Open review workspace
                </a>
              ) : null}
              {showPublic && record.game.publicReportsEnabled ? (
                <a className="mini-button" href={`/public/reports/${record.game.publicShareToken}`} target="_blank">
                  View public report
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Quarter report</h2>
            <span className="chip">{preview.quarterSummary.length} quarters tracked</span>
          </div>
          <div className="table-like">
            {preview.quarterSummary.map((item) => (
              <div className="timeline-card" key={item.quarter}>
                <div className="timeline-top">
                  <strong>Quarter {item.quarter}</strong>
                  <span className="mono">{item.awayPoints}-{item.homePoints}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">{item.playCount} plays</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Player stat view</h2>
            <span className="chip">{preview.playerStats.length} players with credits</span>
          </div>
          <div className="table-like">
            {preview.playerStats.map((player) => (
              <div className="timeline-card" key={player.gameRosterEntryId}>
                <div className="timeline-top">
                  <strong>
                    {player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}
                    {player.displayName}
                  </strong>
                  <span className="mono">{player.side}</span>
                </div>
                <div className="pill-row">
                  {statEntries(player.totals).map(([key, value]) => (
                    <span className="chip" key={key}>
                      {key.replaceAll("_", " ")}: {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {showDriveSummary ? (
        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Drive summary</h2>
            <span className="chip">{preview.driveSummaries.length} drives</span>
          </div>
          <div className="table-like">
            {preview.driveSummaries.map((drive) => (
              <div className="timeline-card" key={drive.id}>
                <div className="timeline-top">
                  <strong>{drive.side === "home" ? preview.context.homeTeam : preview.context.awayTeam}</strong>
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

        <section className="two-column">
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Penalty tracker</h2>
              <span className="chip">{preview.penaltyTracker.length}</span>
            </div>
            <div className="table-like">
              {preview.penaltyTracker.map((item) => (
                <div className="timeline-card" key={`penalty-${item.playId}`}>
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
              <h2 style={{ margin: 0 }}>Turnover tracker</h2>
              <span className="chip">{preview.turnoverTracker.length}</span>
            </div>
            <div className="table-like">
              {preview.turnoverTracker.map((item) => (
                <div className="timeline-card" key={`turnover-${item.playId}`}>
                  <div className="timeline-top">
                    <strong>{item.summary}</strong>
                    <span className="mono">{item.sequence}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </AppShell>
  );
}
