import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membershipRoleEnum = pgEnum("membership_role", [
  "admin",
  "head_coach",
  "stat_operator",
  "assistant_coach",
  "read_only"
]);

export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "ready",
  "in_progress",
  "final",
  "archived",
  "canceled",
  "postponed"
]);
export const gameSideEnum = pgEnum("game_side", ["home", "away"]);
export const gameSessionStatusEnum = pgEnum("game_session_status", [
  "local_only",
  "syncing",
  "synced",
  "conflict"
]);

export const playTypeEnum = pgEnum("play_type", [
  "run",
  "pass",
  "sack",
  "kneel",
  "spike",
  "punt",
  "kickoff",
  "extra_point",
  "two_point_try",
  "field_goal",
  "penalty",
  "turnover"
]);

export const penaltyResultEnum = pgEnum("penalty_result", ["accepted", "declined", "offsetting"]);
export const penaltyEnforcementEnum = pgEnum("penalty_enforcement", [
  "previous_spot",
  "spot",
  "dead_ball",
  "succeeding_spot"
]);
export const penaltyTimingEnum = pgEnum("penalty_timing", [
  "live_ball",
  "dead_ball",
  "post_possession",
  "post_score"
]);
export const playParticipantRoleEnum = pgEnum("play_participant_role", [
  "passer",
  "target",
  "ball_carrier",
  "runner",
  "solo_tackle",
  "assist_tackle",
  "sack_credit",
  "tfl_credit",
  "hurry_credit",
  "pass_breakup",
  "interceptor",
  "forced_fumble",
  "fumble_recovery",
  "returner",
  "kicker",
  "punter",
  "long_snapper",
  "holder",
  "block_credit"
]);

export const exportStatusEnum = pgEnum("export_status", ["queued", "processing", "complete", "failed"]);
export const playAuditActionEnum = pgEnum("play_audit_action", ["created", "updated", "deleted"]);
const supabaseAuth = pgSchema("auth");

export const authUsers = supabaseAuth.table("users", {
  id: uuid("id").primaryKey()
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    publicDisplayName: varchar("public_display_name", { length: 160 }),
    primaryColor: varchar("primary_color", { length: 16 }),
    secondaryColor: varchar("secondary_color", { length: 16 }),
    accentColor: varchar("accent_color", { length: 16 }),
    wordmarkPath: varchar("wordmark_path", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug)
  })
);

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 191 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex("app_users_email_idx").on(table.email)
  })
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.userId] })
  })
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    level: varchar("level", { length: 80 }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    logoPath: varchar("logo_path", { length: 255 }),
    sport: varchar("sport", { length: 40 }).default("football").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    orgNameIdx: uniqueIndex("teams_org_name_level_idx").on(table.organizationId, table.name, table.level)
  })
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 60 }).notNull(),
    year: integer("year").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    teamYearIdx: uniqueIndex("seasons_team_year_idx").on(table.teamId, table.year)
  })
);

export const opponents = pgTable(
  "opponents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    schoolName: varchar("school_name", { length: 160 }).notNull(),
    mascot: varchar("mascot", { length: 120 }),
    shortCode: varchar("short_code", { length: 12 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    orgOpponentIdx: uniqueIndex("opponents_org_school_idx").on(table.organizationId, table.schoolName)
  })
);

