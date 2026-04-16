import { NextRequest, NextResponse } from "next/server";
import { createSeasonInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { createSeason } from "@/server/services/football-admin-service";

type SeasonRow = {
  id: string;
  team_id: string;
  label: string;
  year: number;
  is_active: boolean;
  archived_at: string | null;
};

function mapSeason(row: SeasonRow) {
  return {
    id: row.id,
    teamId: row.team_id,
    label: row.label,
    year: row.year,
    isActive: row.is_active,
    archivedAt: row.archived_at
  };
}

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("id,organization_id")
      .eq("id", teamId)
      .maybeSingle<{ id: string; organization_id: string }>();

    if (teamError) {
      throw new Error(teamError.message);
    }

    if (!team) {
      return NextResponse.json({ error: "team not found" }, { status: 404 });
    }

    await requireOrganizationRole(team.organization_id, "read_only");

    const { data, error } = await supabaseAdmin
      .from("seasons")
      .select("*")
      .eq("team_id", teamId)
      .order("year", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: (data ?? []).map((row) => mapSeason(row as SeasonRow)) });
  } catch (error) {
    logServerError("seasons-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load seasons.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createSeasonInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const season = await createSeason(parsed.data);
    return NextResponse.json({ item: mapSeason(season as SeasonRow) }, { status: 201 });
  } catch (error) {
    logServerError("seasons-route", "create_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create season.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
