import { NextRequest, NextResponse } from "next/server";
import { getGameDaySnapshot } from "@/server/services/game-day-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  const snapshot = await getGameDaySnapshot(gameId, "read_only");

  return NextResponse.json({ item: snapshot });
}
