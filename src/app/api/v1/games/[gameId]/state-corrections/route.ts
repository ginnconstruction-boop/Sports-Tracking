import { NextRequest, NextResponse } from "next/server";
import { createSituationCorrectionInputSchema } from "@/lib/contracts/state-corrections";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { rebuildGameFromPlayLog } from "@/server/services/rebuild-service";
import {
  createSituationCorrection,
  listSituationCorrections
} from "@/server/services/state-correction-service";
import { logServerError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

async function getGameId(context: { params: Promise<unknown> }) {
  const params = (await context.params) as { gameId: string };
  return params.gameId;
}

export async function GET(_request: NextRequest, context: { params: Promise<unknown> }) {
  const gameId = await getGameId(context);

  try {
    const corrections = await listSituationCorrections(gameId);
    return NextResponse.json({ items: corrections });
  } catch (error) {
    logServerError("state-corrections-route", "list_failed", error, {
      gameId
    });
    return NextResponse.json({ error: "Unable to load situation corrections." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  const gameId = await getGameId(context);
  const parsed = createSituationCorrectionInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const correction = await createSituationCorrection(gameId, parsed.data);
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
    logServerError("state-corrections-route", "create_failed", error, {
      gameId
    });
    return NextResponse.json({ error: "Unable to create situation correction." }, { status: 500 });
  }
}
