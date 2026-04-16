import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { createVenueInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { venues } from "@/server/db/schema";
import { createVenue } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    await requireOrganizationRole(organizationId, "read_only");

    const db = getDb();
    const items = await db.query.venues.findMany({
      where: eq(venues.organizationId, organizationId),
      orderBy: [asc(venues.name)]
    });

    return NextResponse.json({ items });
  } catch (error) {
    logServerError("venues-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load venues.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createVenueInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await createVenue(parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    logServerError("venues-route", "create_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create venue.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
