import {
  type CreateGameInput,
  type CreateOpponentInput,
  type CreateSeasonInput,
  type CreateTeamInput,
  type CreateVenueInput,
  type ReplaceSeasonRosterInput,
  type UpdateGameInput,
  type UpdateOpponentInput,
  type UpdateSeasonInput,
  type UpdateTeamInput,
  type UpdateVenueInput
} from "@/lib/contracts/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";

type TeamRow = {
  id: string;
  organization_id: string;
  name: string;
  level: string;
  archived_at: string | null;
};

type SeasonRow = {
  id: string;
  team_id: string;
  label: string;
  year: number;
  is_active: boolean;
  archived_at: string | null;
};

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

type GameRow = {
  id: string;
  season_id: string;
  opponent_id: string;
  venue_id: string | null;
  kickoff_at: string | null;
  arrival_at: string | null;
  report_at: string | null;
  home_away: "home" | "away";
  status: string;
  weather_conditions: string | null;
  field_conditions: string | null;
  staff_notes: string | null;
  opponent_prep_notes: string | null;
  logistics_notes: string | null;
  roster_confirmed_at: string | null;
  public_live_enabled: boolean;
  public_reports_enabled: boolean;
  current_revision: number;
};

type GameSideRow = {
  id: string;
  game_id: string;
  side: "home" | "away";
  is_primary_team: boolean;
  display_name: string;
  short_code: string | null;
};

type SeasonRosterEntryRow = {
  id: string;
  season_id: string;
  player_id: string;
  jersey_number: string;
  grade: string | null;
  position: string | null;
  offense_role: boolean;
  defense_role: boolean;
  special_teams_role: boolean;
};

type PlayerRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  default_position: string | null;
};

type JoinedRosterRow = {
  id: string;
  jersey_number: string;
  grade: string | null;
  position: string | null;
  offense_role: boolean;
  defense_role: boolean;
  special_teams_role: boolean;
  players:
    | {
        first_name: string;
        last_name: string;
        preferred_name: string | null;
      }
    | {
        first_name: string;
        last_name: string;
        preferred_name: string | null;
      }[]
    | null;
};

type RosterInputPlayer = ReplaceSeasonRosterInput["players"][number];

function unwrapSingle<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapJoinedRosterRow(row: JoinedRosterRow) {
  const player = unwrapSingle(row.players);

  return {
    rosterId: row.id,
    jerseyNumber: row.jersey_number,
    grade: row.grade,
    position: row.position,
    offenseRole: row.offense_role,
    defenseRole: row.defense_role,
    specialTeamsRole: row.special_teams_role,
    firstName: player?.first_name ?? "",
    lastName: player?.last_name ?? "",
    preferredName: player?.preferred_name ?? null
  };
}

function mapGameRow(row: GameRow) {
  return {
    id: row.id,
    seasonId: row.season_id,
    opponentId: row.opponent_id,
    venueId: row.venue_id,
    kickoffAt: row.kickoff_at,
    arrivalAt: row.arrival_at,
    reportAt: row.report_at,
    homeAway: row.home_away,
    status: row.status,
    weatherConditions: row.weather_conditions,
    fieldConditions: row.field_conditions,
    staffNotes: row.staff_notes,
    opponentPrepNotes: row.opponent_prep_notes,
    logisticsNotes: row.logistics_notes,
    rosterConfirmedAt: row.roster_confirmed_at,
    publicLiveEnabled: row.public_live_enabled,
    publicReportsEnabled: row.public_reports_enabled,
    currentRevision: row.current_revision
  };
}