export const venues = pgTable("venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  fieldName: varchar("field_name", { length: 160 }),
  addressLine1: varchar("address_line_1", { length: 160 }),
  addressLine2: varchar("address_line_2", { length: 160 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 120 }),
  postalCode: varchar("postal_code", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  preferredName: varchar("preferred_name", { length: 80 }),
  defaultPosition: varchar("default_position", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const seasonRosterEntries = pgTable(
  "season_roster_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    jerseyNumber: varchar("jersey_number", { length: 12 }).notNull(),
    grade: varchar("grade", { length: 20 }),
    position: varchar("position", { length: 30 }),
    offenseRole: boolean("offense_role").default(false).notNull(),
    defenseRole: boolean("defense_role").default(false).notNull(),
    specialTeamsRole: boolean("special_teams_role").default(false).notNull()
  },
  (table) => ({
    seasonJerseyIdx: uniqueIndex("season_roster_entries_season_jersey_idx").on(
      table.seasonId,
      table.jerseyNumber
    )
  })
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    opponentId: uuid("opponent_id")
      .notNull()
      .references(() => opponents.id),
    venueId: uuid("venue_id").references(() => venues.id),
    status: gameStatusEnum("status").default("scheduled").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    arrivalAt: timestamp("arrival_at", { withTimezone: true }),
    reportAt: timestamp("report_at", { withTimezone: true }),
    homeAway: gameSideEnum("home_away").notNull(),
    weatherConditions: varchar("weather_conditions", { length: 160 }),
    fieldConditions: varchar("field_conditions", { length: 160 }),
    staffNotes: text("staff_notes"),
    opponentPrepNotes: text("opponent_prep_notes"),
    logisticsNotes: text("logistics_notes"),
    rosterConfirmedAt: timestamp("roster_confirmed_at", { withTimezone: true }),
    publicShareToken: uuid("public_share_token").defaultRandom().notNull(),
    publicLiveEnabled: boolean("public_live_enabled").default(false).notNull(),
    publicReportsEnabled: boolean("public_reports_enabled").default(false).notNull(),
    currentRevision: integer("current_revision").default(0).notNull(),
    lastRebuiltAt: timestamp("last_rebuilt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    seasonIdx: index("games_season_idx").on(table.seasonId),
    publicTokenIdx: uniqueIndex("games_public_share_token_idx").on(table.publicShareToken)
  })
);

export const gameSides = pgTable(
  "game_sides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    side: gameSideEnum("side").notNull(),
    isPrimaryTeam: boolean("is_primary_team").default(false).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    shortCode: varchar("short_code", { length: 12 }),
    finalScore: integer("final_score").default(0).notNull()
  },
  (table) => ({
    gameSideIdx: uniqueIndex("game_sides_game_side_idx").on(table.gameId, table.side)
  })
);

export const gameRosterEntries = pgTable(
  "game_roster_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameSideId: uuid("game_side_id")
      .notNull()
      .references(() => gameSides.id, { onDelete: "cascade" }),
    seasonRosterEntryId: uuid("season_roster_entry_id").references(() => seasonRosterEntries.id),
    jerseyNumber: varchar("jersey_number", { length: 12 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    grade: varchar("grade", { length: 20 }),
    position: varchar("position", { length: 30 })
  },
  (table) => ({
    gameSideJerseyIdx: uniqueIndex("game_roster_entries_game_side_jersey_idx").on(
      table.gameSideId,
      table.jerseyNumber
    )
  })
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    deviceKey: varchar("device_key", { length: 120 }).notNull(),
    userId: uuid("user_id").references(() => appUsers.id),
    status: gameSessionStatusEnum("status").default("local_only").notNull(),
    isActiveWriter: boolean("is_active_writer").default(false).notNull(),
    writerLeaseExpiresAt: timestamp("writer_lease_expires_at", { withTimezone: true }),
    localRevision: integer("local_revision").default(0).notNull(),
    remoteRevision: integer("remote_revision").default(0).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    sessionIdx: uniqueIndex("game_sessions_game_device_idx").on(table.gameId, table.deviceKey),
    activeWriterIdx: uniqueIndex("game_sessions_active_writer_idx")
      .on(table.gameId)
      .where(sql`${table.isActiveWriter} = true`)
  })
);

