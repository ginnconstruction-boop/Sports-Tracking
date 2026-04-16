import Link from "next/link";
import { AppShell } from "@/components/chrome/app-shell";
import { ResumeLiveGameCard } from "@/components/home/resume-live-game-card";
import { SampleSeedButton } from "@/components/home/sample-seed-button";
import { isFeatureEnabled } from "@/lib/features/runtime";

const architecturePillars = [
  "Play log is authoritative",
  "State rebuilds after edits",
  "Penalty logic is first-class",
  "Tablet-first game-day workflow",
  "Offline local session support",
  "Exports derive from reports"
];

export default function HomePage() {
  const showResume = isFeatureEnabled("resume_live_game");
  const showDebugTools = isFeatureEnabled("internal_debug_tools");

  return (
    <AppShell
      current="home"
      title="Sideline speed first. Totals second."
      subtitle="Tracking the Game is scaffolded around a rebuildable football play log, not a fragile stats dashboard. V1 is shaped for the pressure of live entry on the sideline."
    >
      <section className="two-column">
        <div className="section-card pad-lg stack-lg">
          <div className="stack-sm">
            <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
              Product direction
            </span>
            <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
              One game engine, many derived views.
            </h2>
            <p className="kicker">
              The web app is split into roster and schedule management, the live game engine, the rules and stat
              projector, reports and exports, and the offline sync layer. That keeps the fast sideline surface
              clean while still supporting multi-season reporting later.
            </p>
          </div>
          <div className="pill-row">
            {architecturePillars.map((item) => (
              <span className="pill" key={item}>
                {item}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button-primary" href="/onboarding">
              Start onboarding
            </Link>
            <Link className="button-secondary-light" href="/setup">
              Open setup
            </Link>
            {showDebugTools ? <SampleSeedButton /> : null}
          </div>
        </div>

        <div className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>V1 scope guardrails</h2>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Sport</div>
              <div className="metric-value">Tackle football</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Primary operator model</div>
              <div className="metric-value">One live writer</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Stat model</div>
              <div className="metric-value">Fixed templates</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Offline posture</div>
              <div className="metric-value">Local-first</div>
            </div>
          </div>
        </div>
      </section>
      {showResume ? <ResumeLiveGameCard /> : null}
    </AppShell>
  );
}
