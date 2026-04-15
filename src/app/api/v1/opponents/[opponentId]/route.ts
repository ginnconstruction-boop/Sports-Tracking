import { NextRequest, NextResponse } from "next/server";
import { updateOpponentInputSchema } from "@/lib/contracts/admin";
import { deleteOpponent, updateOpponent } from "@/server/services/football-admin-service";

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
  return NextResponse.json({ item });
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