async function getTeamRow(teamId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id,organization_id,name,level,archived_at")
    .eq("id", teamId)
    .maybeSingle<TeamRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getSeasonRow(seasonId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .select("id,team_id,label,year,is_active,archived_at")
    .eq("id", seasonId)
    .maybeSingle<SeasonRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getOpponentRow(opponentId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("opponents")
    .select("id,organization_id,school_name,mascot,short_code,archived_at")
    .eq("id", opponentId)
    .maybeSingle<OpponentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getVenueRow(venueId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id,organization_id,name,field_name,address_line_1,address_line_2,city,state,postal_code")
    .eq("id", venueId)
    .maybeSingle<VenueRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getGameRow(gameId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("games")
    .select(
      "id,season_id,opponent_id,venue_id,kickoff_at,arrival_at,report_at,home_away,status,weather_conditions,field_conditions,staff_notes,opponent_prep_notes,logistics_notes,roster_confirmed_at,public_live_enabled,public_reports_enabled,current_revision"
    )
    .eq("id", gameId)
    .maybeSingle<GameRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function countRows(table: string, column: string, value: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function ensureSeasonForOrganization(
  input: Pick<ReplaceSeasonRosterInput, "organizationId" | "seasonId">
) {
  const season = await getSeasonRow(input.seasonId);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team || team.organization_id !== input.organizationId) {
    throw new Error("Season does not belong to the requested organization.");
  }

  await requireOrganizationRole(input.organizationId, "head_coach");

  return { season, team };
}

async function loadSeasonRosterRows(seasonId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("season_roster_entries")
    .select(
      "id,jersey_number,grade,position,offense_role,defense_role,special_teams_role,players!inner(first_name,last_name,preferred_name)"
    )
    .eq("season_id", seasonId)
    .order("jersey_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as JoinedRosterRow[] | null | undefined)?.map(mapJoinedRosterRow) ?? [];
}

async function findOrCreatePlayerForRoster(
  organizationId: string,
  entry: RosterInputPlayer,
  { updateExisting }: { updateExisting: boolean }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: existingPlayer, error: existingPlayerError } = await supabaseAdmin
    .from("players")
    .select("id,organization_id,first_name,last_name,preferred_name,default_position")
    .eq("organization_id", organizationId)
    .eq("first_name", entry.firstName)
    .eq("last_name", entry.lastName)
    .maybeSingle<PlayerRow>();

  if (existingPlayerError) {
    throw new Error(existingPlayerError.message);
  }

  if (existingPlayer) {
    if (updateExisting) {
      const { data: updatedPlayer, error: updatePlayerError } = await supabaseAdmin
        .from("players")
        .update({
          preferred_name: entry.preferredName || null,
          default_position: entry.position || null
        })
        .eq("id", existingPlayer.id)
        .select("id,organization_id,first_name,last_name,preferred_name,default_position")
        .single<PlayerRow>();

      if (updatePlayerError) {
        throw new Error(updatePlayerError.message);
      }

      return updatedPlayer;
    }

    return existingPlayer;
  }

  const { data: insertedPlayer, error: insertPlayerError } = await supabaseAdmin
    .from("players")
    .insert({
      organization_id: organizationId,
      first_name: entry.firstName,
      last_name: entry.lastName,
      preferred_name: entry.preferredName || null,
      default_position: entry.position || null
    })
    .select("id,organization_id,first_name,last_name,preferred_name,default_position")
    .single<PlayerRow>();

  if (insertPlayerError) {
    throw new Error(insertPlayerError.message);
  }

  return insertedPlayer;
}

export async function createTeam(input: CreateTeamInput) {
  await requireOrganizationRole(input.organizationId, "admin");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      level: input.level
    })
    .select("id,organization_id,name,level,archived_at")
    .single<TeamRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateTeam(input: UpdateTeamInput) {
  await requireOrganizationRole(input.organizationId, "admin");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("teams")
    .update({
      name: input.name,
      level: input.level,
      archived_at: input.archived ? new Date().toISOString() : null
    })
    .eq("id", input.teamId)
    .eq("organization_id", input.organizationId)
    .select("id,organization_id,name,level,archived_at")
    .maybeSingle<TeamRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Team not found.");
  }

  return data;
}

export async function createSeason(input: CreateSeasonInput) {
  const team = await getTeamRow(input.teamId);

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organization_id, "head_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .insert({
      team_id: input.teamId,
      label: input.label,
      year: input.year,
      is_active: input.isActive
    })
    .select("id,team_id,label,year,is_active,archived_at")
    .single<SeasonRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateSeason(input: UpdateSeasonInput) {
  const existing = await getSeasonRow(input.seasonId);

  if (!existing) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(existing.team_id);

  if (!team || team.id !== input.teamId) {
    throw new Error("Season does not belong to the selected team.");
  }

  await requireOrganizationRole(team.organization_id, "head_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .update({
      label: input.label,
      year: input.year,
      is_active: input.isActive,
      archived_at: input.archived ? new Date().toISOString() : null
    })
    .eq("id", input.seasonId)
    .select("id,team_id,label,year,is_active,archived_at")
    .single<SeasonRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createOpponent(input: CreateOpponentInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("opponents")
    .insert({
      organization_id: input.organizationId,
      school_name: input.schoolName,
      mascot: input.mascot || null,
      short_code: input.shortCode || null
    })
    .select("id,organization_id,school_name,mascot,short_code,archived_at")
    .single<OpponentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateOpponent(input: UpdateOpponentInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("opponents")
    .update({
      school_name: input.schoolName,
      mascot: input.mascot || null,
      short_code: input.shortCode || null,
      archived_at: input.archived ? new Date().toISOString() : null
    })
    .eq("id", input.opponentId)
    .eq("organization_id", input.organizationId)
    .select("id,organization_id,school_name,mascot,short_code,archived_at")
    .maybeSingle<OpponentRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Opponent not found.");
  }

  return data;
}

export async function createVenue(input: CreateVenueInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("venues")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      field_name: input.fieldName || null,
      address_line_1: input.addressLine1 || null,
      address_line_2: input.addressLine2 || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postalCode || null
    })
    .select("id,organization_id,name,field_name,address_line_1,address_line_2,city,state,postal_code")
    .single<VenueRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateVenue(input: UpdateVenueInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("venues")
    .update({
      name: input.name,
      field_name: input.fieldName || null,
      address_line_1: input.addressLine1 || null,
      address_line_2: input.addressLine2 || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postalCode || null
    })
    .eq("id", input.venueId)
    .eq("organization_id", input.organizationId)
    .select("id,organization_id,name,field_name,address_line_1,address_line_2,city,state,postal_code")
    .maybeSingle<VenueRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Venue not found.");
  }

  return data;
}

