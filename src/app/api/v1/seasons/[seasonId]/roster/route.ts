import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { replaceSeasonRosterInputSchema } from "@/lib/contracts/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { players, seasonRosterEntries, seasons, teams } from "@/server/db/schema";
import { replaceSeasonRoster } from "@/server/services/football-admin-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
  const db = getDb();

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId)
  });

  if (!season) {
    return NextResponse.json({ error: "season not found" }, { status: 404 });
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    return NextResponse.json({ error: "team not found" }, { status: 404 });
  }

  await requireOrganizationRole(team.organizationId, "read_only");

  const rows = await db
    .select({
      rosterId: seasonRosterEntries.id,
      jerseyNumber: seasonRosterEntries.jerseyNumber,
      grade: seasonRosterEntries.grade,
      position: seasonRosterEntries.position,
      offenseRole: seasonRosterEntries.offenseRole,
      defenseRole: seasonRosterEntries.defenseRole,
      specialTeamsRole: seasonRosterEntries.specialTeamsRole,
      firstName: players.firstName,
      lastName: players.lastName,
      preferredName: players.preferredName
    })
    .from(seasonRosterEntries)
    .innerJoin(players, eq(seasonRosterEntries.playerId, players.id))
    .where(eq(seasonRosterEntries.seasonId, seasonId));

  return NextResponse.json({ items: rows });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
  const parsed = replaceSeasonRosterInputSchema.safeParse({
    ...(await request.json()),
    seasonId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const roster = await replaceSeasonRoster(parsed.data);
  return NextResponse.json({ items: roster });
}
