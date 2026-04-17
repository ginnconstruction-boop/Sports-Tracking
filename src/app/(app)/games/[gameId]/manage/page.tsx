import { AppShell } from "@/components/chrome/app-shell";
import { GameContextHeader } from "@/components/games/game-context-header";
import { GameAdminConsole } from "@/components/games/game-admin-console";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGameAdminRecord } from "@/server/services/game-admin-service";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

export const dynamic = "force-dynamic";

type OpponentRow = {
  id: string;
  organization_id: string;
  school_name: string;
  mascot: string | null;
  short_code: string | null;
  archived_at: string | null;
};

type VenueRow = {
  id: string;
  organization_id: string;
  name: string;
  field_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export default async function GameManagePage({ params }: PageProps) {
  const { gameId } = await params;
  const record = await getGameAdminRecord(gameId);
  const supabaseAdmin = createSupabaseAdminClient();
  const [opponentsResult, venuesResult] = await Promise.all([
    supabaseAdmin
      .from("opponents")
      .select("id,organization_id,school_name,mascot,short_code,archived_at")
      .eq("organization_id", record.organizationId)
      .returns<OpponentRow[]>(),
    supabaseAdmin
      .from("venues")
      .select("id,organization_id,name,field_name,address_line_1,address_line_2,city,state,postal_code")
      .eq("organization_id", record.organizationId)
      .returns<VenueRow[]>()
  ]);

  if (opponentsResult.error) {
    throw new Error(opponentsResult.error.message);
  }

  if (venuesResult.error) {
    throw new Error(venuesResult.error.message);
  }

  const opponentItems = opponentsResult.data ?? [];
  const venueItems = venuesResult.data ?? [];

  const serializedOpponents = opponentItems.map((item) => ({
    id: item.id,
    organizationId: item.organization_id,
    schoolName: item.school_name,
    mascot: item.mascot,
    shortCode: item.short_code,
    archivedAt: item.archived_at
  }));

  const serializedVenues = venueItems.map((item) => ({
    id: item.id,
    organizationId: item.organization_id,
    name: item.name,
    fieldName: item.field_name,
    addressLine1: item.address_line_1,
    addressLine2: item.address_line_2,
    city: item.city,
    state: item.state,
    postalCode: item.postal_code
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
