import { z } from "zod";

export const gameStatusValues = [
  "scheduled",
  "ready",
  "in_progress",
  "final",
  "archived",
  "canceled",
  "postponed"
] as const;

const isoDateTimeWithOffset = z.string().datetime({ offset: true });

export const rosterColumnKeys = [
  "firstName",
  "lastName",
  "preferredName",
  "jerseyNumber",
  "grade",
  "position",
  "offenseRole",
  "defenseRole",
  "specialTeamsRole"
] as const;

export const createTeamInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  level: z.string().min(1).max(80)
});

export const createOrganizationInputSchema = z.object({
  name: z.string().min(1).max(160)
});

export const updateTeamInputSchema = createTeamInputSchema.extend({
  teamId: z.string().uuid(),
  archived: z.boolean().optional()
});

export const createSeasonInputSchema = z.object({
  teamId: z.string().uuid(),
  label: z.string().min(1).max(60),
  year: z.number().int().min(2000).max(2100),
  isActive: z.boolean().default(false)
});

export const updateSeasonInputSchema = createSeasonInputSchema.extend({
  seasonId: z.string().uuid(),
  archived: z.boolean().optional()
});

export const createOpponentInputSchema = z.object({
  organizationId: z.string().uuid(),
  schoolName: z.string().min(1).max(160),
  mascot: z.string().max(120).optional(),
  shortCode: z.string().max(12).optional()
});

export const updateOpponentInputSchema = createOpponentInputSchema.extend({
  opponentId: z.string().uuid(),
  archived: z.boolean().optional()
});

export const createVenueInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(160),
  fieldName: z.string().max(160).optional(),
  addressLine1: z.string().max(160).optional(),
  addressLine2: z.string().max(160).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional()
});

export const updateVenueInputSchema = createVenueInputSchema.extend({
  venueId: z.string().uuid()
});

export const createGameInputSchema = z.object({
  seasonId: z.string().uuid(),
  opponentId: z.string().uuid(),
  venueId: z.string().uuid().optional(),
  kickoffAt: isoDateTimeWithOffset.optional(),
  arrivalAt: isoDateTimeWithOffset.optional(),
  reportAt: isoDateTimeWithOffset.optional(),
  homeAway: z.enum(["home", "away"]),
  status: z.enum(gameStatusValues).default("scheduled"),
  weatherConditions: z.string().max(160).optional(),
  fieldConditions: z.string().max(160).optional(),
  staffNotes: z.string().max(5000).optional(),
  opponentPrepNotes: z.string().max(5000).optional(),
  logisticsNotes: z.string().max(5000).optional()
});

export const updateGameInputSchema = createGameInputSchema.extend({
  gameId: z.string().uuid(),
  status: z.enum(gameStatusValues),
  publicLiveEnabled: z.boolean().optional(),
  publicReportsEnabled: z.boolean().optional()
});

export const updateOrganizationSettingsInputSchema = z.object({
  organizationId: z.string().uuid(),
  publicDisplayName: z.string().min(1).max(160).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  wordmarkPath: z.string().max(255).optional()
});

export const rosterEntryInputSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  preferredName: z.string().max(80).optional(),
  jerseyNumber: z.string().min(1).max(12),
  grade: z.string().max(20).optional(),
  position: z.string().max(30).optional(),
  offenseRole: z.boolean().default(false),
  defenseRole: z.boolean().default(false),
  specialTeamsRole: z.boolean().default(false)
});

export const replaceSeasonRosterInputSchema = z.object({
  organizationId: z.string().uuid(),
  seasonId: z.string().uuid(),
  players: z.array(rosterEntryInputSchema).min(1)
});

const rosterColumnMappingSchema = z.record(
  z.string(),
  z.enum([...rosterColumnKeys, "ignore"] as const)
);

export const importSeasonRosterCsvInputSchema = z.object({
  organizationId: z.string().uuid(),
  csvText: z.string().min(1),
  mode: z.enum(["replace", "merge"]).default("replace"),
  previewOnly: z.boolean().default(false),
  columnMapping: rosterColumnMappingSchema.optional()
});

export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonInputSchema>;
export type UpdateSeasonInput = z.infer<typeof updateSeasonInputSchema>;
export type CreateOpponentInput = z.infer<typeof createOpponentInputSchema>;
export type UpdateOpponentInput = z.infer<typeof updateOpponentInputSchema>;
export type CreateVenueInput = z.infer<typeof createVenueInputSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueInputSchema>;
export type CreateGameInput = z.infer<typeof createGameInputSchema>;
export type UpdateGameInput = z.infer<typeof updateGameInputSchema>;
export type UpdateOrganizationSettingsInput = z.infer<typeof updateOrganizationSettingsInputSchema>;
export type ReplaceSeasonRosterInput = z.infer<typeof replaceSeasonRosterInputSchema>;
export type ImportSeasonRosterCsvInput = z.infer<typeof importSeasonRosterCsvInputSchema>;
export type RosterColumnKey = (typeof rosterColumnKeys)[number];
