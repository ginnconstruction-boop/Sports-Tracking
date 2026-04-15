import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { createGameInputSchema } from "@/lib/contracts/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { games, opponents, seasons, teams, venues } from "@/server/db/schema";
import { createGame } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  const seasonId = request.nextUrl.searchParams.get("seasonId");

  if (!seasonId) {
    return NextResponse.json({ error: "seasonId is required." }, { status: 400 });
  }

  const db = getDb();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });

  if (!season) {
    return NextResponse.json({ error: "season not found" }, { status: 404 });
  }

  const team = await db.query.teams.findFirst({ where: eq(teams.id, season.teamId) });

  if (!team) {
    return NextResponse.json({ error: "team not found" }, { status: 404 });
  }

  await requireOrganizationRole(team.organizationId, "read_only");

  const rows = await db
    .select({
      game: games,
      opponentSchoolName: opponents.schoolName,
      venueName: venues.name,
      venueCity: venues.city,
      venueState: venues.state
    })
    .from(games)
    .innerJoin(opponents, eq(games.opponentId, opponents.id))
    .leftJoin(venues, eq(games.venueId, venues.id))
    .where(eq(games.seasonId, seasonId))
    .orderBy(asc(games.kickoffAt), asc(games.createdAt));

  return NextResponse.json({ items: rows });
}

export async function POST(request: NextRequest) {
  const parsed = createGameInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const game = await createGame(parsed.data);
  return NextResponse.json({ item: game }, { status: 201 });
}
