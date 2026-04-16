import { NextRequest, NextResponse } from "next/server";
import { updateOpponentInputSchema } from "@/lib/contracts/admin";
import { deleteOpponent, updateOpponent } from "@/server/services/football-admin-service";

type OpponentRow = {
  id: string;
  organization_id: string;
  school_name: string;
  mascot: string | null;
  short_code: string | null;
  archived_at: string | null;
};

function mapOpponent(row: OpponentRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    schoolName: row.school_name,
    mascot: row.mascot,
    shortCode: row.short_code,
    archivedAt: row.archived_at
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const opponentId = typeof params.opponentId === "string" ? params.opponentId : "";
  const parsed = updateOpponentInputSchema.safeParse({
    ...(await request.json()),
    opponentId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await updateOpponent(parsed.data);
  return NextResponse.json({ item: mapOpponent(item as OpponentRow) });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const opponentId = typeof params.opponentId === "string" ? params.opponentId : "";

  const result = await deleteOpponent(opponentId);
  return NextResponse.json(result);
}
