import { and, count, eq } from "drizzle-orm";
import {
  type CreateGameInput,
  type CreateOpponentInput,
  type CreateSeasonInput,
  type CreateTeamInput,
  type CreateVenueInput,
  type UpdateGameInput,
  type UpdateOpponentInput,
  type UpdateSeasonInput,
  type UpdateTeamInput,
  type UpdateVenueInput,
  type ReplaceSeasonRosterInput
} from "@/lib/contracts/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import {
  gameRosterEntries,
  gameSides,
  games,
  opponents,
  playEvents,
  players,
  seasonRosterEntries,
  seasons,
  teams,
  venues
} from "@/server/db/schema";

export async function createTeam(input: CreateTeamInput) {
  await requireOrganizationRole(input.organizationId, "admin");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      level: input.level
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateTeam(input: UpdateTeamInput) {
  await requireOrganizationRole(input.organizationId, "admin");
  const db = getDb();

  const updated = await db
    .update(teams)
    .set({
      name: input.name,
      level: input.level,
      archivedAt: input.archived ? new Date() : null
    })
    .where(and(eq(teams.id, input.teamId), eq(teams.organizationId, input.organizationId)))
    .returning();

  if (!updated[0]) {
    throw new Error("Team not found.");
  }

  return updated[0];
}

export async function createSeason(input: CreateSeasonInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("id,organization_id")
    .eq("id", input.teamId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (teamError) {
    throw new Error(teamError.message);
  }

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organization_id, "head_coach");

  const { data, error } = await supabaseAdmin
    .from("seasons")
    .insert({
      team_id: input.teamId,
      label: input.label,
      year: input.year,
      is_active: input.isActive
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateSeason(input: UpdateSeasonInput) {
  const db = getDb();
  const existing = await db.query.seasons.findFirst({
    where: eq(seasons.id, input.seasonId)
  });

  if (!existing) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, existing.teamId)
  });

  if (!team || team.id !== input.teamId) {
    throw new Error("Season does not belong to the selected team.");
  }

  await requireOrganizationRole(team.organizationId, "head_coach");

  const updated = await db
    .update(seasons)
    .set({
      label: input.label,
      year: input.year,
      isActive: input.isActive,
      archivedAt: input.archived ? new Date() : null
    })
    .where(eq(seasons.id, input.seasonId))
    .returning();

  return updated[0];
}

export async function createOpponent(input: CreateOpponentInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("opponents")
    .insert({
      organization_id: input.organizationId,
      school_name: input.schoolName,
      mascot: input.mascot || null,
      short_code: input.shortCode || null
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateOpponent(input: UpdateOpponentInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const db = getDb();

  const updated = await db
    .update(opponents)
    .set({
      schoolName: input.schoolName,
      mascot: input.mascot,
      shortCode: input.shortCode,
      archivedAt: input.archived ? new Date() : null
    })
    .where(and(eq(opponents.id, input.opponentId), eq(opponents.organizationId, input.organizationId)))
    .returning();

  if (!updated[0]) {
    throw new Error("Opponent not found.");
  }

  return updated[0];
}

export async function createVenue(input: CreateVenueInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("venues")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      field_name: input.fieldName || null,
      address_line_1: input.addressLine1 || null,
      address_line_2: input.addressLine2 || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postalCode || null
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateVenue(input: UpdateVenueInput) {
  await requireOrganizationRole(input.organizationId, "assistant_coach");
  const db = getDb();

  const updated = await db
    .update(venues)
    .set({
      name: input.name,
      fieldName: input.fieldName,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode
    })
    .where(and(eq(venues.id, input.venueId), eq(venues.organizationId, input.organizationId)))
    .returning();

  if (!updated[0]) {
    throw new Error("Venue not found.");
  }

  return updated[0];
}

export async function createGame(input: CreateGameInput) {
  const db = getDb();

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, input.seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    throw new Error("Team not found for season.");
  }

  const opponent = await db.query.opponents.findFirst({
    where: eq(opponents.id, input.opponentId)
  });

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(team.organizationId, "assistant_coach");

  return db.transaction(async (tx) => {
    const insertedGames = await tx
      .insert(games)
      .values({
        seasonId: input.seasonId,
        opponentId: input.opponentId,
        venueId: input.venueId,
        kickoffAt: input.kickoffAt ? new Date(input.kickoffAt) : undefined,
        arrivalAt: input.arrivalAt ? new Date(input.arrivalAt) : undefined,
        reportAt: input.reportAt ? new Date(input.reportAt) : undefined,
        homeAway: input.homeAway,
        status: input.status,
        weatherConditions: input.weatherConditions,
        fieldConditions: input.fieldConditions,
        staffNotes: input.staffNotes,
        opponentPrepNotes: input.opponentPrepNotes,
        logisticsNotes: input.logisticsNotes
      })
      .returning();

    const game = insertedGames[0];

    const homeTeam = input.homeAway === "home" ? team.name : opponent.schoolName;
    const awayTeam = input.homeAway === "away" ? team.name : opponent.schoolName;

    const insertedSides = await tx
      .insert(gameSides)
      .values([
      {
        gameId: game.id,
        side: "home",
        isPrimaryTeam: input.homeAway === "home",
        displayName: homeTeam,
        shortCode: input.homeAway === "home" ? team.level : opponent.shortCode ?? undefined
      },
      {
        gameId: game.id,
        side: "away",
        isPrimaryTeam: input.homeAway === "away",
        displayName: awayTeam,
        shortCode: input.homeAway === "away" ? team.level : opponent.shortCode ?? undefined
      }
      ])
      .returning();

    const primarySide = insertedSides.find((side) => side.isPrimaryTeam);
    const seasonRoster = await tx.query.seasonRosterEntries.findMany({
      where: eq(seasonRosterEntries.seasonId, input.seasonId)
    });

    if (primarySide && seasonRoster.length > 0) {
      const playerRecords = await Promise.all(
        seasonRoster.map((entry) =>
          tx.query.players.findFirst({
            where: eq(players.id, entry.playerId)
          })
        )
      );

      await tx.insert(gameRosterEntries).values(
        seasonRoster.map((entry, index) => {
          const player = playerRecords[index];
          return {
            gameSideId: primarySide.id,
            seasonRosterEntryId: entry.id,
            jerseyNumber: entry.jerseyNumber,
            displayName:
              player?.preferredName ||
              [player?.firstName, player?.lastName].filter(Boolean).join(" ") ||
              `#${entry.jerseyNumber}`,
            grade: entry.grade,
            position: entry.position
          };
        })
      );
    }

    return game;
  });
}

export async function updateGame(input: UpdateGameInput) {
  const db = getDb();

  const existing = await db.query.games.findFirst({
    where: eq(games.id, input.gameId)
  });

  if (!existing) {
    throw new Error("Game not found.");
  }

  if (existing.seasonId !== input.seasonId) {
    throw new Error("Moving games between seasons is not supported in V1.");
  }

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, existing.seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    throw new Error("Team not found for season.");
  }

  const opponent = await db.query.opponents.findFirst({
    where: eq(opponents.id, input.opponentId)
  });

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(team.organizationId, "assistant_coach");

  const hasLoggedPlays = existing.currentRevision > 0;
  if (hasLoggedPlays && (existing.homeAway !== input.homeAway || existing.opponentId !== input.opponentId)) {
    throw new Error("Opponent and home/away cannot change after plays have been logged.");
  }

  return db.transaction(async (tx) => {
    const updatedGames = await tx
      .update(games)
        .set({
          opponentId: input.opponentId,
          venueId: input.venueId,
          kickoffAt: input.kickoffAt ? new Date(input.kickoffAt) : null,
          arrivalAt: input.arrivalAt ? new Date(input.arrivalAt) : null,
          reportAt: input.reportAt ? new Date(input.reportAt) : null,
          homeAway: input.homeAway,
          status: input.status,
          weatherConditions: input.weatherConditions ?? null,
          fieldConditions: input.fieldConditions ?? null,
          staffNotes: input.staffNotes ?? null,
          opponentPrepNotes: input.opponentPrepNotes ?? null,
          logisticsNotes: input.logisticsNotes ?? null,
          publicLiveEnabled: input.publicLiveEnabled ?? existing.publicLiveEnabled,
          publicReportsEnabled: input.publicReportsEnabled ?? existing.publicReportsEnabled
        })
      .where(eq(games.id, input.gameId))
      .returning();

    const updatedGame = updatedGames[0];
    const homeTeam = input.homeAway === "home" ? team.name : opponent.schoolName;
    const awayTeam = input.homeAway === "away" ? team.name : opponent.schoolName;

    await tx
      .update(gameSides)
      .set({
        isPrimaryTeam: input.homeAway === "home",
        displayName: homeTeam,
        shortCode: input.homeAway === "home" ? team.level : opponent.shortCode ?? null
      })
      .where(and(eq(gameSides.gameId, input.gameId), eq(gameSides.side, "home")));

    await tx
      .update(gameSides)
      .set({
        isPrimaryTeam: input.homeAway === "away",
        displayName: awayTeam,
        shortCode: input.homeAway === "away" ? team.level : opponent.shortCode ?? null
      })
      .where(and(eq(gameSides.gameId, input.gameId), eq(gameSides.side, "away")));

    return updatedGame;
  });
}

async function loadSeasonRosterRows(db: any, seasonId: string) {
  return db
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
}

async function ensureSeasonForOrganization(
  input: Pick<ReplaceSeasonRosterInput, "organizationId" | "seasonId">
) {
  const db = getDb();
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, input.seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team || team.organizationId !== input.organizationId) {
    throw new Error("Season does not belong to the requested organization.");
  }

  await requireOrganizationRole(input.organizationId, "head_coach");

  return { season, team };
}

export async function replaceSeasonRoster(input: ReplaceSeasonRosterInput) {
  const db = getDb();
  await ensureSeasonForOrganization(input);

  return db.transaction(async (tx) => {
    await tx.delete(seasonRosterEntries).where(eq(seasonRosterEntries.seasonId, input.seasonId));

    for (const entry of input.players) {
      const existingPlayer = await tx.query.players.findFirst({
        where: and(
          eq(players.organizationId, input.organizationId),
          eq(players.firstName, entry.firstName),
          eq(players.lastName, entry.lastName)
        )
      });

      const player =
        existingPlayer ??
        (
          await tx
            .insert(players)
            .values({
              organizationId: input.organizationId,
              firstName: entry.firstName,
              lastName: entry.lastName,
              preferredName: entry.preferredName,
              defaultPosition: entry.position
            })
            .returning()
        )[0];

      await tx.insert(seasonRosterEntries).values({
        seasonId: input.seasonId,
        playerId: player.id,
        jerseyNumber: entry.jerseyNumber,
        grade: entry.grade,
        position: entry.position,
        offenseRole: entry.offenseRole,
        defenseRole: entry.defenseRole,
        specialTeamsRole: entry.specialTeamsRole
      });
    }

    return loadSeasonRosterRows(tx, input.seasonId);
  });
}

export async function mergeSeasonRoster(input: ReplaceSeasonRosterInput) {
  const db = getDb();
  await ensureSeasonForOrganization(input);

  return db.transaction(async (tx) => {
    const existingEntries = await tx.query.seasonRosterEntries.findMany({
      where: eq(seasonRosterEntries.seasonId, input.seasonId)
    });
    const existingByJersey = new Map(existingEntries.map((entry) => [entry.jerseyNumber, entry]));

    for (const entry of input.players) {
      const existingPlayer = await tx.query.players.findFirst({
        where: and(
          eq(players.organizationId, input.organizationId),
          eq(players.firstName, entry.firstName),
          eq(players.lastName, entry.lastName)
        )
      });

      const player =
        existingPlayer ??
        (
          await tx
            .insert(players)
            .values({
              organizationId: input.organizationId,
              firstName: entry.firstName,
              lastName: entry.lastName,
              preferredName: entry.preferredName,
              defaultPosition: entry.position
            })
            .returning()
        )[0];

      await tx
        .update(players)
        .set({
          preferredName: entry.preferredName ?? player.preferredName ?? null,
          defaultPosition: entry.position ?? player.defaultPosition ?? null
        })
        .where(eq(players.id, player.id));

      const existingRosterEntry = existingByJersey.get(entry.jerseyNumber);

      if (existingRosterEntry) {
        await tx
          .update(seasonRosterEntries)
          .set({
            playerId: player.id,
            grade: entry.grade,
            position: entry.position,
            offenseRole: entry.offenseRole,
            defenseRole: entry.defenseRole,
            specialTeamsRole: entry.specialTeamsRole
          })
          .where(eq(seasonRosterEntries.id, existingRosterEntry.id));
        continue;
      }

      await tx.insert(seasonRosterEntries).values({
        seasonId: input.seasonId,
        playerId: player.id,
        jerseyNumber: entry.jerseyNumber,
        grade: entry.grade,
        position: entry.position,
        offenseRole: entry.offenseRole,
        defenseRole: entry.defenseRole,
        specialTeamsRole: entry.specialTeamsRole
      });
    }

    return loadSeasonRosterRows(tx, input.seasonId);
  });
}

export async function confirmGameRoster(gameId: string) {
  const db = getDb();
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId)
  });

  if (!game) {
    throw new Error("Game not found.");
  }

  if (game.currentRevision > 0) {
    throw new Error("Roster cannot be reconfirmed after live plays have been logged.");
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
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organizationId, "assistant_coach");

  return db.transaction(async (tx) => {
    const primarySide = await tx.query.gameSides.findFirst({
      where: and(eq(gameSides.gameId, gameId), eq(gameSides.isPrimaryTeam, true))
    });

    if (!primarySide) {
      throw new Error("Primary team side not found for game.");
    }

    const seasonRoster = await tx.query.seasonRosterEntries.findMany({
      where: eq(seasonRosterEntries.seasonId, game.seasonId)
    });

    const playerRecords = await Promise.all(
      seasonRoster.map((entry) =>
        tx.query.players.findFirst({
          where: eq(players.id, entry.playerId)
        })
      )
    );

    await tx.delete(gameRosterEntries).where(eq(gameRosterEntries.gameSideId, primarySide.id));

    if (seasonRoster.length > 0) {
      await tx.insert(gameRosterEntries).values(
        seasonRoster.map((entry, index) => {
          const player = playerRecords[index];
          return {
            gameSideId: primarySide.id,
            seasonRosterEntryId: entry.id,
            jerseyNumber: entry.jerseyNumber,
            displayName:
              player?.preferredName ||
              [player?.firstName, player?.lastName].filter(Boolean).join(" ") ||
              `#${entry.jerseyNumber}`,
            grade: entry.grade,
            position: entry.position
          };
        })
      );
    }

    const updated = await tx
      .update(games)
      .set({
        rosterConfirmedAt: new Date()
      })
      .where(eq(games.id, gameId))
      .returning();

    return {
      game: updated[0],
      confirmedCount: seasonRoster.length
    };
  });
}

