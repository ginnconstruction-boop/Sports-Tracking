import { AppShell } from "@/components/chrome/app-shell";
import { GameDayConsole } from "@/components/game-day/game-day-console";
import { GameContextHeader } from "@/components/games/game-context-header";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { getGameAdminRecord } from "@/server/services/game-admin-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

export default async function GameDayPage({ params }: PageProps) {
  if (!isFeatureEnabled("game_day_mode")) {
    notFound();
  }
  const { gameId } = await params;
  const [snapshot, record] = await Promise.all([
    getGameDaySnapshot(gameId, "read_only"),
    getGameAdminRecord(gameId)
  ]);

  return (
    <AppShell
      gameId={gameId}
      current="gameday"
      title="Game Day Mode"
      subtitle="A dedicated sideline surface for fast live entry: large tap targets, jersey-first shortcuts, visible game state, and correction tools without leaving the screen."
    >
      <section className="section-grid">
        <GameContextHeader record={record} compact />
        <GameDayConsole gameId={gameId} initialSnapshot={snapshot} />
      </section>
    </AppShell>
  );
}
