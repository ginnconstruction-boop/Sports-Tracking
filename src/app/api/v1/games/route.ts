import { NextRequest, NextResponse } from "next/server";
import { createGameInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { createGame } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  try {
    const seasonId = request.nextUrl.searchParams.get("seasonId");

    if (!seasonId) {
      return NextResponse.json({ error: "seasonId is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: season, error: seasonError } = await supabaseAdmin
      .from("seasons")
      .select("id,team_id")
      .eq("id", seasonId)
      .maybeSingle<{ id: string; team_id: string }>();

    if (seasonError) {
      throw new Error(seasonError.message);
    }

    if (!season) {
      return NextResponse.json({ error: "season not found" }, { status: 404 });
    }

    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("id,organization_id")
      .eq("id", season.team_id)
      .maybeSingle<{ id: string; organization_id: string }>();

    if (teamError) {
      throw new Error(teamError.message);
    }

    if (!team) {
      return NextResponse.json({ error: "team not found" }, { status: 404 });
    }

    await requireOrganizationRole(team.organization_id, "read_only");

    const { data, error } = await supabaseAdmin
      .from("games")
      .select(
        "id,season_id,opponent_id,status,venue_id,kickoff_at,arrival_at,report_at,home_away,current_revision"
      )
      .eq("season_id", seasonId)
      .order("kickoff_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    const opponentIds = Array.from(new Set(rows.map((row) => row.opponent_id).filter(Boolean)));
    const venueIds = Array.from(new Set(rows.map((row) => row.venue_id).filter(Boolean)));

    const [opponentsResult, venuesResult] = await Promise.all([
      opponentIds.length > 0
        ? supabaseAdmin
            .from("opponents")
            .select("id,school_name")
            .in("id", opponentIds)
        : Promise.resolve({ data: [], error: null }),
      venueIds.length > 0
        ? supabaseAdmin
            .from("venues")
            .select("id,name,city,state")
            .in("id", venueIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (opponentsResult.error) {
      throw new Error(opponentsResult.error.message);
    }

    if (venuesResult.error) {
      throw new Error(venuesResult.error.message);
    }

    const opponentsById = new Map(
      (opponentsResult.data ?? []).map((opponent) => [opponent.id, opponent.school_name])
    );
    const venuesById = new Map(
      (venuesResult.data ?? []).map((venue) => [venue.id, venue])
    );

    const items = rows.map((row) => {
      const venue = row.venue_id ? venuesById.get(row.venue_id) ?? null : null;

      return {
        game: {
          id: row.id,
          seasonId: row.season_id,
          opponentId: row.opponent_id,
          status: row.status,
          venueId: row.venue_id,
          kickoffAt: row.kickoff_at,
          arrivalAt: row.arrival_at,
          reportAt: row.report_at,
          homeAway: row.home_away,
          currentRevision: row.current_revision
        },
        opponentSchoolName: opponentsById.get(row.opponent_id) ?? "Unknown opponent",
        venueName: venue?.name ?? null,
        venueCity: venue?.city ?? null,
        venueState: venue?.state ?? null
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    logServerError("games-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load games.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createGameInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const game = await createGame(parsed.data);
    return NextResponse.json({ item: game }, { status: 201 });
  } catch (error) {
    logServerError("games-route", "create_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create game.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
