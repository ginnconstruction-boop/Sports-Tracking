import { NextRequest, NextResponse } from "next/server";
import { getSeasonAnalytics } from "@/server/services/analytics-service";

type Context = {
  params: Promise<{
    seasonId: string;
  }>;
};

export async function GET(_request: NextRequest, context: Context) {
  const { seasonId } = await context.params;
  const item = await getSeasonAnalytics(seasonId);
  return NextResponse.json({ item });
}
