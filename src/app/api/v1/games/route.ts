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
        "id,season_id,opponent_id,status,venue_id,kickoff_at,arrival_at,report_at,home_away,current_revision,opponents!inner(school_name),venues(name,city,state)"
      )
      .eq("season_id", seasonId)
      .order("kickoff_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const items = (data ?? []).map((row) => {
      const opponent = Array.isArray(row.opponents) ? row.opponents[0] : row.opponents;
      const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;

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
        opponentSchoolName: opponent?.school_name ?? "Unknown opponent",
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