export async function createGame(input: CreateGameInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  const season = await getSeasonRow(input.seasonId);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team) {
    throw new Error("Team not found for season.");
  }

  const opponent = await getOpponentRow(input.opponentId);

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(team.organization_id, "assistant_coach");

  const { data: insertedGame, error: gameError } = await supabaseAdmin
    .from("games")
    .insert({
      season_id: input.seasonId,
      opponent_id: input.opponentId,
      venue_id: input.venueId || null,
      kickoff_at: input.kickoffAt || null,
      arrival_at: input.arrivalAt || null,
      report_at: input.reportAt || null,
      home_away: input.homeAway,
      status: input.status,
      weather_conditions: input.weatherConditions || null,
      field_conditions: input.fieldConditions || null,
      staff_notes: input.staffNotes || null,
      opponent_prep_notes: input.opponentPrepNotes || null,
      logistics_notes: input.logisticsNotes || null
    })
    .select(
      "id,season_id,opponent_id,venue_id,kickoff_at,arrival_at,report_at,home_away,status,weather_conditions,field_conditions,staff_notes,opponent_prep_notes,logistics_notes,roster_confirmed_at,public_live_enabled,public_reports_enabled,current_revision"
    )
    .single<GameRow>();

  if (gameError) {
    throw new Error(gameError.message);
  }

  const homeTeam = input.homeAway === "home" ? team.name : opponent.school_name;
  const awayTeam = input.homeAway === "away" ? team.name : opponent.school_name;

  const { data: insertedSides, error: sidesError } = await supabaseAdmin
    .from("game_sides")
    .insert([
      {
        game_id: insertedGame.id,
        side: "home",
        is_primary_team: input.homeAway === "home",
        display_name: homeTeam,
        short_code: input.homeAway === "home" ? team.level : opponent.short_code ?? null
      },
      {
        game_id: insertedGame.id,
        side: "away",
        is_primary_team: input.homeAway === "away",
        display_name: awayTeam,
        short_code: input.homeAway === "away" ? team.level : opponent.short_code ?? null
      }
    ])
    .select("id,game_id,side,is_primary_team,display_name,short_code");

  if (sidesError) {
    throw new Error(sidesError.message);
  }

  const primarySide = (insertedSides as GameSideRow[] | null | undefined)?.find((side) => side.is_primary_team);

  if (primarySide) {
    const { data: seasonRoster, error: seasonRosterError } = await supabaseAdmin
      .from("season_roster_entries")
      .select("id,season_id,player_id,jersey_number,grade,position,offense_role,defense_role,special_teams_role")
      .eq("season_id", input.seasonId);

    if (seasonRosterError) {
      throw new Error(seasonRosterError.message);
    }

    const rosterRows = (seasonRoster as SeasonRosterEntryRow[] | null | undefined) ?? [];

    if (rosterRows.length > 0) {
      const playerIds = Array.from(new Set(rosterRows.map((entry) => entry.player_id)));
      const { data: playerRows, error: playersError } = await supabaseAdmin
        .from("players")
        .select("id,organization_id,first_name,last_name,preferred_name,default_position")
        .in("id", playerIds);

      if (playersError) {
        throw new Error(playersError.message);
      }

      const playersById = new Map(
        ((playerRows as PlayerRow[] | null | undefined) ?? []).map((player) => [player.id, player])
      );

      const rosterInsertValues = rosterRows.map((entry) => {
        const player = playersById.get(entry.player_id);
        return {
          game_side_id: primarySide.id,
          season_roster_entry_id: entry.id,
          jersey_number: entry.jersey_number,
          display_name:
            player?.preferred_name ||
            [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
            `#${entry.jersey_number}`,
          grade: entry.grade,
          position: entry.position
        };
      });

      const { error: rosterInsertError } = await supabaseAdmin
        .from("game_roster_entries")
        .insert(rosterInsertValues);

      if (rosterInsertError) {
        throw new Error(rosterInsertError.message);
      }
    }
  }

  return mapGameRow(insertedGame);
}

