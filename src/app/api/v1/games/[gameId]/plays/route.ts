import { NextRequest, NextResponse } from "next/server";
import { createPlayEventInputSchema } from "@/lib/contracts/play-log";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { createPlayEvent, listPlayEvents } from "@/server/services/play-log-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  try {
    const plays = await listPlayEvents(gameId);
    return NextResponse.json({ items: plays });
  } catch (error) {
    logServerError("play-route", "list_failed", error, {
      gameId,
      ...getRuntimeConnectionSummary()
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load plays.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  const parsed = createPlayEventInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createPlayEvent(gameId, parsed.data);
    await rebuildGameFromPlayLog(gameId, "stat_operator", {
      fromSequence: result.rebuildFromSequence
    });
    const live = await getGameDaySnapshot(gameId, "stat_operator");

    return NextResponse.json(
      {
        ...result,
        live
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("play-route", "submit_failed", error, {
      gameId,
      sequence: parsed.data.sequence,
      playType: parsed.data.playType
    });
    return NextResponse.json({ error: "Unable to submit play." }, { status: 500 });
  }
}
