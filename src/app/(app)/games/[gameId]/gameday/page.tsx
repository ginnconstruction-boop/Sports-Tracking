import { AppShell } from "@/components/chrome/app-shell";
import { GameDayConsole } from "@/components/game-day/game-day-console";
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
      title="Game Day Overview"
      subtitle="Overview, review, correction, and navigation for the current game. Jump into Live Entry when you need a distraction-free sideline input surface."
    >
      <section className="section-grid">
        <GameDayConsole gameId={gameId} record={record} initialSnapshot={snapshot} />
      </section>
    </AppShell>
  );
}
