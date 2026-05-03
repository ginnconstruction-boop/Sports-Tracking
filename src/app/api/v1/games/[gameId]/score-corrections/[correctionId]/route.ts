import { NextRequest, NextResponse } from "next/server";
import { voidScoreCorrectionInputSchema } from "@/lib/contracts/score-corrections";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";
import { logServerError } from "@/lib/server/observability";
import { voidScoreCorrection } from "@/server/services/score-correction-service";

export const dynamic = "force-dynamic";

async function getParams(context: { params: Promise<unknown> }) {
  const params = (await context.params) as { gameId: string; correctionId: string };
  return params;
}

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  const { gameId, correctionId } = await getParams(context);
  const parsed = voidScoreCorrectionInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const correction = await voidScoreCorrection(gameId, correctionId, parsed.data);
    await rebuildGameFromPlayLog(gameId, "stat_operator", {
      fromSequence: correction.appliesAfterSequence
    });
    const live = await getGameDaySnapshot(gameId, "stat_operator");

    return NextResponse.json(
      {
        item: correction,
        live
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("score-corrections-route", "void_failed", error, {
      gameId,
      correctionId
    });
    return NextResponse.json({ error: "Unable to void score correction." }, { status: 500 });
  }
}
