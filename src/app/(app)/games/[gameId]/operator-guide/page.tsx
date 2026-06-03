import Link from "next/link";
import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { PrintQuickSheetButton } from "@/components/games/print-quick-sheet-button";
import { getGameAdminRecord } from "@/server/services/game-admin-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function OperatorGuidePage({ params }: PageProps) {
  const { gameId } = await params;
  const record = await getGameAdminRecord(gameId);

  return (
    <AppShell
      current="guide"
      gameId={gameId}
      navMode="game_day_only"
      title="Operator guide for fast, clean game tracking."
      subtitle="Use this as the sideline runbook before kickoff, during drives, and immediately after the final whistle."
    >
      <section className="section-grid">
        <GameContextHeader record={record} compact />

        <section className="three-column">
          <section className="section-card pad-lg stack-md">
            <h2 style={{ margin: 0 }}>Pre-game checklist</h2>
            <div className="table-like">
              <div className="timeline-card"><strong>1. Confirm roster</strong><div className="kicker">Verify active players and jersey numbers before live entry.</div></div>
              <div className="timeline-card"><strong>2. Verify kickoff + venue</strong><div className="kicker">Confirm kickoff, arrival, and venue details in Game Admin.</div></div>
              <div className="timeline-card"><strong>3. Assign writer device</strong><div className="kicker">Open Live Entry on one primary device first to hold writer lease.</div></div>
            </div>
          </section>

          <section className="section-card pad-lg stack-md">
            <h2 style={{ margin: 0 }}>Live-drive workflow</h2>
            <div className="table-like">
              <div className="timeline-card"><strong>1. Log play type first</strong><div className="kicker">Capture run/pass/special teams quickly, then fill players and result.</div></div>
              <div className="timeline-card"><strong>2. Use quick edits</strong><div className="kicker">Use Edit last and Insert before for immediate cleanup.</div></div>
              <div className="timeline-card"><strong>3. Recover only when needed</strong><div className="kicker">Use situation or score override only if game flow must continue.</div></div>
            </div>
          </section>

          <section className="section-card pad-lg stack-md">
            <h2 style={{ margin: 0 }}>Post-game closeout</h2>
            <div className="table-like">
              <div className="timeline-card"><strong>1. Final pass on recent plays</strong><div className="kicker">Check quarter transitions, turnovers, and scoring sequence.</div></div>
              <div className="timeline-card"><strong>2. Open reports and verify totals</strong><div className="kicker">Review the coach-ready launch set, then run PDF/XLSX exports before staff handoff.</div></div>
              <div className="timeline-card"><strong>3. Mark final in Game Admin</strong><div className="kicker">Lock final status after the staff signs off on corrections and exports. Archive later if you want it out of the active list.</div></div>
            </div>
          </section>
        </section>

        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Preferred pilot flow</h2>
            <span className="chip">One operator path</span>
          </div>
          <div className="table-like">
            <div className="timeline-card"><strong>1. Setup and roster</strong><div className="kicker">Confirm the game, roster, and kickoff details in Setup and Game Admin first.</div></div>
            <div className="timeline-card"><strong>2. Single writer device</strong><div className="kicker">Use one primary Live Entry device so the play log stays clean and the writer lease stays predictable.</div></div>
            <div className="timeline-card"><strong>3. Corrections only when needed</strong><div className="kicker">Use play edits first, then situation or score corrections only when the game must keep moving.</div></div>
            <div className="timeline-card"><strong>4. Reports before final lock</strong><div className="kicker">Check summary, situational call sheet, money down, and defensive outcomes before export.</div></div>
            <div className="timeline-card"><strong>5. Coach handoff</strong><div className="kicker">Share the PDF/XLSX packet, then return to Game Admin to mark final.</div></div>
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>Quick links</h2>
          <div className="timeline-actions">
            <Link className="mini-button" href={`/games/${gameId}/manage`}>Game admin</Link>
            <Link className="mini-button" href={`/games/${gameId}/gameday`}>Game Day overview</Link>
            <Link className="mini-button" href={`/games/${gameId}/live`}>Live Entry</Link>
            <Link className="mini-button" href={`/games/${gameId}/reports`}>Reports</Link>
            <PrintQuickSheetButton />
          </div>
        </section>

        <section className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>Pilot role presets</h2>
          <div className="table-like">
            <div className="timeline-card">
              <strong>Head Coach preset</strong>
              <div className="kicker">Can manage games, review reports, and approve final lock/reopen actions.</div>
            </div>
            <div className="timeline-card">
              <strong>Stat Operator preset</strong>
              <div className="kicker">Can run live entry, corrections, and writer handoff without extra admin controls.</div>
            </div>
            <div className="timeline-card">
              <strong>View Only preset</strong>
              <div className="kicker">Can monitor game state and reports, but cannot change play log or status.</div>
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
