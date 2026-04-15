import { NextRequest, NextResponse } from "next/server";
import { updateSeasonInputSchema } from "@/lib/contracts/admin";
import { deleteSeason, updateSeason } from "@/server/services/football-admin-service";

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
  return NextResponse.json({ item });
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
