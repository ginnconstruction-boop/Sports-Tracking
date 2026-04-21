import { NextRequest, NextResponse } from "next/server";
import { exportRequestSchema } from "@/lib/contracts/reports";
import { requireAuthenticatedUser } from "@/server/auth/context";
import {
  getGameReportPreview,
  listGameExports,
  processQueuedGameExport,
  queueGameExport
} from "@/server/services/report-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    gameId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;
  try {
    const preview = await getGameReportPreview(gameId);
    const exports = await listGameExports(gameId);

    return NextResponse.json({
      preview,
      exports
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load reports." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { gameId } = await context.params;

  try {
    const parsed = exportRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const user = await requireAuthenticatedUser();
    const exportJob = await queueGameExport(gameId, parsed.data.reportType, parsed.data.format, user.id);
    const completedJob = await processQueuedGameExport(exportJob.id);
    return NextResponse.json({ item: completedJob }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create export." },
      { status: 500 }
    );
  }
}
