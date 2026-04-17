import type { MembershipRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";

type GameAccessGameRow = {
  id: string;
  season_id: string;
  opponent_id: string;
  venue_id: string | null;
  status: string;
  kickoff_at: string | null;
  arrival_at: string | null;
  report_at: string | null;
  home_away: "home" | "away";
  weather_conditions: string | null;
  field_conditions: string | null;
  staff_notes: string | null;
  opponent_prep_notes: string | null;
  logistics_notes: string | null;
  roster_confirmed_at: string | null;
  public_share_token: string;
  public_live_enabled: boolean;
  public_reports_enabled: boolean;
  current_revision: number;
  last_rebuilt_at: string | null;
};

type GameAccessSeasonRow = {
  id: string;
  team_id: string;
  label: string;
  year: number;
};

type GameAccessTeamRow = {
  id: string;
  organization_id: string;
  name: string;
  level: string;
};

async function getGameContext(gameId: string) {
  const supabaseAdmin = createSupabaseAdminClient();

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select(
      "id,season_id,opponent_id,venue_id,status,kickoff_at,arrival_at,report_at,home_away,weather_conditions,field_conditions,staff_notes,opponent_prep_notes,logistics_notes,roster_confirmed_at,public_share_token,public_live_enabled,public_reports_enabled,current_revision,last_rebuilt_at"
    )
    .eq("id", gameId)
    .maybeSingle<GameAccessGameRow>();

  if (gameError) {
    throw new Error(gameError.message);
  }

  if (!game) {
    throw new Error("Game not found.");
  }

  const { data: season, error: seasonError } = await supabaseAdmin
    .from("seasons")
    .select("id,team_id,label,year")
    .eq("id", game.season_id)
    .maybeSingle<GameAccessSeasonRow>();

  if (seasonError) {
    throw new Error(seasonError.message);
  }

  if (!season) {
    throw new Error("Season not found.");
  }

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("id,organization_id,name,level")
    .eq("id", season.team_id)
    .maybeSingle<GameAccessTeamRow>();

  if (teamError) {
    throw new Error(teamError.message);
  }

  if (!team) {
    throw new Error("Team not found.");
  }

  return {
    game,
    season,
    team
  };
}

export async function requireGameRole(gameId: string, minimumRole: MembershipRole) {
  const context = await getGameContext(gameId);
  await requireOrganizationRole(context.team.organization_id, minimumRole);

  return {
    game: {
      id: context.game.id,
      seasonId: context.game.season_id,
      opponentId: context.game.opponent_id,
      venueId: context.game.venue_id,
      status: context.game.status,
      kickoffAt: context.game.kickoff_at,
      arrivalAt: context.game.arrival_at,
      reportAt: context.game.report_at,
      homeAway: context.game.home_away,
      weatherConditions: context.game.weather_conditions,
      fieldConditions: context.game.field_conditions,
      staffNotes: context.game.staff_notes,
      opponentPrepNotes: context.game.opponent_prep_notes,
      logisticsNotes: context.game.logistics_notes,
      rosterConfirmedAt: context.game.roster_confirmed_at,
      publicShareToken: context.game.public_share_token,
      publicLiveEnabled: context.game.public_live_enabled,
      publicReportsEnabled: context.game.public_reports_enabled,
      currentRevision: context.game.current_revision,
      lastRebuiltAt: context.game.last_rebuilt_at
    },
    season: {
      id: context.season.id,
      teamId: context.season.team_id,
      label: context.season.label,
      year: context.season.year
    },
    team: {
      id: context.team.id,
      organizationId: context.team.organization_id,
      name: context.team.name,
      level: context.team.level
    }
  };
}

export { getGameContext };
