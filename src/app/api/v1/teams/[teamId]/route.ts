import { NextRequest, NextResponse } from "next/server";
import { updateTeamInputSchema } from "@/lib/contracts/admin";
import { deleteTeam, updateTeam } from "@/server/services/football-admin-service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const parsed = updateTeamInputSchema.safeParse({
    ...(await request.json()),
    teamId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await updateTeam(parsed.data);
  return NextResponse.json({ item });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const teamId = typeof params.teamId === "string" ? params.teamId : "";

  const result = await deleteTeam(teamId);
  return NextResponse.json(result);
}
