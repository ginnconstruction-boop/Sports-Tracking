import { NextRequest, NextResponse } from "next/server";
import { updateGameInputSchema } from "@/lib/contracts/admin";
import { deleteGame, updateGame } from "@/server/services/football-admin-service";

type Context = {
  params: Promise<{ gameId: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  const { gameId } = await context.params;
  const parsed = updateGameInputSchema.safeParse({
    ...(await request.json()),
    gameId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await updateGame(parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update game." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { gameId } = await context.params;

  try {
    const result = await deleteGame(gameId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete game." },
      { status: 400 }
    );
  }
}
