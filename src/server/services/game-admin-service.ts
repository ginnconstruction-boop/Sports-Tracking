import type { GameAdminRecord } from "@/lib/domain/game-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getGameContext } from "@/server/services/game-access";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  public_display_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  wordmark_path: string | null;
};

type OpponentRow = {
  id: string;
  school_name: string;
  mascot: string | null;
  short_code: string | null;
};

type VenueRow = {
  id: string;
  name: string;
  field_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

type GameSideRow = {
  side: "home" | "away";
  display_name: string | null;
};

export async function getGameAdminRecord(
  gameId: string,
  options: { skipAuth?: boolean } = {}
): Promise<GameAdminRecord> {
  const context = await getGameContext(gameId);
  const supabaseAdmin = createSupabaseAdminClient();

  if (!options.skipAuth) {
    await requireOrganizationRole(context.team.organization_id, "read_only");
  }

  const [organizationResult, opponentResult, venueResult, sidesResult] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id,name,slug,public_display_name,primary_color,secondary_color,accent_color,wordmark_path")
      .eq("id", context.team.organization_id)
      .maybeSingle<OrganizationRow>(),
    supabaseAdmin
      .from("opponents")
      .select("id,school_name,mascot,short_code")
      .eq("id", context.game.opponent_id)
      .maybeSingle<OpponentRow>(),
    context.game.venue_id
      ? supabaseAdmin
          .from("venues")
          .select("id,name,field_name,address_line_1,address_line_2,city,state,postal_code")
          .eq("id", context.game.venue_id)
          .maybeSingle<VenueRow>()
      : Promise.resolve({ data: null as VenueRow | null, error: null }),
    supabaseAdmin
      .from("game_sides")
      .select("side,display_name")
      .eq("game_id", gameId)
      .returns<GameSideRow[]>()
  ]);

  if (organizationResult.error) {
    throw new Error(organizationResult.error.message);
  }

  if (opponentResult.error) {
    throw new Error(opponentResult.error.message);
  }

  if (venueResult.error) {
    throw new Error(venueResult.error.message);
  }

  if (sidesResult.error) {
    throw new Error(sidesResult.error.message);
  }

  const organization = organizationResult.data;
  const opponent = opponentResult.data;
  const venue = venueResult.data;
  const sides = sidesResult.data ?? [];

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  return {
    game: {
      id: context.game.id,
      status: context.game.status,
      kickoffAt: context.game.kickoff_at ?? null,
      arrivalAt: context.game.arrival_at ?? null,
      reportAt: context.game.report_at ?? null,
      homeAway: context.game.home_away,
      weatherConditions: context.game.weather_conditions,
      fieldConditions: context.game.field_conditions,
      staffNotes: context.game.staff_notes,
      opponentPrepNotes: context.game.opponent_prep_notes,
      logisticsNotes: context.game.logistics_notes,
      rosterConfirmedAt: context.game.roster_confirmed_at ?? null,
      publicShareToken: context.game.public_share_token,
      publicLiveEnabled: context.game.public_live_enabled,
      publicReportsEnabled: context.game.public_reports_enabled,
      currentRevision: context.game.current_revision,
      lastRebuiltAt: context.game.last_rebuilt_at ?? null
    },
    organizationId: context.team.organization_id,
    branding: organization
      ? {
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          publicDisplayName: organization.public_display_name,
          primaryColor: organization.primary_color,
          secondaryColor: organization.secondary_color,
          accentColor: organization.accent_color,
          wordmarkPath: organization.wordmark_path
        }
      : null,
    team: {
      id: context.team.id,
      name: context.team.name,
      level: context.team.level
    },
    season: {
      id: context.season.id,
      label: context.season.label,
      year: context.season.year
    },
    opponent: {
      id: opponent.id,
      schoolName: opponent.school_name,
      mascot: opponent.mascot,
      shortCode: opponent.short_code
    },
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          fieldName: venue.field_name,
          addressLine1: venue.address_line_1,
          addressLine2: venue.address_line_2,
          city: venue.city,
          state: venue.state,
          postalCode: venue.postal_code
        }
      : null,
    sideLabels: {
      home: sides.find((side) => side.side === "home")?.display_name ?? "Home",
      away: sides.find((side) => side.side === "away")?.display_name ?? "Away"
    }
  };
}
