import Link from "next/link";
import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { ReportExportPanel } from "@/components/reports/report-export-panel";
import { TendencyBreakdownPanel } from "@/components/reports/tendency-breakdown-panel";
import { hasCapability } from "@/lib/auth/roles";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { splitTotalsByGroup } from "@/lib/domain/stat-groups";
import { formatClock } from "@/lib/engine/clock";
import { buildMoneyDownCallTendency, buildSituationalCallSheet } from "@/lib/analytics/situational-call-sheet";
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

function distanceBucketLabel(key: string) {
  if (key === "short_1_3") return "1-3";
  if (key === "medium_4_6") return "4-6";
  if (key === "long_7_10") return "7-10";
  if (key === "very_long_11_plus") return "11+";
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
  const redZoneScores = statTotal(teamTotals, "red_zone_score");

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

function fieldCoordinate(
  position: { side: "home" | "away"; yardLine: number },
  offense: "home" | "away"
) {
  return position.side === offense ? position.yardLine : 100 - position.yardLine;
}

function isLegalTimelinePlay(
  item: Awaited<ReturnType<typeof getGameReportPreview>>["fullTimeline"][number]
) {
  const accepted = item.result.play.penalties.filter((penalty) => penalty.result === "accepted");
  const hasNoPlay = accepted.some((penalty) => penalty.noPlay);
  const hasOffsetting = item.result.play.penalties.some((penalty) => penalty.result === "offsetting");
  return !hasNoPlay && !hasOffsetting;
}

function redZoneFinishing(
  preview: Awaited<ReturnType<typeof getGameReportPreview>>,
  primarySide: "home" | "away"
) {
  const teamTotals = preview.teamStats.find((team) => team.side === primarySide)?.totals ?? {};
  const redZoneTrips = statTotal(teamTotals, "red_zone_trip");
  const redZoneScores = statTotal(teamTotals, "red_zone_score");
  const goalToGoTrips = statTotal(teamTotals, "goal_to_go_trip");
  const goalToGoScores = statTotal(teamTotals, "goal_to_go_score");
  const redZoneRate = redZoneTrips === 0 ? 0 : Number(((redZoneScores / redZoneTrips) * 100).toFixed(1));
  const goalToGoRate = goalToGoTrips === 0 ? 0 : Number(((goalToGoScores / goalToGoTrips) * 100).toFixed(1));

  const playerMap = new Map(
    preview.playerStats.map((player) => [player.gameRosterEntryId, player] as const)
  );
  const finishingMap = new Map<string, { redZoneTouches: number; goalToGoTouches: number; redZoneScores: number }>();

  for (const item of preview.fullTimeline) {
    if (item.result.play.possession !== primarySide || !isLegalTimelinePlay(item)) {
      continue;
    }

    const coordinate = fieldCoordinate(item.result.baseResult.metadata.previousSpot, primarySide);
    const inRedZone = coordinate >= 80;
    const inGoalToGo = coordinate >= 90;
    if (!inRedZone && !inGoalToGo) {
      continue;
    }

    const touchIds = [...new Set(
      item.result.play.participants
        .filter((participant) =>
          ["ball_carrier", "runner", "passer", "target"].includes(participant.role) &&
          participant.side === primarySide &&
          Boolean(participant.gameRosterEntryId)
        )
        .map((participant) => participant.gameRosterEntryId as string)
    )];

    for (const id of touchIds) {
      const current = finishingMap.get(id) ?? { redZoneTouches: 0, goalToGoTouches: 0, redZoneScores: 0 };
      if (inRedZone) current.redZoneTouches += 1;
      if (inGoalToGo) current.goalToGoTouches += 1;
      if (item.result.baseResult.metadata.scoringTeam === primarySide) {
        current.redZoneScores += 1;
      }
      finishingMap.set(id, current);
    }
  }

  const players = [...finishingMap.entries()]
    .map(([id, stats]) => {
      const player = playerMap.get(id);
      return {
        id,
        label: player ? `${player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}${player.displayName}` : id,
        ...stats
      };
    })
    .sort(
      (left, right) =>
        right.redZoneTouches - left.redZoneTouches ||
        right.goalToGoTouches - left.goalToGoTouches ||
        right.redZoneScores - left.redZoneScores
    )
    .slice(0, 6);

  return {
    redZoneTrips,
    redZoneScores,
    redZoneRate,
    goalToGoTrips,
    goalToGoScores,
    goalToGoRate,
    players
  };
}

function defensiveOutcomes(
  preview: Awaited<ReturnType<typeof getGameReportPreview>>,
  primarySide: "home" | "away"
) {
  const totals = preview.teamStats.find((team) => team.side === primarySide)?.totals ?? {};
  const opponentSide = primarySide === "home" ? "away" : "home";
  const opponentTotals = preview.teamStats.find((team) => team.side === opponentSide)?.totals ?? {};
  const thirdDownAllowed = statTotal(opponentTotals, "third_down_conversion");
  const thirdDownAttempts = statTotal(opponentTotals, "third_down_attempt");
  const pressureProxy =
    statTotal(totals, "sack") + statTotal(totals, "qb_hurry") + statTotal(totals, "pass_breakup");
  const takeaways =
    statTotal(totals, "turnover_gained") + statTotal(totals, "interception") + statTotal(totals, "fumble_recovery");

  const playerLeaders = preview.playerStats
    .filter((player) => player.side === primarySide)
    .map((player) => {
      const sacks = statTotal(player.totals, "sack");
      const tfl = statTotal(player.totals, "tfl");
      const hurries = statTotal(player.totals, "qb_hurry");
      const picks = statTotal(player.totals, "interception");
      const recoveries = statTotal(player.totals, "fumble_recovery");
      const forced = statTotal(player.totals, "forced_fumble");
      const impact = sacks + tfl + hurries + picks * 2 + recoveries + forced;

      return {
        id: player.gameRosterEntryId,
        label: `${player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}${player.displayName}`,
        sacks,
        tfl,
        hurries,
        picks,
        forced,
        recoveries,
        impact
      };
    })
    .filter((player) => player.impact > 0)
    .sort(
      (left, right) =>
        right.impact - left.impact ||
        right.sacks - left.sacks ||
        right.tfl - left.tfl ||
        right.hurries - left.hurries
    )
    .slice(0, 6);

  return {
    sacks: statTotal(totals, "sack"),
    tfl: statTotal(totals, "tfl"),
    hurries: statTotal(totals, "qb_hurry"),
    passBreakups: statTotal(totals, "pass_breakup"),
    takeaways,
    forcedFumbles: statTotal(totals, "forced_fumble"),
    defensiveTouchdowns: statTotal(totals, "return_touchdown"),
    pressureProxy,
    thirdDownAllowed,
    thirdDownAttempts,
    playerLeaders
  };
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
  const isMiddleSchoolTeam = /middle/i.test(record.team.level);
  const showAdvancedDefensiveDetail = !isMiddleSchoolTeam || isFeatureEnabled("advanced_participant_capture");
  const coachNotes = staffNotes(preview);
  const primarySide = record.game.homeAway;
  const coachInsights = topCoachInsights(preview, primarySide);
  const postGameChecklist = buildPostGameChecklist(preview, exports.length);
  const completeness = reportCompleteness(preview, exports.length);
  const situationalCallSheet = buildSituationalCallSheet(preview.fullTimeline);
  const moneyDownCalls = buildMoneyDownCallTendency(preview.fullTimeline);
  const finishing = redZoneFinishing(preview, primarySide);
  const defense = defensiveOutcomes(preview, primarySide);
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
          <strong>3rd/4th down call report</strong>
          <div className="table-like">
            {moneyDownCalls.map((item) => (
              <div className="timeline-card" key={`money-down-${item.down}`}>
                <div className="timeline-top">
                  <strong>{item.down}th down</strong>
                  <span className="mono">{item.attempts} attempts</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Run {item.runCalls}</span>
                  <span className="chip">Scramble {item.scrambleCalls}</span>
                  <span className="chip">Pass {item.passCalls}</span>
                  <span className="chip">Sack {item.sackCalls}</span>
                  <span className="chip">Other {item.otherCalls}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">
                    Conversions {item.conversions}/{item.attempts}
                  </span>
                  <span className="chip">Conversion rate {formatPercent(item.conversionRate)}</span>
                  <span className="chip">YPP {item.yardsPerPlay}</span>
                </div>
              </div>
            ))}
          </div>
          <strong>Down + distance calls</strong>
          <div className="table-like">
            {situationalCallSheet.byDownDistance.filter((item) => item.plays > 0).map((item) => (
              <div className="timeline-card" key={`${item.down}-${item.distanceBucket}`}>
                <div className="timeline-top">
                  <strong>
                    Down {item.down} · {distanceBucketLabel(item.distanceBucket)}
                  </strong>
                  <span className="mono">{item.plays} plays</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Runs {item.runs}</span>
                  <span className="chip">Passes {item.passes}</span>
                  <span className="chip">Other {item.other}</span>
                  <span className="chip">Run rate {formatPercent(item.runRate)}</span>
                  <span className="chip">Pass rate {formatPercent(item.passRate)}</span>
                  <span className="chip">Success {formatPercent(item.successRate)}</span>
                  <span className="chip">YPP {item.yardsPerPlay}</span>
                </div>
              </div>
            ))}
            {situationalCallSheet.byDownDistance.every((item) => item.plays === 0) ? (
              <div className="kicker">No legal down-and-distance snaps are logged yet.</div>
            ) : null}
          </div>
          <strong>Field zone calls</strong>
          <div className="table-like">
            {situationalCallSheet.byFieldZone.map((item) => (
              <div className="timeline-card" key={item.fieldZone}>
                <div className="timeline-top">
                  <strong>{situationalLabel(item.fieldZone)}</strong>
                  <span className="mono">{item.plays} plays</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Runs {item.runs}</span>
                  <span className="chip">Passes {item.passes}</span>
                  <span className="chip">Other {item.other}</span>
                  <span className="chip">Run rate {formatPercent(item.runRate)}</span>
                  <span className="chip">Pass rate {formatPercent(item.passRate)}</span>
                  <span className="chip">Success {formatPercent(item.successRate)}</span>
                  <span className="chip">YPP {item.yardsPerPlay}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Red-zone and goal-to-go finish</h2>
            <span className="chip">Finishing efficiency</span>
          </div>
          <div className="pill-row">
            <span className="chip">
              Red zone {finishing.redZoneScores}/{finishing.redZoneTrips}
            </span>
            <span className="chip">Red zone rate {formatPercent(finishing.redZoneRate)}</span>
            <span className="chip">
              Goal-to-go {finishing.goalToGoScores}/{finishing.goalToGoTrips}
            </span>
            <span className="chip">Goal-to-go rate {formatPercent(finishing.goalToGoRate)}</span>
          </div>
          <div className="table-like">
            {finishing.players.length === 0 ? <div className="kicker">No tracked red-zone player touches yet.</div> : null}
            {finishing.players.map((player) => (
              <div className="timeline-card" key={player.id}>
                <div className="timeline-top">
                  <strong>{player.label}</strong>
                  <span className="mono">{player.redZoneTouches} red-zone touches</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Goal-to-go touches {player.goalToGoTouches}</span>
                  <span className="chip">Red-zone scores {player.redZoneScores}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Defensive outcome summary</h2>
            <span className="chip">Game-planning defense lens</span>
          </div>
          <div className="pill-row">
            <span className="chip">Takeaways {defense.takeaways}</span>
            <span className="chip">Sacks {defense.sacks}</span>
            <span className="chip">TFL {defense.tfl}</span>
            <span className="chip">QB hurries {defense.hurries}</span>
            <span className="chip">PBU {defense.passBreakups}</span>
            <span className="chip">Pressure proxy {defense.pressureProxy}</span>
          </div>
          <div className="pill-row">
            <span className="chip">Forced fumbles {defense.forcedFumbles}</span>
            <span className="chip">Defensive TD {defense.defensiveTouchdowns}</span>
            <span className="chip">
              3rd-down allowed {defense.thirdDownAllowed}/{defense.thirdDownAttempts}
            </span>
          </div>
          <details>
            <summary className="kicker">Defensive stat definitions</summary>
            <div className="kicker">
              Pressure proxy = sacks + QB hurries + pass breakups. Impact = sacks + TFL + hurries + (2x interceptions) + recoveries + forced fumbles.
            </div>
          </details>
          {!showAdvancedDefensiveDetail ? (
            <div className="kicker">
              Middle school simplified mode: advanced player-impact detail is hidden by default.
            </div>
          ) : null}
          <div className="table-like">
            {!showAdvancedDefensiveDetail ? null : (
              <>
            {defense.playerLeaders.length === 0 ? <div className="kicker">No defensive impact credits logged yet.</div> : null}
            {defense.playerLeaders.map((player) => (
              <div className="timeline-card" key={player.id}>
                <div className="timeline-top">
                  <strong>{player.label}</strong>
                  <span className="chip">Impact {player.impact}</span>
                </div>
                <div className="pill-row">
                  <span className="chip">Sacks {player.sacks}</span>
                  <span className="chip">TFL {player.tfl}</span>
                  <span className="chip">Hurries {player.hurries}</span>
                  <span className="chip">Picks {player.picks}</span>
                  <span className="chip">Forced {player.forced}</span>
                  <span className="chip">Recoveries {player.recoveries}</span>
                </div>
              </div>
            ))}
              </>
            )}
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
            <ReportExportPanel
              gameId={gameId}
              initialExports={exports}
              canRequestExports={canRequestExports}
              scope={{
                organizationId: record.organizationId,
                teamId: record.team.id
              }}
            />
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
