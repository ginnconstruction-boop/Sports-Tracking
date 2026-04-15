import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSeasonInputSchema } from "@/lib/contracts/admin";
import { getDb } from "@/server/db/client";
import { seasons, teams } from "@/server/db/schema";
import { requireOrganizationRole } from "@/server/auth/context";
import { createSeason } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");

  if (!teamId) {
    return NextResponse.json({ error: "teamId is required." }, { status: 400 });
  }

  const db = getDb();
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });

  if (!team) {
    return NextResponse.json({ error: "team not found" }, { status: 404 });
  }

  await requireOrganizationRole(team.organizationId, "read_only");
  const rows = await db.select().from(seasons).where(eq(seasons.teamId, teamId));

  return NextResponse.json({ items: rows });
}

export async function POST(request: NextRequest) {
  const parsed = createSeasonInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const season = await createSeason(parsed.data);
  return NextResponse.json({ item: season }, { status: 201 });
}