export async function updateGame(input: UpdateGameInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  const existing = await getGameRow(input.gameId);

  if (!existing) {
    throw new Error("Game not found.");
  }

  if (existing.season_id !== input.seasonId) {
    throw new Error("Moving games between seasons is not supported in V1.");
  }

  const season = await getSeasonRow(existing.season_id);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team) {
    throw new Error("Team not found for season.");
  }

  const opponent = await getOpponentRow(input.opponentId);

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(team.organization_id, "assistant_coach");

  const hasLoggedPlays = existing.current_revision > 0;
  if (hasLoggedPlays && (existing.home_away !== input.homeAway || existing.opponent_id !== input.opponentId)) {
    throw new Error("Opponent and home/away cannot change after plays have been logged.");
  }

  const { data: updatedGame, error: updateGameError } = await supabaseAdmin
    .from("games")
    .update({
      opponent_id: input.opponentId,
      venue_id: input.venueId || null,
      kickoff_at: input.kickoffAt || null,
      arrival_at: input.arrivalAt || null,
      report_at: input.reportAt || null,
      home_away: input.homeAway,
      status: input.status,
      weather_conditions: input.weatherConditions || null,
      field_conditions: input.fieldConditions || null,
      staff_notes: input.staffNotes || null,
      opponent_prep_notes: input.opponentPrepNotes || null,
      logistics_notes: input.logisticsNotes || null,
      public_live_enabled: input.publicLiveEnabled ?? existing.public_live_enabled,
      public_reports_enabled: input.publicReportsEnabled ?? existing.public_reports_enabled
    })
    .eq("id", input.gameId)
    .select(
      "id,season_id,opponent_id,venue_id,kickoff_at,arrival_at,report_at,home_away,status,weather_conditions,field_conditions,staff_notes,opponent_prep_notes,logistics_notes,roster_confirmed_at,public_live_enabled,public_reports_enabled,current_revision"
    )
    .single<GameRow>();

  if (updateGameError) {
    throw new Error(updateGameError.message);
  }

  const homeTeam = input.homeAway === "home" ? team.name : opponent.school_name;
  const awayTeam = input.homeAway === "away" ? team.name : opponent.school_name;

  const { error: homeSideError } = await supabaseAdmin
    .from("game_sides")
    .update({
      is_primary_team: input.homeAway === "home",
      display_name: homeTeam,
      short_code: input.homeAway === "home" ? team.level : opponent.short_code ?? null
    })
    .eq("game_id", input.gameId)
    .eq("side", "home");

  if (homeSideError) {
    throw new Error(homeSideError.message);
  }

  const { error: awaySideError } = await supabaseAdmin
    .from("game_sides")
    .update({
      is_primary_team: input.homeAway === "away",
      display_name: awayTeam,
      short_code: input.homeAway === "away" ? team.level : opponent.short_code ?? null
    })
    .eq("game_id", input.gameId)
    .eq("side", "away");

  if (awaySideError) {
    throw new Error(awaySideError.message);
  }

  return mapGameRow(updatedGame);
}

