import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { GameReviewWorkspace } from "@/components/games/game-review-workspace";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameDaySnapshot } from "@/server/services/game-day-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    gameId: string;
  }>;
};

export default async function GameReviewPage({ params }: PageProps) {
  if (!isFeatureEnabled("internal_debug_tools")) {
    notFound();
  }
  const { gameId } = await params;
  const [snapshot, record] = await Promise.all([getGameDaySnapshot(gameId, "read_only"), getGameAdminRecord(gameId)]);

  return (
    <AppShell
      gameId={gameId}
      current="review"
      title="Postgame review stays tied to the play log."
      subtitle="Tags, coaching notes, and film references are attached to exact plays, so review work stays aligned with live stat history and report output."
    >
      <section className="section-grid">
        <GameContextHeader record={record} compact />
        <GameReviewWorkspace gameId={gameId} initialSnapshot={snapshot} record={record} />
      </section>
    </AppShell>
  );
}
