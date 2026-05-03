import { NextRequest, NextResponse } from "next/server";
import { createScoreCorrectionInputSchema } from "@/lib/contracts/score-corrections";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";
import { logServerError } from "@/lib/server/observability";
import {
  createScoreCorrection,
  listScoreCorrections
} from "@/server/services/score-correction-service";

export const dynamic = "force-dynamic";

async function getGameId(context: { params: Promise<unknown> }) {
  const params = (await context.params) as { gameId: string };
  return params.gameId;
}

export async function GET(_request: NextRequest, context: { params: Promise<unknown> }) {
  const gameId = await getGameId(context);

  try {
    const corrections = await listScoreCorrections(gameId);
    return NextResponse.json({ items: corrections });
  } catch (error) {
    logServerError("score-corrections-route", "list_failed", error, {
      gameId
    });
    return NextResponse.json({ error: "Unable to load score corrections." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  const gameId = await getGameId(context);
  const parsed = createScoreCorrectionInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const correction = await createScoreCorrection(gameId, parsed.data);
    await rebuildGameFromPlayLog(gameId, "stat_operator", {
      fromSequence: correction.appliesAfterSequence
    });
    const live = await getGameDaySnapshot(gameId, "stat_operator");

    return NextResponse.json(
      {
        item: correction,
        live
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("score-corrections-route", "create_failed", error, {
      gameId
    });
    return NextResponse.json({ error: "Unable to create score correction." }, { status: 500 });
  }
}