export const playEvents = pgTable(
  "play_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    sequence: numeric("sequence", { precision: 24, scale: 12 }).notNull(),
    quarter: integer("quarter").notNull(),
    clockSeconds: integer("clock_seconds").notNull(),
    possession: gameSideEnum("possession").notNull(),
    playType: playTypeEnum("play_type").notNull(),
    payload: jsonb("payload").notNull(),
    summary: text("summary"),
    clientMutationId: uuid("client_mutation_id"),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    gameSequenceIdx: uniqueIndex("play_events_game_sequence_idx").on(table.gameId, table.sequence),
    clientMutationIdx: uniqueIndex("play_events_game_client_mutation_idx")
      .on(table.gameId, table.clientMutationId)
      .where(sql`${table.clientMutationId} is not null`),
    gameIdx: index("play_events_game_idx").on(table.gameId)
  })
);

export const playEventAudits = pgTable(
  "play_event_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playId: uuid("play_id")
      .notNull()
      .references(() => playEvents.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    action: playAuditActionEnum("action").notNull(),
    previousSnapshot: jsonb("previous_snapshot"),
    nextSnapshot: jsonb("next_snapshot").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    playIdx: index("play_event_audits_play_idx").on(table.playId),
    gameIdx: index("play_event_audits_game_idx").on(table.gameId)
  })
);

export const playParticipants = pgTable(
  "play_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playId: uuid("play_id")
      .notNull()
      .references(() => playEvents.id, { onDelete: "cascade" }),
    gameRosterEntryId: uuid("game_roster_entry_id").references(() => gameRosterEntries.id),
    role: playParticipantRoleEnum("role").notNull(),
    side: gameSideEnum("side").notNull(),
    creditUnits: integer("credit_units").default(1).notNull(),
    statPayload: jsonb("stat_payload")
  },
  (table) => ({
    playIdx: index("play_participants_play_idx").on(table.playId)
  })
);

export const playPenalties = pgTable("play_penalties", {
  id: uuid("id").defaultRandom().primaryKey(),
  playId: uuid("play_id")
    .notNull()
    .references(() => playEvents.id, { onDelete: "cascade" }),
  penalizedSide: gameSideEnum("penalized_side").notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  yards: integer("yards").notNull(),
  result: penaltyResultEnum("result").notNull(),
  enforcementType: penaltyEnforcementEnum("enforcement_type").notNull(),
  timing: penaltyTimingEnum("timing").notNull(),
  foulSpot: jsonb("foul_spot"),
  automaticFirstDown: boolean("automatic_first_down").default(false).notNull(),
  lossOfDown: boolean("loss_of_down").default(false).notNull(),
  replayDown: boolean("replay_down").default(false).notNull(),
  noPlay: boolean("no_play").default(false).notNull()
});

export const gameStateCaches = pgTable("game_state_caches", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  state: jsonb("state").notNull(),
  timelinePreview: jsonb("timeline_preview"),
  rebuiltAt: timestamp("rebuilt_at", { withTimezone: true }).defaultNow().notNull()
});

export const reportExports = pgTable("report_exports", {
  id: uuid("id").defaultRandom().primaryKey(),
  gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "cascade" }),
  reportType: varchar("report_type", { length: 60 }).notNull(),
  format: varchar("format", { length: 20 }).notNull(),
  status: exportStatusEnum("status").default("queued").notNull(),
  requestedByUserId: uuid("requested_by_user_id").references(() => appUsers.id),
  storageBucket: varchar("storage_bucket", { length: 80 }),
  storagePath: varchar("storage_path", { length: 255 }),
  contentType: varchar("content_type", { length: 120 }),
  fileSizeBytes: integer("file_size_bytes"),
  errorMessage: text("error_message"),
  payload: jsonb("payload"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const playReviewAnnotations = pgTable(
  "play_review_annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playId: uuid("play_id")
      .notNull()
      .references(() => playEvents.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    note: text("note"),
    filmUrl: varchar("film_url", { length: 500 }),
    updatedByUserId: uuid("updated_by_user_id").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    playIdx: uniqueIndex("play_review_annotations_play_idx").on(table.playId),
    gameIdx: index("play_review_annotations_game_idx").on(table.gameId)
  })
);
