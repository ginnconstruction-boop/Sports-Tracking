import { NextResponse } from "next/server";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { getCurrentUserMemberships } from "@/server/auth/context";

export async function GET() {
  try {
    const { user, memberships } = await getCurrentUserMemberships();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      memberships
    });
  } catch (error) {
    logServerError("me-route", "load_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load current user.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
