import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSmokeEnvironment, resolveSmokeConfig, type SmokeSeedMode } from "./smoke-config";

type AuthUserListResponse = Awaited<ReturnType<SupabaseClient["auth"]["admin"]["listUsers"]>>;

type SmokeSeedResult = {
  mode: SmokeSeedMode;
  email: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  teamId?: string;
  seasonId?: string;
  opponentId?: string;
  venueId?: string;
  gameId?: string;
};

function readRequiredEnv(name: string) {
  loadSmokeEnvironment();
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for smoke seeding.`);
  }
  return value;
}

function createSupabaseAdminClient() {
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  let page = 1;
  while (page < 20) {
    const response: AuthUserListResponse = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (response.error) {
      throw response.error;
    }

    const found = response.data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (found) {
      return found;
    }

    if (response.data.users.length < 200) {
      return null;
    }

    page += 1;
  }

  return null;
}

async function ensureAuthUser(supabase: SupabaseClient, email: string, password: string, displayName: string) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        name: displayName
      }
    });

    if (error) {
      throw error;
    }

    return existing.id;
  }

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      name: displayName
    }
  });

  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Unable to create smoke auth user.");
  }

  return created.data.user.id;
}

async function ensureAppUser(supabase: SupabaseClient, userId: string, email: string, displayName: string) {
  const { error } = await supabase.from("app_users").upsert(
    {
      id: userId,
      email,
      display_name: displayName
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw error;
  }
}

async function ensureOrganization(supabase: SupabaseClient, name: string, slug: string) {
  const existing = await supabase
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string; slug: string }>();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    if (existing.data.name !== name) {
      const updated = await supabase
        .from("organizations")
        .update({ name })
        .eq("id", existing.data.id)
        .select("id,name,slug")
        .single<{ id: string; name: string; slug: string }>();

      if (updated.error || !updated.data) {
        throw updated.error ?? new Error("Unable to update smoke organization.");
      }

      return updated.data;
    }

    return existing.data;
  }

  const inserted = await supabase
    .from("organizations")
    .insert({
      name,
      slug
    })
    .select("id,name,slug")
    .single<{ id: string; name: string; slug: string }>();

  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error("Unable to create smoke organization.");
  }

  return inserted.data;
}

async function ensureMembership(supabase: SupabaseClient, organizationId: string, userId: string) {
  const { error } = await supabase.from("organization_memberships").upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      role: "admin"
    },
    {
      onConflict: "organization_id,user_id"
    }
  );

  if (error) {
    throw error;
  }
}

async function cleanupSmokeChildren(supabase: SupabaseClient, organizationId: string) {
  const teamIdsResult = await supabase.from("teams").select("id").eq("organization_id", organizationId);

  if (teamIdsResult.error) {
    throw teamIdsResult.error;
  }

  const teamIds = (teamIdsResult.data ?? []).map((row) => row.id as string);
  if (teamIds.length > 0) {
    const { error } = await supabase.from("teams").delete().in("id", teamIds);
    if (error) {
      throw error;
    }
  }

  for (const tableName of ["opponents", "venues", "players"] as const) {
    const { error } = await supabase.from(tableName).delete().eq("organization_id", organizationId);
    if (error) {
      throw error;
    }
  }
}

async function createTeam(supabase: SupabaseClient, organizationId: string, name: string, level: string) {
  const created = await supabase
    .from("teams")
    .insert({
      organization_id: organizationId,
      name,
      level
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Unable to create smoke team.");
  }

  return created.data.id;
}

async function createSeason(supabase: SupabaseClient, teamId: string, label: string, year: number) {
  const created = await supabase
    .from("seasons")
    .insert({
      team_id: teamId,
      label,
      year,
      is_active: true
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Unable to create smoke season.");
  }

  return created.data.id;
}

async function createOpponent(
  supabase: SupabaseClient,
  organizationId: string,
  schoolName: string,
  mascot: string,
  shortCode: string
) {
  const created = await supabase
    .from("opponents")
    .insert({
      organization_id: organizationId,
      school_name: schoolName,
      mascot,
      short_code: shortCode
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Unable to create smoke opponent.");
  }

  return created.data.id;
}

async function createVenue(supabase: SupabaseClient, organizationId: string, name: string, city: string, state: string) {
  const created = await supabase
    .from("venues")
    .insert({
      organization_id: organizationId,
      name,
      city,
      state
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Unable to create smoke venue.");
  }

  return created.data.id;
}

async function createGame(
  supabase: SupabaseClient,
  input: {
    seasonId: string;
    opponentId: string;
    venueId: string;
    homeAway: "home" | "away";
    teamName: string;
    teamLevel: string;
    opponentName: string;
    opponentShortCode: string;
  }
) {
  const kickoffAt = new Date(Date.UTC(2026, 3, 17, 0, 0, 0)).toISOString();
  const arrivalAt = new Date(Date.UTC(2026, 3, 16, 23, 15, 0)).toISOString();
  const reportAt = new Date(Date.UTC(2026, 3, 16, 22, 45, 0)).toISOString();

  const created = await supabase
    .from("games")
    .insert({
      season_id: input.seasonId,
      opponent_id: input.opponentId,
      venue_id: input.venueId,
      kickoff_at: kickoffAt,
      arrival_at: arrivalAt,
      report_at: reportAt,
      home_away: input.homeAway,
      status: "scheduled"
    })
    .select("id")
    .single<{ id: string }>();

  if (created.error || !created.data) {
    throw created.error ?? new Error("Unable to create smoke game.");
  }

  const homeDisplay = input.homeAway === "home" ? input.teamName : input.opponentName;
  const awayDisplay = input.homeAway === "away" ? input.teamName : input.opponentName;
  const homeShortCode = input.homeAway === "home" ? input.teamLevel : input.opponentShortCode;
  const awayShortCode = input.homeAway === "away" ? input.teamLevel : input.opponentShortCode;

  const insertedSides = await supabase.from("game_sides").insert([
    {
      game_id: created.data.id,
      side: "home",
      is_primary_team: input.homeAway === "home",
      display_name: homeDisplay,
      short_code: homeShortCode
    },
    {
      game_id: created.data.id,
      side: "away",
      is_primary_team: input.homeAway === "away",
      display_name: awayDisplay,
      short_code: awayShortCode
    }
  ]);

  if (insertedSides.error) {
    throw insertedSides.error;
  }

  return created.data.id;
}

export async function seedSmokeEnvironment(mode: SmokeSeedMode): Promise<SmokeSeedResult> {
  const smoke = resolveSmokeConfig();
  const supabase = createSupabaseAdminClient();

  const userId = await ensureAuthUser(supabase, smoke.email, smoke.password, smoke.displayName);
  await ensureAppUser(supabase, userId, smoke.email, smoke.displayName);

  const organization = await ensureOrganization(supabase, smoke.organization.name, smoke.organization.slug);
  await ensureMembership(supabase, organization.id, userId);
  await cleanupSmokeChildren(supabase, organization.id);

  const result: SmokeSeedResult = {
    mode,
    email: smoke.email,
    organization
  };

  if (mode === "baseline" || mode === "reset") {
    return result;
  }

  const teamId = await createTeam(supabase, organization.id, smoke.team.name, smoke.team.level);
  const seasonId = await createSeason(supabase, teamId, smoke.season.label, smoke.season.year);
  const opponentId = await createOpponent(
    supabase,
    organization.id,
    smoke.opponent.schoolName,
    smoke.opponent.mascot,
    smoke.opponent.shortCode
  );
  const venueId = await createVenue(supabase, organization.id, smoke.venue.name, smoke.venue.city, smoke.venue.state);
  const gameId = await createGame(supabase, {
    seasonId,
    opponentId,
    venueId,
    homeAway: smoke.game.homeAway,
    teamName: smoke.team.name,
    teamLevel: smoke.team.level,
    opponentName: smoke.opponent.schoolName,
    opponentShortCode: smoke.opponent.shortCode
  });

  result.teamId = teamId;
  result.seasonId = seasonId;
  result.opponentId = opponentId;
  result.venueId = venueId;
  result.gameId = gameId;

  return result;
}
