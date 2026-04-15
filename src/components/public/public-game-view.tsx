import { formatClock } from "@/lib/engine/clock";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import type { GameDaySnapshot } from "@/lib/domain/game-day";
import type { GameReportDocument } from "@/lib/domain/reports";
import { brandingCssVariables, type OrganizationBranding } from "@/lib/domain/organization-settings";

type PublicLiveProps = {
  mode: "live";
  snapshot: GameDaySnapshot;
  record: GameAdminRecord;
  branding?: OrganizationBranding | null;
};

type PublicReportProps = {
  mode: "report";
  report: GameReportDocument;
  record: GameAdminRecord;
  branding?: OrganizationBranding | null;
};

type Props = PublicLiveProps | PublicReportProps;

export function PublicGameView(props: Props) {
  const palette = brandingCssVariables(props.branding);
  const title =
    props.mode === "live"
      ? `${props.record.sideLabels.away} at ${props.record.sideLabels.home}`
      : `${props.report.context.awayTeam} at ${props.report.context.homeTeam}`;

  return (
    <div className="page-shell stack-lg" style={palette}>
      <section className="poster-panel public-shell" style={{ padding: "28px 28px 34px" }}>
        <div className="stack-md">
          <span className="eyebrow">
            {props.branding?.publicDisplayName || props.record.team.name} public tracker
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 4rem)" }}>{title}</h1>
          <p className="kicker" style={{ color: "rgba(248,243,232,0.82)" }}>
            {props.record.season.label} · {props.record.game.status.replaceAll("_", " ")} ·{" "}
            {props.record.venue?.name || "Venue TBD"}
          </p>
        </div>
      </section>

      {props.mode === "live" ? (
        <>
          <section className="three-column">
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Score</h2>
              <div className="timeline-top">
                <strong>{props.snapshot.awayTeam}</strong>
                <span className="mono">{props.snapshot.currentState.score.away}</span>
              </div>
              <div className="timeline-top">
                <strong>{props.snapshot.homeTeam}</strong>
                <span className="mono">{props.snapshot.currentState.score.home}</span>
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Game state</h2>
              <div className="pill-row">
                <span className="chip">Q{props.snapshot.currentState.quarter}</span>
                <span className="chip">{formatClock(props.snapshot.currentState.clockSeconds)}</span>
                <span className="chip">{props.snapshot.currentState.phase}</span>
                <span className="chip">
                  {props.snapshot.currentState.down}&amp;{props.snapshot.currentState.distance}
                </span>
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Possession</h2>
              <div className="kicker">
                {props.snapshot.currentState.possession === "home" ? props.snapshot.homeTeam : props.snapshot.awayTeam} on{" "}
                {props.snapshot.currentState.ballOn.side === "home" ? "own" : "opp"}{" "}
                {props.snapshot.currentState.ballOn.yardLine}
              </div>
            </div>
          </section>

          <section className="two-column">
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Recent plays</h2>
                <span className="chip">{props.snapshot.recentPlays.length}</span>
              </div>
              <div className="table-like">
                {props.snapshot.recentPlays.map((play) => (
                  <div className="timeline-card" key={play.playId}>
                    <div className="timeline-top">
                      <strong>{play.summary}</strong>
                      <span className="mono">
                        Q{play.quarter} {formatClock(play.clockSeconds)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Drive summary</h2>
                <span className="chip">{props.snapshot.driveSummaries.length}</span>
              </div>
              <div className="table-like">
                {props.snapshot.driveSummaries.map((drive) => (
                  <div className="timeline-card" key={drive.id}>
                    <div className="timeline-top">
                      <strong>{drive.side === "home" ? props.snapshot.homeTeam : props.snapshot.awayTeam}</strong>
                      <span className="mono">{drive.result.replaceAll("_", " ")}</span>
                    </div>
                    <div className="pill-row">
                      <span className="chip">{drive.playCount} plays</span>
                      <span className="chip">{drive.yardsGained} yards</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
          <section className="two-column">
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Turnovers</h2>
                <span className="chip">{props.snapshot.turnoverTracker.length}</span>
              </div>
              <div className="table-like">
                {props.snapshot.turnoverTracker.slice(0, 5).map((item) => (
                  <div className="timeline-card" key={`public-turnover-${item.playId}`}>
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
                <h2 style={{ margin: 0 }}>Penalties</h2>
                <span className="chip">{props.snapshot.penaltyTracker.length}</span>
              </div>
              <div className="table-like">
                {props.snapshot.penaltyTracker.slice(0, 5).map((item) => (
                  <div className="timeline-card" key={`public-penalty-${item.playId}`}>
                    <div className="timeline-top">
                      <strong>{item.summary}</strong>
                      <span className="mono">{item.sequence}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </>
      ) : (
        <>
          <section className="three-column">
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Final</h2>
              <div className="mono">
                {props.report.finalSummary.score.away}-{props.report.finalSummary.score.home}
              </div>
              <div className="kicker">{props.report.finalSummary.note}</div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Highlights</h2>
              <div className="kicker">{props.report.highlights.lastScoringSummary || "No scoring summary."}</div>
              <div className="kicker">{props.report.highlights.lastTurnoverSummary || "No turnover summary."}</div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h2 style={{ margin: 0 }}>Drives</h2>
              <div className="pill-row">
                <span className="chip">{props.report.finalSummary.totalDrives} drives</span>
                <span className="chip">{props.report.finalSummary.totalPlays} plays</span>
              </div>
            </div>
          </section>
          <section className="two-column">
            <section className="section-card pad-lg stack-md">
              <h2 style={{ margin: 0 }}>Scoring summary</h2>
              <div className="table-like">
                {props.report.scoringSummary.map((item) => (
                  <div className="timeline-card" key={item.sequence}>
                    <div className="timeline-top">
                      <strong>{item.result.summary}</strong>
                      <span className="mono">
                        {item.result.finalState.score.away}-{item.result.finalState.score.home}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="section-card pad-lg stack-md">
              <h2 style={{ margin: 0 }}>Team stats</h2>
              <div className="table-like">
                {props.report.teamStats.map((team) => (
                  <div className="timeline-card" key={team.side}>
                    <div className="timeline-top">
                      <strong>{team.label}</strong>
                    </div>
                    <div className="pill-row">
                      {Object.entries(team.totals)
                        .filter(([, value]) => typeof value === "number" && value !== 0)
                        .slice(0, 8)
                        .map(([key, value]) => (
                          <span className="chip" key={key}>
                            {key.replaceAll("_", " ")}: {value}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
