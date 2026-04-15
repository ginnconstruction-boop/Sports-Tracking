import { eq } from "drizzle-orm";
import type { MembershipRole } from "@/lib/auth/roles";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { games, seasons, teams } from "@/server/db/schema";

export async function requireGameRole(gameId: string, minimumRole: MembershipRole) {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
  }

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, game.seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organizationId, minimumRole);

  return {
    game,
    season,
    team
  };
}
