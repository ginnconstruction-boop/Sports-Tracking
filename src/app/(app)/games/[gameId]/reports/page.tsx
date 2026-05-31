import Link from "next/link";
import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { ReportExportPanel } from "@/components/reports/report-export-panel";
import { TendencyBreakdownPanel } from "@/components/reports/tendency-breakdown-panel";
import { hasCapability } from "@/lib/auth/roles";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { splitTotalsByGroup } from "@/lib/domain/stat-groups";
import { formatClock } from "@/lib/engine/clock";
import { notFound } from "next/navigation";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameReportPreview, getGameTendencyDatasets, listGameExports } from "@/server/services/report-service";
import { listScoreCorrections } from "@/server/services/score-correction-service";
import { listSituationCorrections } from "@/server/services/state-correction-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

function statEntries(totals: Record<string, number | undefined>) {
  return Object.entries(totals).filter(([, value]) => typeof value === "number" && value !== 0).slice(0, 8);
}

function statTotal(totals: Record<string, number | undefined>, key: string) {
  return totals[key] ?? 0;
}

function formatThirdDownLine(totals: Record<string, number | undefined>) {
  const made = statTotal(totals, "third_down_conversion");
  const attempts = statTotal(totals, "third_down_attempt");
  return `${made}/${attempts}`;
}

function formatThirdDownRate(totals: Record<string, number | undefined>) {
  const made = statTotal(totals, "third_down_conversion");
  const attempts = statTotal(totals, "third_down_attempt");

  if (attempts === 0) {
    return "No 3rd-down attempts";
  }

  return `${Math.round((made / attempts) * 100)}% conversion`;
}

function featuredTeamStats(totals: Record<string, number | undefined>) {
  return [
    { label: "First downs", value: statTotal(totals, "first_down") },
    { label: "3rd down", value: formatThirdDownLine(totals), meta: formatThirdDownRate(totals) },
    { label: "Red zone trips", value: statTotal(totals, "red_zone_trip") },
    { label: "Total yards", value: statTotal(totals, "rushing_yards") + statTotal(totals, "passing_yards") }
  ];
}

