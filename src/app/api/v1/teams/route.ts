import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createTeamInputSchema } from "@/lib/contracts/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { teams } from "@/server/db/schema";
import { createTeam } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  await requireOrganizationRole(organizationId, "read_only");
  const db = getDb();
  const rows = await db.select().from(teams).where(eq(teams.organizationId, organizationId));

  return NextResponse.json({ items: rows });
}

export async function POST(request: NextRequest) {
  const parsed = createTeamInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const team = await createTeam(parsed.data);
  return NextResponse.json({ item: team }, { status: 201 });
}

