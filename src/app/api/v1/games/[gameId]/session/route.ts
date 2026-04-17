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
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

function errorResponse(
  status: number,
  message: string,
  event: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: {
        message,
        scope: "game-session",
        event,
        ...(details ?? {})
      },
      runtime: getRuntimeConnectionSummary()
    },
    { status }
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { gameId } = await context.params;
    const payload = await request.json();
    const parsed = openGameSessionInputSchema.safeParse(payload);

    if (!parsed.success) {
      return errorResponse(400, "Invalid game session request.", "invalid_open_payload", {
        issues: parsed.error.flatten()
      });
    }

    const session = await openGameSession(gameId, parsed.data);
    return NextResponse.json({ item: session }, { status: 201 });
  } catch (error) {
    const gameId = (await context.params).gameId;

    if (error instanceof ActiveWriterConflictError) {
      logServerWarning({
        scope: "game-session",
        event: "writer_conflict",
        gameId,
        method: "POST"
      });
      return errorResponse(409, error.message, "writer_conflict");
    }

    logServerError("game-session", "open_failed", error, {
      gameId,
      method: "POST"
    });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Unable to open game session.",
      "open_failed"
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { gameId } = await context.params;
    const payload = await request.json();
    const parsed = syncGameSessionInputSchema.safeParse(payload);

    if (!parsed.success) {
      return errorResponse(400, "Invalid game session sync request.", "invalid_sync_payload", {
        issues: parsed.error.flatten()
      });
    }

    const session = await syncGameSession(gameId, parsed.data);
    return NextResponse.json({ item: session });
  } catch (error) {
    const gameId = (await context.params).gameId;

    logServerError("game-session", "sync_failed", error, {
      gameId,
      method: "PATCH"
    });
    return errorResponse(
      500,
      error instanceof Error ? error.message : "Unable to sync game session.",
      "sync_failed"
    );
  }
}