export async function deleteTeam(teamId: string) {
  const db = getDb();
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId)
  });

  if (!team) {
    throw new Error("Team not found.");
  }

  await requireOrganizationRole(team.organizationId, "admin");

  const seasonCount = await db
    .select({ value: count() })
    .from(seasons)
    .where(eq(seasons.teamId, teamId));

  if ((seasonCount[0]?.value ?? 0) > 0) {
    throw new Error("Delete or move this team's seasons before removing the team.");
  }

  await db.delete(teams).where(eq(teams.id, teamId));
  return { success: true };
}

export async function deleteSeason(seasonId: string) {
  const db = getDb();
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId)
  });

  if (!season) {
    throw new Error("Season not found.");
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, season.teamId)
  });

  if (!team) {
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organizationId, "head_coach");

  const gameCount = await db
    .select({ value: count() })
    .from(games)
    .where(eq(games.seasonId, seasonId));

  if ((gameCount[0]?.value ?? 0) > 0) {
    throw new Error("This season already has games. Archive it instead of deleting it.");
  }

  await db.delete(seasons).where(eq(seasons.id, seasonId));
  return { success: true };
}

export async function deleteOpponent(opponentId: string) {
  const db = getDb();
  const opponent = await db.query.opponents.findFirst({
    where: eq(opponents.id, opponentId)
  });

  if (!opponent) {
    throw new Error("Opponent not found.");
  }

  await requireOrganizationRole(opponent.organizationId, "assistant_coach");

  const gameCount = await db
    .select({ value: count() })
    .from(games)
    .where(eq(games.opponentId, opponentId));

  if ((gameCount[0]?.value ?? 0) > 0) {
    throw new Error("This opponent has game history. Archive it instead of deleting it.");
  }

  await db.delete(opponents).where(eq(opponents.id, opponentId));
  return { success: true };
}

export async function deleteGame(gameId: string) {
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
    throw new Error("Team not found for season.");
  }

  await requireOrganizationRole(team.organizationId, "assistant_coach");

  const playCount = await db
    .select({ value: count() })
    .from(playEvents)
    .where(eq(playEvents.gameId, gameId));

  if ((playCount[0]?.value ?? 0) > 0 || game.currentRevision > 0) {
    throw new Error("This game already has logged plays. Archive it instead of deleting it.");
  }

  await db.delete(games).where(eq(games.id, gameId));
  return { success: true };
}

export async function deleteVenue(venueId: string) {
  const db = getDb();
  const venue = await db.query.venues.findFirst({
    where: eq(venues.id, venueId)
  });

  if (!venue) {
    throw new Error("Venue not found.");
  }

  await requireOrganizationRole(venue.organizationId, "assistant_coach");

  const gameCount = await db
    .select({ value: count() })
    .from(games)
    .where(eq(games.venueId, venueId));

  if ((gameCount[0]?.value ?? 0) > 0) {
    throw new Error("This venue is already attached to scheduled games. Reassign or clear those games first.");
  }

  await db.delete(venues).where(eq(venues.id, venueId));
  return { success: true };
}
