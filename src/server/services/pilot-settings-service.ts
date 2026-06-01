import { and, desc, eq } from "drizzle-orm";
import { assertFeatureEnabled } from "@/lib/features/server";
import {
  pilotSettingDefaults,
  pilotSettingKeys,
  type PilotSettingKey,
  type PilotSettingRecord
} from "@/lib/domain/pilot-settings";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { pilotTeamSettingAudits, pilotTeamSettings, teams } from "@/server/db/schema";

type PilotSettingsScope = {
  organizationId: string;
  teamId: string;
};

type UpsertPilotSettingInput = PilotSettingsScope & {
  key: PilotSettingKey;
  enabled: boolean;
};

const defaultAuditLimit = 50;
const maxAuditLimit = 200;

type ListPilotSettingAuditHistoryInput = PilotSettingsScope & {
  limit?: number;
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

export function shouldCreatePilotSettingAudit(previousEnabled: boolean | null, nextEnabled: boolean) {
  return previousEnabled === null || previousEnabled !== nextEnabled;
}

export function clampPilotSettingAuditLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return defaultAuditLimit;
  }

  const normalized = Math.trunc(limit as number);
  if (normalized < 1) {
    return 1;
  }

  if (normalized > maxAuditLimit) {
    return maxAuditLimit;
  }

  return normalized;
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

export async function listPilotSettingAuditHistory(input: ListPilotSettingAuditHistoryInput) {
  assertFeatureEnabled("pilot_settings_server_sync");
  await requireOrganizationRole(input.organizationId, "read_only");
  await assertTeamInOrganization(input);

  const db = getDb();
  const limit = clampPilotSettingAuditLimit(input.limit);
  const records = await db.query.pilotTeamSettingAudits.findMany({
    where: and(
      eq(pilotTeamSettingAudits.organizationId, input.organizationId),
      eq(pilotTeamSettingAudits.teamId, input.teamId)
    ),
    orderBy: [desc(pilotTeamSettingAudits.changedAt)],
    limit
  });

  return {
    organizationId: input.organizationId,
    teamId: input.teamId,
    limit,
    items: records.map((record) => ({
      id: record.id,
      key: record.key as PilotSettingKey,
      previousEnabled: record.previousEnabled,
      nextEnabled: record.nextEnabled,
      changedByUserId: record.changedByUserId,
      changedAt: record.changedAt.toISOString()
    }))
  };
}

export async function upsertPilotSetting(input: UpsertPilotSettingInput) {
  assertFeatureEnabled("pilot_settings_server_sync");
  const { user } = await requireOrganizationRole(input.organizationId, "assistant_coach");
  await assertTeamInOrganization(input);

  const db = getDb();
  const record = await db.transaction(async (tx) => {
    const existing = await tx.query.pilotTeamSettings.findFirst({
      where: and(
        eq(pilotTeamSettings.organizationId, input.organizationId),
        eq(pilotTeamSettings.teamId, input.teamId),
        eq(pilotTeamSettings.key, input.key)
      )
    });

    const [nextRecord] = await tx
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

    if (!nextRecord) {
      throw new Error("Unable to persist pilot setting.");
    }

    const previousEnabled = existing?.enabled ?? null;
    if (shouldCreatePilotSettingAudit(previousEnabled, nextRecord.enabled)) {
      await tx.insert(pilotTeamSettingAudits).values({
        organizationId: nextRecord.organizationId,
        teamId: nextRecord.teamId,
        key: nextRecord.key,
        previousEnabled,
        nextEnabled: nextRecord.enabled,
        changedByUserId: user.id
      });
    }

    return nextRecord;
  });

  return {
    organizationId: record.organizationId,
    teamId: record.teamId,
    ...mapRecord(record.key as PilotSettingKey, record)
  };
}