function driveResultLabel(result: string) {
  return result.replaceAll("_", " ");
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function situationalLabel(key: string) {
  return key.replaceAll("_", " ");
}

function staffNotes(preview: Awaited<ReturnType<typeof getGameReportPreview>>) {
  return [
    preview.context.staffNotes,
    preview.context.opponentPrepNotes,
    preview.context.logisticsNotes
  ].filter(Boolean) as string[];
}

function topCoachInsights(
  preview: Awaited<ReturnType<typeof getGameReportPreview>>,
  primarySide: "home" | "away"
) {
  const teamTotals = preview.teamStats.find((team) => team.side === primarySide)?.totals ?? {};
  const thirdDownAttempts = statTotal(teamTotals, "third_down_attempt");
  const thirdDownMade = statTotal(teamTotals, "third_down_conversion");
  const thirdDownRate = thirdDownAttempts === 0 ? 0 : Math.round((thirdDownMade / thirdDownAttempts) * 100);
  const redZoneTrips = statTotal(teamTotals, "red_zone_trip");
  const redZoneScores = statTotal(teamTotals, "red_zone_touchdown");

  return [
    {
      label: "3rd down efficiency",
      detail:
        thirdDownAttempts === 0
          ? "No 3rd-down attempts logged yet."
          : `${thirdDownMade}/${thirdDownAttempts} conversions (${thirdDownRate}%).`
    },
    {
      label: "Run/pass tendency",
      detail: `Run ${formatPercent(preview.situational.summary.runRate)} | Pass ${formatPercent(preview.situational.summary.passRate)}.`
    },
    {
      label: "Explosive play rate",
      detail: `${formatPercent(preview.situational.summary.explosivePlayRate)} of tracked situational snaps were explosive plays.`
    },
    {
      label: "Red zone finish",
      detail:
        redZoneTrips === 0
          ? "No red-zone trips recorded."
          : `${redZoneScores} touchdowns on ${redZoneTrips} red-zone trips.`
    },
    {
      label: "Disruption summary",
      detail: `${preview.turnoverTracker.length} turnovers and ${preview.penaltyTracker.length} penalties tagged on the timeline.`
    }
  ];
}

function buildPostGameChecklist(
  preview: Awaited<ReturnType<typeof getGameReportPreview>>,
  exportCount: number
) {
  const isFinalState = ["final", "archived"].includes(preview.context.status);

  return [
    {
      label: "Play log complete",
      complete: preview.finalSummary.totalPlays > 0,
      detail:
        preview.finalSummary.totalPlays > 0
          ? `${preview.finalSummary.totalPlays} plays are available for review.`
          : "No plays are recorded yet. Confirm live entry was captured."
    },
    {
      label: "Game status locked",
      complete: isFinalState,
      detail: isFinalState
        ? `Status is ${preview.context.status.replaceAll("_", " ")}.`
        : "Move game status to Final before coach packet handoff."
    },
    {
      label: "Scoring timeline reviewed",
      complete: preview.scoringSummary.length > 0 || (preview.finalSummary.score.home === 0 && preview.finalSummary.score.away === 0),
      detail:
        preview.scoringSummary.length > 0
          ? `${preview.scoringSummary.length} scoring events listed in the timeline.`
          : "No scoring events listed. Confirm score and summary are correct."
    },
    {
      label: "Penalty + turnover audit",
      complete: true,
      detail: `${preview.penaltyTracker.length} penalties and ${preview.turnoverTracker.length} turnovers are available for spot-checking.`
    },
    {
      label: "Export generated",
      complete: exportCount > 0,
      detail:
        exportCount > 0
          ? `${exportCount} export jobs have been created for this game.`
          : "Run at least one export (PDF/XLSX) before sharing with staff."
    }
  ];
}

function reportCompleteness(preview: Awaited<ReturnType<typeof getGameReportPreview>>, exportCount: number) {
  const checks = [
    preview.finalSummary.totalPlays > 0,
    preview.scoringSummary.length > 0 || (preview.finalSummary.score.home === 0 && preview.finalSummary.score.away === 0),
    ["final", "archived"].includes(preview.context.status),
    preview.situational.summary.totalSituationalPlays > 0,
    exportCount > 0
  ];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    score,
    passed,
    total: checks.length,
    label: score >= 90 ? "Coach-ready" : score >= 70 ? "Needs minor cleanup" : "Needs review"
  };
}

