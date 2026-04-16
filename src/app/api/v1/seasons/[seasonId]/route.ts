import { NextRequest, NextResponse } from "next/server";
import { updateSeasonInputSchema } from "@/lib/contracts/admin";
import { deleteSeason, updateSeason } from "@/server/services/football-admin-service";

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
  const parsed = updateSeasonInputSchema.safeParse({
    ...(await request.json()),
    seasonId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await updateSeason(parsed.data);
  return NextResponse.json({ item: mapSeason(item as SeasonRow) });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";

  const result = await deleteSeason(seasonId);
  return NextResponse.json(result);
}
