import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { seedSampleGameForCurrentUser } from "@/server/services/sample-game-service";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isFeatureEnabled("internal_debug_tools")) {
    return NextResponse.json({ error: "Demo tools are disabled." }, { status: 404 });
  }
  const seeded = await seedSampleGameForCurrentUser();
  return NextResponse.json({ item: seeded }, { status: 201 });
}
