import { NextRequest, NextResponse } from "next/server";
import {
  openGameSessionInputSchema,
  syncGameSessionInputSchema
} from "@/lib/contracts/game-session";
import {
  ActiveWriterConflictError,
  openGameSession,
  syncGameSession
} from "@/server/services/game-session-service";
import {
  logServerError,
  logServerWarning
} from "@/lib/server/observability";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  const parsed = openGameSessionInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const session = await openGameSession(gameId, parsed.data);
    return NextResponse.json({ item: session }, { status: 201 });
  } catch (error) {
    if (error instanceof ActiveWriterConflictError) {
      logServerWarning({
        scope: "game-session",
        event: "writer_conflict",
        gameId,
        deviceKey: parsed.data.deviceKey
      });
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    logServerError("game-session", "open_failed", error, {
      gameId,
      deviceKey: parsed.data.deviceKey
    });
    return NextResponse.json({ error: "Unable to open game session." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  const parsed = syncGameSessionInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const session = await syncGameSession(gameId, parsed.data);
    return NextResponse.json({ item: session });
  } catch (error) {
    logServerError("game-session", "sync_failed", error, {
      gameId,
      deviceKey: parsed.data.deviceKey,
      requestedStatus: parsed.data.status
    });
    return NextResponse.json({ error: "Unable to sync game session." }, { status: 500 });
  }
}
