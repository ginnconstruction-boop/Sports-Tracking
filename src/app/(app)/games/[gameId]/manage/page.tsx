import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { GameAdminConsole } from "@/components/games/game-admin-console";
import { requireGameRole } from "@/server/services/game-access";
import { getDb } from "@/server/db/client";
import { opponents, venues } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getGameAdminRecord } from "@/server/services/game-admin-service";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export const dynamic = "force-dynamic";

export default async function GameManagePage({ params }: PageProps) {
  const { gameId } = await params;
  const record = await getGameAdminRecord(gameId);
  await requireGameRole(gameId, "read_only");

  const db = getDb();
  const [opponentItems, venueItems] = await Promise.all([
    db.query.opponents.findMany({
      where: eq(opponents.organizationId, record.organizationId)
    }),
    db.query.venues.findMany({
      where: eq(venues.organizationId, record.organizationId)
    })
  ]);

  const serializedOpponents = opponentItems.map((item) => ({
    id: item.id,
    organizationId: item.organizationId,
    schoolName: item.schoolName,
    mascot: item.mascot,
    shortCode: item.shortCode,
    archivedAt: item.archivedAt?.toISOString() ?? null
  }));

  const serializedVenues = venueItems.map((item) => ({
    id: item.id,
    organizationId: item.organizationId,
    name: item.name,
    fieldName: item.fieldName,
    addressLine1: item.addressLine1,
    addressLine2: item.addressLine2,
    city: item.city,
    state: item.state,
    postalCode: item.postalCode
  }));

  return (
    <AppShell
      current="manage"
      gameId={gameId}
      title="Game admin before the sideline gets chaotic."
      subtitle="Tune schedule details, venue, status, and game routing from one operational surface tied to the same game record used by Game Day and reports."
    >
      <section className="section-grid">
        <GameContextHeader record={record} />
        <GameAdminConsole record={record} opponents={serializedOpponents} venues={serializedVenues} />
      </section>
    </AppShell>
  );
}
