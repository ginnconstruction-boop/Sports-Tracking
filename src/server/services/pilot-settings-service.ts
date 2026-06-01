import { and, eq } from "drizzle-orm";
import { assertFeatureEnabled } from "@/lib/features/server";
import {
  pilotSettingDefaults,
  pilotSettingKeys,
  type PilotSettingKey,
  type PilotSettingRecord
} from "@/lib/domain/pilot-settings";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { pilotTeamSettings, teams } from "@/server/db/schema";

type PilotSettingsScope = {
  organizationId: string;
  teamId: string;
};

type UpsertPilotSettingInput = PilotSettingsScope & {
  key: PilotSettingKey;
  enabled: boolean;
};

async function assertTeamInOrganization(scope: PilotSettingsScope) {
  const db = getDb();
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.id, scope.teamId), eq(teams.organizationId, scope.organizationId))
  });

  if (!team) {
    throw new Error("Team not found for organization.");
  }
}

function mapRecord(
  key: PilotSettingKey,
  record?: typeof pilotTeamSettings.$inferSelect
): PilotSettingRecord {
  return {
    key,
    enabled: record?.enabled ?? pilotSettingDefaults[key],
    updatedAt: record?.updatedAt?.toISOString() ?? null
  };
}

export async function listPilotSettingsForTeam(scope: PilotSettingsScope) {
  assertFeatureEnabled("pilot_settings_server_sync");
  await requireOrganizationRole(scope.organizationId, "read_only");
  await assertTeamInOrganization(scope);

  const db = getDb();
  const records = await db.query.pilotTeamSettings.findMany({
    where: and(
      eq(pilotTeamSettings.organizationId, scope.organizationId),
      eq(pilotTeamSettings.teamId, scope.teamId)
    )
  });

  const byKey = new Map(records.map((record) => [record.key as PilotSettingKey, record]));
  return {
    organizationId: scope.organizationId,
    teamId: scope.teamId,
    items: pilotSettingKeys.map((key) => mapRecord(key, byKey.get(key)))
  };
}

export async function upsertPilotSetting(input: UpsertPilotSettingInput) {
  assertFeatureEnabled("pilot_settings_server_sync");
  const { user } = await requireOrganizationRole(input.organizationId, "assistant_coach");
  await assertTeamInOrganization(input);

  const db = getDb();
  const [record] = await db
    .insert(pilotTeamSettings)
    .values({
      organizationId: input.organizationId,
      teamId: input.teamId,
      key: input.key,
      enabled: input.enabled,
      updatedByUserId: user.id
    })
    .onConflictDoUpdate({
      target: [pilotTeamSettings.organizationId, pilotTeamSettings.teamId, pilotTeamSettings.key],
      set: {
        enabled: input.enabled,
        updatedByUserId: user.id,
        updatedAt: new Date()
      }
    })
    .returning();

  if (!record) {
    throw new Error("Unable to persist pilot setting.");
  }

  return {
    organizationId: record.organizationId,
    teamId: record.teamId,
    ...mapRecord(record.key as PilotSettingKey, record)
  };
}
