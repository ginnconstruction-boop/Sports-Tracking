import { NextRequest, NextResponse } from "next/server";
import { updatePlayEventInputSchema } from "@/lib/contracts/play-log";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { deletePlayEvent, updatePlayEvent } from "@/server/services/play-log-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";
import { logServerError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
    playId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { gameId, playId } = await context.params;
  const parsed = updatePlayEventInputSchema.safeParse({
    ...(await request.json()),
    playId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updatePlayEvent(gameId, parsed.data);
    await rebuildGameFromPlayLog(gameId, "stat_operator", {
      fromSequence: result.rebuildFromSequence
    });
    const live = await getGameDaySnapshot(gameId, "stat_operator");

    return NextResponse.json({
      ...result,
      live
    });
  } catch (error) {
    logServerError("play-route", "edit_failed", error, {
      gameId,
      playId
    });
    return NextResponse.json({ error: "Unable to save play edit." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { gameId, playId } = await context.params;
  try {
    const result = await deletePlayEvent(gameId, playId);
    await rebuildGameFromPlayLog(gameId, "stat_operator", {
      fromSequence: result.rebuildFromSequence
    });
    const live = await getGameDaySnapshot(gameId, "stat_operator");

    return NextResponse.json({
      ...result,
      live
    });
  } catch (error) {
    logServerError("play-route", "delete_failed", error, {
      gameId,
      playId
    });
    return NextResponse.json({ error: "Unable to delete play." }, { status: 500 });
  }
}