export async function replaceSeasonRoster(input: ReplaceSeasonRosterInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  await ensureSeasonForOrganization(input);

  const { error: deleteExistingError } = await supabaseAdmin
    .from("season_roster_entries")
    .delete()
    .eq("season_id", input.seasonId);

  if (deleteExistingError) {
    throw new Error(deleteExistingError.message);
  }

  for (const entry of input.players) {
    const player = await findOrCreatePlayerForRoster(input.organizationId, entry, { updateExisting: false });
    const { error: insertRosterError } = await supabaseAdmin
      .from("season_roster_entries")
      .insert({
        season_id: input.seasonId,
        player_id: player.id,
        jersey_number: entry.jerseyNumber,
        grade: entry.grade || null,
        position: entry.position || null,
        offense_role: entry.offenseRole,
        defense_role: entry.defenseRole,
        special_teams_role: entry.specialTeamsRole
      });

    if (insertRosterError) {
      throw new Error(insertRosterError.message);
    }
  }

  return loadSeasonRosterRows(input.seasonId);
}

export async function mergeSeasonRoster(input: ReplaceSeasonRosterInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  await ensureSeasonForOrganization(input);

  const { data: existingEntries, error: existingEntriesError } = await supabaseAdmin
    .from("season_roster_entries")
    .select("id,jersey_number")
    .eq("season_id", input.seasonId);

  if (existingEntriesError) {
    throw new Error(existingEntriesError.message);
  }

  const existingByJersey = new Map(
    ((existingEntries as { id: string; jersey_number: string }[] | null | undefined) ?? []).map((entry) => [
      entry.jersey_number,
      entry
    ])
  );

  for (const entry of input.players) {
    const player = await findOrCreatePlayerForRoster(input.organizationId, entry, { updateExisting: true });
    const existingRosterEntry = existingByJersey.get(entry.jerseyNumber);

    if (existingRosterEntry) {
      const { error: updateRosterError } = await supabaseAdmin
        .from("season_roster_entries")
        .update({
          player_id: player.id,
          grade: entry.grade || null,
          position: entry.position || null,
          offense_role: entry.offenseRole,
          defense_role: entry.defenseRole,
          special_teams_role: entry.specialTeamsRole
        })
        .eq("id", existingRosterEntry.id);

      if (updateRosterError) {
        throw new Error(updateRosterError.message);
      }

      continue;
    }

    const { error: insertRosterError } = await supabaseAdmin
      .from("season_roster_entries")
      .insert({
        season_id: input.seasonId,
        player_id: player.id,
        jersey_number: entry.jerseyNumber,
        grade: entry.grade || null,
        position: entry.position || null,
        offense_role: entry.offenseRole,
        defense_role: entry.defenseRole,
        special_teams_role: entry.specialTeamsRole
      });

    if (insertRosterError) {
      throw new Error(insertRosterError.message);
    }
  }

  return loadSeasonRosterRows(input.seasonId);
}

