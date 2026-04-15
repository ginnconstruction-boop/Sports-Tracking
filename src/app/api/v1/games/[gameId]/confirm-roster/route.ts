import { NextResponse } from "next/server";
import { confirmGameRoster } from "@/server/services/football-admin-service";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { gameId } = await context.params;
  const result = await confirmGameRoster(gameId);
  return NextResponse.json({ item: result });
}