export default async function ReportsPage({ params }: PageProps) {
  if (!isFeatureEnabled("reports_preview")) {
    notFound();
  }
  const { gameId } = await params;
  const [snapshot, preview, exports, record, tendencyDatasets, scoreCorrections, situationCorrections] = await Promise.all([
    getGameDaySnapshot(gameId, "read_only"),
    getGameReportPreview(gameId),
    listGameExports(gameId),
    getGameAdminRecord(gameId),
    getGameTendencyDatasets(gameId),
    listScoreCorrections(gameId).catch(() => []),
    listSituationCorrections(gameId).catch(() => [])
  ]);
  const showDriveSummary = isFeatureEnabled("drive_summary");
  const showAnalytics = isFeatureEnabled("advanced_analytics");
  const showPublic = isFeatureEnabled("live_public_tracker");
  const showInternalReview = isFeatureEnabled("internal_debug_tools");
  const canRequestExports = hasCapability(record.currentUserRole, "export_reports");
  const coachNotes = staffNotes(preview);
  const primarySide = record.game.homeAway;
  const coachInsights = topCoachInsights(preview, primarySide);
  const postGameChecklist = buildPostGameChecklist(preview, exports.length);
  const completeness = reportCompleteness(preview, exports.length);
  const scoreAuditItems = scoreCorrections.slice(0, 5);
  const opponentSnapshot = tendencyDatasets.find((dataset) => dataset.key.startsWith("opponent:")) ?? null;
  const correctionTimeline = [
    ...scoreCorrections.map((item) => ({
      id: `score-${item.id}`,
      kind: "score",
      label: `${item.score.away}-${item.score.home}`,
      reasonCategory: item.reasonCategory,
      reasonNote: item.reasonNote,
      createdBy: item.createdByDisplayName ?? "Unknown",
      createdAt: item.createdAt
    })),
    ...situationCorrections.map((item) => ({
      id: `situation-${item.id}`,
      kind: "situation",
      label: `${item.possession === "home" ? "Home" : "Away"} | ${item.ballOn.side === item.possession ? "OWN" : "OPP"} ${item.ballOn.yardLine} | ${item.down}&${item.distance}`,
      reasonCategory: item.reasonCategory,
      reasonNote: item.reasonNote,
      createdBy: item.createdByDisplayName ?? "Unknown",
      createdAt: item.createdAt
    }))
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 10);
  const offenseLabel =
    record.game.homeAway === "home" ? `${preview.context.homeTeam} offense` : `${preview.context.awayTeam} offense`;
  const defenseLabel =
    record.game.homeAway === "home" ? `${preview.context.homeTeam} defense` : `${preview.context.awayTeam} defense`;

  return (
    <AppShell
      gameId={gameId}
      current="reports"
      navMode="game_day_only"
      title="Reports and exports stay downstream from the play log."
      subtitle="The preview on this screen is built from the canonical report document, and the player/team stat tables remain projections of the same ordered event history."
    >
      <section className="section-grid reports-shell">
        <GameContextHeader record={record} compact />
        <section className="section-card pad-lg stack-lg reports-hero">
          <div className="stack-sm">
            <span className="eyebrow reports-eyebrow">
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

          <div className="report-grid reports-hero-grid">
            {preview.teamStats.map((team) => (
              <div className="report-card stack-sm reports-hero-card" key={team.side}>
                <strong>{team.label}</strong>
                <div className="report-grid">
                  {featuredTeamStats(team.totals).map((item) => (
                    <div className="metric-card stack-sm" key={`${team.side}-${item.label}`}>
                      <span className="metric-label">{item.label}</span>
                      <strong className="metric-value">{item.value}</strong>
                      {"meta" in item && item.meta ? <span className="kicker">{item.meta}</span> : null}
                    </div>
                  ))}
                </div>
                {statEntries(team.totals).map(([key, value]) => (
                  <div className="timeline-meta" key={`${team.side}-${key}`}>
                    <span>{key.replaceAll("_", " ")}</span>
                    <span className="mono">{value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="two-column reports-summary-grid">
          <div className="section-card pad-lg stack-md reports-summary-card">
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

          <div className="section-card pad-lg stack-md reports-summary-card">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Team stat view</h2>
              <span className="chip">{preview.teamStats.length} sides</span>
            </div>
            <div className="timeline-actions">
              <a className="mini-button" href="/docs/stat-definitions.md" rel="noreferrer" target="_blank">
                Open stat glossary
              </a>
            </div>
            <div className="table-like">
              {preview.teamStats.map((team) => (
                <div className="timeline-card" key={`team-${team.side}`}>
                  <div className="timeline-top">
                    <strong>{team.label}</strong>
                    <span className="mono">{team.side}</span>
                  </div>
                  <div className="pill-row">
                    <span className="chip">First downs: {statTotal(team.totals, "first_down")}</span>
                    <span className="chip">3rd down: {formatThirdDownLine(team.totals)}</span>
                    <span className="chip">Red zone: {statTotal(team.totals, "red_zone_trip")}</span>
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

        <section className="three-column reports-highlights-grid">
          <div className="section-card pad-lg stack-sm reports-summary-card">
            <h2 style={{ margin: 0 }}>Highlights</h2>
            <div className="stack-sm">
              <div className="timeline-card"><strong>Last score</strong><div className="kicker">{preview.highlights.lastScoringSummary || "None yet."}</div></div>
              <div className="timeline-card"><strong>Last turnover</strong><div className="kicker">{preview.highlights.lastTurnoverSummary || "None yet."}</div></div>
              <div className="timeline-card"><strong>Last penalty</strong><div className="kicker">{preview.highlights.lastPenaltySummary || "None yet."}</div></div>
            </div>
          </div>
          <div className="section-card pad-lg stack-sm reports-summary-card">
            <h2 style={{ margin: 0 }}>Halftime</h2>
            <div className="timeline-card">
              <div className="timeline-top">
                <strong>Score</strong>
                <span className="mono">{preview.halftimeSummary.score.away}-{preview.halftimeSummary.score.home}</span>
              </div>
              <div className="kicker">{preview.halftimeSummary.note}</div>
            </div>
          </div>
          <div className="section-card pad-lg stack-sm reports-summary-card">
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
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Top 5 coach insights</h2>
              <span className="chip">Game-plan signal</span>
            </div>
            <div className="table-like">
              {coachInsights.map((item) => (
                <div className="timeline-card" key={item.label}>
                  <strong>{item.label}</strong>
                  <div className="kicker">{item.detail}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Post-game correction checklist</h2>
              <span className="chip">Closeout gate</span>
            </div>
            <div className="table-like">
              {postGameChecklist.map((item) => (
                <div className="timeline-card" key={item.label}>
                  <div className="timeline-top">
                    <strong>{item.label}</strong>
                    <span className="chip">{item.complete ? "complete" : "needs action"}</span>
                  </div>
                  <div className="kicker">{item.detail}</div>
                </div>
              ))}
            </div>
          </section>
        </section>

        {opponentSnapshot ? (
          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Next-week opponent tendency snapshot</h2>
              <span className="chip">{opponentSnapshot.gameCount} game(s)</span>
            </div>
            <div className="table-like">
              {opponentSnapshot.offense.slice(0, 3).map((line) => (
                <div className="timeline-card" key={line.key}>
                  <div className="timeline-top">
                    <strong>{line.label}</strong>
                    <span className="mono">{line.plays} plays</span>
                  </div>
                  <div className="pill-row">
                    <span className="chip">Run {line.runRate}%</span>
                    <span className="chip">Pass {line.passRate}%</span>
                    <span className="chip">YPP {line.yardsPerPlay}</span>
                    <span className="chip">Conv {line.conversionRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Score-change audit</h2>
            <span className="chip">{scoreAuditItems.length} entries</span>
          </div>
          <div className="table-like">
            {scoreAuditItems.length === 0 ? <div className="kicker">No score overrides recorded.</div> : null}
            {scoreAuditItems.map((item) => (
              <div className="timeline-card" key={item.id}>
                <div className="timeline-top">
                  <strong>
                    {item.score.away}-{item.score.home}
                  </strong>
                  <span className="chip">{item.reasonCategory.replaceAll("_", " ")}</span>
                </div>
                <div className="kicker">
                  {item.createdByDisplayName ?? "Unknown"} · {new Date(item.createdAt).toLocaleString()} · {item.reasonNote}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Corrections timeline</h2>
            <span className="chip">{correctionTimeline.length} recent changes</span>
          </div>
          <div className="table-like">
            {correctionTimeline.length === 0 ? <div className="kicker">No corrections recorded.</div> : null}
            {correctionTimeline.map((item) => (
              <div className="timeline-card" key={item.id}>
                <div className="timeline-top">
                  <strong>{item.kind === "score" ? "Score correction" : "Situation correction"}</strong>
                  <span className="chip">{item.reasonCategory.replaceAll("_", " ")}</span>
                </div>
                <div className="kicker">{item.label}</div>
                <div className="kicker">
                  {item.createdBy} · {new Date(item.createdAt).toLocaleString()} · {item.reasonNote}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Situational tendency board</h2>
            <span className="chip">{preview.situational.summary.totalSituationalPlays} tracked plays</span>
          </div>
          <div className="pill-row">
            <span className="chip">Completeness {completeness.score}%</span>
            <span className="chip">{completeness.passed}/{completeness.total} checks</span>
            <span className="chip">{completeness.label}</span>
          </div>
          <div className="pill-row">
            <span className="chip">Success {formatPercent(preview.situational.summary.overallSuccessRate)}</span>
            <span className="chip">Run {formatPercent(preview.situational.summary.runRate)}</span>
            <span className="chip">Pass {formatPercent(preview.situational.summary.passRate)}</span>
            <span className="chip">Explosive {formatPercent(preview.situational.summary.explosivePlayRate)}</span>
          </div>
          <div className="table-like">
            {preview.situational.byDownDistance.map((item) => (
              <div className="timeline-card" key={item.key}>
                <div className="timeline-top">
                  <strong>{situationalLabel(item.key)}</strong>
                  <span className="mono">{item.plays} plays</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Runs {item.runs}</span>
                  <span className="chip">Passes {item.passes}</span>
                  <span className="chip">Success {formatPercent(item.successRate)}</span>
                  <span className="chip">YPP {item.yardsPerPlay}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <TendencyBreakdownPanel
          offenseLabel={offenseLabel}
          defenseLabel={defenseLabel}
          datasets={tendencyDatasets}
        />

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
            <ReportExportPanel gameId={gameId} initialExports={exports} canRequestExports={canRequestExports} />
            <div className="timeline-actions">
              {showAnalytics ? (
                <Link className="mini-button" href="/analytics">
                  Open analytics
                </Link>
              ) : null}
              {showInternalReview ? (
                <Link className="mini-button" href={`/games/${gameId}/review`}>
                  Open review workspace
                </Link>
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
              <div className="timeline-card stack-sm" key={player.gameRosterEntryId}>
                <div className="timeline-top">
                  <strong>
                    {player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}
                    {player.displayName}
                  </strong>
                  <span className="mono">{player.side}</span>
                </div>
                {(() => {
                  const grouped = splitTotalsByGroup(player.totals);
                  return (
                    <>
                      {grouped.offense.length > 0 ? (
                        <div className="pill-row">
                          <span className="chip">Offense</span>
                          {grouped.offense.map(([key, value]) => (
                            <span className="chip" key={`${player.gameRosterEntryId}-off-${key}`}>
                              {key.replaceAll("_", " ")}: {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {grouped.defense.length > 0 ? (
                        <div className="pill-row">
                          <span className="chip">Defense</span>
                          {grouped.defense.map(([key, value]) => (
                            <span className="chip" key={`${player.gameRosterEntryId}-def-${key}`}>
                              {key.replaceAll("_", " ")}: {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {grouped.special_teams.length > 0 ? (
                        <div className="pill-row">
                          <span className="chip">Special teams</span>
                          {grouped.special_teams.map(([key, value]) => (
                            <span className="chip" key={`${player.gameRosterEntryId}-st-${key}`}>
                              {key.replaceAll("_", " ")}: {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {grouped.offense.length === 0 &&
                      grouped.defense.length === 0 &&
                      grouped.special_teams.length === 0 ? (
                        <div className="kicker">No non-zero stat credits yet.</div>
                      ) : null}
                    </>
                  );
                })()}
                {statEntries(player.totals).length > 0 ? (
                  <div className="pill-row">
                    <span className="chip">All credits</span>
                    {statEntries(player.totals).map(([key, value]) => (
                      <span className="chip" key={`${player.gameRosterEntryId}-all-${key}`}>
                        {key.replaceAll("_", " ")}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="kicker">
                  Third down team context: {formatThirdDownLine(preview.teamStats.find((team) => team.side === player.side)?.totals ?? {})}
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
