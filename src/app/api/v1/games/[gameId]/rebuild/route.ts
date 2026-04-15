import { NextResponse } from "next/server";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { gameId } = await context.params;
  const body = (await _request.json().catch(() => ({}))) as { fromSequence?: string };
  const projection = await rebuildGameFromPlayLog(gameId, "stat_operator", {
    fromSequence: body.fromSequence
  });

  return NextResponse.json({
    currentState: projection.currentState,
    timelineCount: projection.timeline.length
  });
}
