import { NextRequest, NextResponse } from "next/server";
import { updateTeamInputSchema } from "@/lib/contracts/admin";
import { deleteTeam, updateTeam } from "@/server/services/football-admin-service";

type TeamRow = {
  id: string;
  organization_id: string;
  name: string;
  level: string;
  archived_at: string | null;
};

function mapTeam(row: TeamRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    level: row.level,
    archivedAt: row.archived_at
  };
}

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
  return NextResponse.json({ item: mapTeam(item as TeamRow) });
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
