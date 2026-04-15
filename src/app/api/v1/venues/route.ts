import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { createVenueInputSchema } from "@/lib/contracts/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { venues } from "@/server/db/schema";
import { createVenue } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
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
}

export async function POST(request: NextRequest) {
  const parsed = createVenueInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await createVenue(parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create venue." },
      { status: 400 }
    );
  }
}
