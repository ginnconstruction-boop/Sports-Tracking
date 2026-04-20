import { notFound } from "next/navigation";
import { GameDayConsole } from "@/components/game-day/game-day-console";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameDaySnapshot } from "@/server/services/game-day-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

export default async function LiveEntryPage({ params }: PageProps) {
  if (!isFeatureEnabled("game_day_mode")) {
    notFound();
  }

  const { gameId } = await params;
  const [snapshot, record] = await Promise.all([
    getGameDaySnapshot(gameId, "read_only"),
    getGameAdminRecord(gameId)
  ]);

  return (
    <main className="live-entry-page-shell">
      <GameDayConsole gameId={gameId} record={record} initialSnapshot={snapshot} surface="live" />
    </main>
  );
}