export async function confirmGameRoster(gameId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const game = await getGameRow(gameId);

  if (!game) {
    throw new Error("Game not found.");
  }

  if (game.current_revision > 0) {
    throw new Error("Roster cannot be reconfirmed after live plays have been logged.");
  }

  const season = await getSeasonRow(game.season_id);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team) {
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organization_id, "assistant_coach");

  const { data: primarySide, error: primarySideError } = await supabaseAdmin
    .from("game_sides")
    .select("id,game_id,side,is_primary_team,display_name,short_code")
    .eq("game_id", gameId)
    .eq("is_primary_team", true)
    .maybeSingle<GameSideRow>();

  if (primarySideError) {
    throw new Error(primarySideError.message);
  }

  if (!primarySide) {
    throw new Error("Primary team side not found for game.");
  }

  const { data: seasonRoster, error: seasonRosterError } = await supabaseAdmin
    .from("season_roster_entries")
    .select("id,season_id,player_id,jersey_number,grade,position,offense_role,defense_role,special_teams_role")
    .eq("season_id", game.season_id);

  if (seasonRosterError) {
    throw new Error(seasonRosterError.message);
  }

  const rosterRows = (seasonRoster as SeasonRosterEntryRow[] | null | undefined) ?? [];
  const playerIds = Array.from(new Set(rosterRows.map((entry) => entry.player_id)));
  const { data: playerRows, error: playersError } =
    playerIds.length > 0
      ? await supabaseAdmin
          .from("players")
          .select("id,organization_id,first_name,last_name,preferred_name,default_position")
          .in("id", playerIds)
      : { data: [], error: null };

  if (playersError) {
    throw new Error(playersError.message);
  }

  const playersById = new Map(
    ((playerRows as PlayerRow[] | null | undefined) ?? []).map((player) => [player.id, player])
  );

  const { error: deleteExistingError } = await supabaseAdmin
    .from("game_roster_entries")
    .delete()
    .eq("game_side_id", primarySide.id);

  if (deleteExistingError) {
    throw new Error(deleteExistingError.message);
  }

  if (rosterRows.length > 0) {
    const { error: insertRosterError } = await supabaseAdmin
      .from("game_roster_entries")
      .insert(
        rosterRows.map((entry) => {
          const player = playersById.get(entry.player_id);
          return {
            game_side_id: primarySide.id,
            season_roster_entry_id: entry.id,
            jersey_number: entry.jersey_number,
            display_name:
              player?.preferred_name ||
              [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
              `#${entry.jersey_number}`,
            grade: entry.grade,
            position: entry.position
          };
        })
      );

    if (insertRosterError) {
      throw new Error(insertRosterError.message);
    }
  }

  const { data: updatedGame, error: updateGameError } = await supabaseAdmin
    .from("games")
    .update({
      roster_confirmed_at: new Date().toISOString()
    })
    .eq("id", gameId)
    .select(
      "id,season_id,opponent_id,venue_id,kickoff_at,arrival_at,report_at,home_away,status,weather_conditions,field_conditions,staff_notes,opponent_prep_notes,logistics_notes,roster_confirmed_at,public_live_enabled,public_reports_enabled,current_revision"
    )
    .single<GameRow>();

  if (updateGameError) {
    throw new Error(updateGameError.message);
  }

  return {
    game: mapGameRow(updatedGame),
    confirmedCount: rosterRows.length
  };
}

export async function deleteTeam(teamId: string) {
  const team = await getTeamRow(teamId);

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organization_id, "admin");
  const seasonCount = await countRows("seasons", "team_id", teamId);

  if (seasonCount > 0) {
    throw new Error("Delete or move this team's seasons before removing the team.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("teams").delete().eq("id", teamId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteSeason(seasonId: string) {
  const season = await getSeasonRow(seasonId);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team) {
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organization_id, "head_coach");
  const gameCount = await countRows("games", "season_id", seasonId);

  if (gameCount > 0) {
    throw new Error("This season already has games. Archive it instead of deleting it.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("seasons").delete().eq("id", seasonId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteOpponent(opponentId: string) {
  const opponent = await getOpponentRow(opponentId);

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(opponent.organization_id, "assistant_coach");
  const gameCount = await countRows("games", "opponent_id", opponentId);

  if (gameCount > 0) {
    throw new Error("This opponent has game history. Archive it instead of deleting it.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("opponents").delete().eq("id", opponentId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteGame(gameId: string) {
  const game = await getGameRow(gameId);

  if (!game) {
    throw new Error("Game not found.");
  }

  const season = await getSeasonRow(game.season_id);

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await getTeamRow(season.team_id);

  if (!team) {
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organization_id, "assistant_coach");
  const playCount = await countRows("play_events", "game_id", gameId);

  if (playCount > 0 || game.current_revision > 0) {
    throw new Error("This game already has logged plays. Archive it instead of deleting it.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("games").delete().eq("id", gameId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}

export async function deleteVenue(venueId: string) {
  const venue = await getVenueRow(venueId);

  if (!venue) {
    throw new Error("Venue not found.");
  }

  await requireOrganizationRole(venue.organization_id, "assistant_coach");
  const gameCount = await countRows("games", "venue_id", venueId);

  if (gameCount > 0) {
    throw new Error("This venue is already attached to scheduled games. Reassign or clear those games first.");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.from("venues").delete().eq("id", venueId);

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
