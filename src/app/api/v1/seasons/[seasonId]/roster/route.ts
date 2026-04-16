import { NextRequest, NextResponse } from "next/server";
import { replaceSeasonRosterInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { replaceSeasonRoster } from "@/server/services/football-admin-service";

type SeasonRow = {
  id: string;
  team_id: string;
};

type TeamRow = {
  id: string;
  organization_id: string;
};

type SeasonRosterRow = {
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

function unwrapPlayer(player: SeasonRosterRow["players"]) {
  if (!player) {
    return null;
  }

  return Array.isArray(player) ? (player[0] ?? null) : player;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: season, error: seasonError } = await supabaseAdmin
      .from("seasons")
      .select("id,team_id")
      .eq("id", seasonId)
      .maybeSingle<SeasonRow>();

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
      .maybeSingle<TeamRow>();

    if (teamError) {
      throw new Error(teamError.message);
    }

    if (!team) {
      return NextResponse.json({ error: "team not found" }, { status: 404 });
    }

    await requireOrganizationRole(team.organization_id, "read_only");

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

    const items =
      (data as SeasonRosterRow[] | null | undefined)?.map((row) => {
        const player = unwrapPlayer(row.players);

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
      }) ?? [];

    return NextResponse.json({ items });
  } catch (error) {
    logServerError("season-roster-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load season roster.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
    const parsed = replaceSeasonRosterInputSchema.safeParse({
      ...(await request.json()),
      seasonId
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const roster = await replaceSeasonRoster(parsed.data);
    return NextResponse.json({ items: roster });
  } catch (error) {
    logServerError("season-roster-route", "replace_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to replace season roster.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
