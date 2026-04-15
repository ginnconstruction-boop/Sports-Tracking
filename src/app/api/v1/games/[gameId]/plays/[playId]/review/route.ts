import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isFeatureEnabled } from "@/lib/features/runtime";
import {
  deletePlayReviewAnnotations,
  upsertPlayReviewAnnotation
} from "@/server/services/play-review-service";

const reviewSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  note: z.string().max(2000).optional(),
  filmUrl: z.string().url().max(500).optional()
});

type Context = {
  params: Promise<{
    gameId: string;
    playId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("internal_debug_tools")) {
    return NextResponse.json({ error: "Play review tools are disabled." }, { status: 404 });
  }
  const { gameId, playId } = await context.params;
  const json = await request.json();
  const parsed = reviewSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await upsertPlayReviewAnnotation({
    gameId,
    playId,
    ...parsed.data
  });
  return NextResponse.json({ item });
}

export async function DELETE(_request: NextRequest, context: Context) {
  if (!isFeatureEnabled("internal_debug_tools")) {
    return NextResponse.json({ error: "Play review tools are disabled." }, { status: 404 });
  }
  const { gameId, playId } = await context.params;
  const item = await deletePlayReviewAnnotations(gameId, [playId]);
  return NextResponse.json({ item });
}
