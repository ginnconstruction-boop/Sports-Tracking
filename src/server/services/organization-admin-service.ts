import { desc, eq, inArray } from "drizzle-orm";
import type { OrganizationDiagnostics } from "@/lib/domain/organization-admin";
import { storageBuckets } from "@/lib/storage/buckets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import {
  games,
  opponents,
  organizations,
  reportExports,
  seasons,
  teams,
  venues
} from "@/server/db/schema";

export async function getOrganizationDiagnostics(organizationId: string) {
  await requireOrganizationRole(organizationId, "admin");
  const db = getDb();

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId)
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const [teamRows, opponentRows, venueRows] = await Promise.all([
    db.query.teams.findMany({ where: eq(teams.organizationId, organizationId) }),
    db.query.opponents.findMany({ where: eq(opponents.organizationId, organizationId) }),
    db.query.venues.findMany({ where: eq(venues.organizationId, organizationId) })
  ]);

  const teamIds = teamRows.map((team) => team.id);
  const seasonRows =
    teamIds.length === 0
      ? []
      : await db.query.seasons.findMany({
          where: inArray(seasons.teamId, teamIds)
        });
  const seasonIds = seasonRows.map((season) => season.id);

  const gameRows =
    seasonIds.length === 0
      ? []
      : await db.query.games.findMany({
          where: inArray(games.seasonId, seasonIds),
          orderBy: desc(games.kickoffAt)
        });
  let exportRows: Array<typeof reportExports.$inferSelect> = [];

  const exportReadinessIssues: string[] = [];
  let reportExportsTableReady = true;
  let exportStorageBucketReady = true;

  try {
    exportRows =
      seasonIds.length === 0
        ? []
        : await db.query.reportExports.findMany({
            where: inArray(reportExports.seasonId, seasonIds)
          });
  } catch (error) {
    reportExportsTableReady = false;
    exportReadinessIssues.push(
      error instanceof Error ? `report_exports query failed: ${error.message}` : "report_exports query failed."
    );
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      throw new Error(error.message);
    }
    exportStorageBucketReady = (data ?? []).some((bucket) => bucket.name === storageBuckets.exports);
    if (!exportStorageBucketReady) {
      exportReadinessIssues.push(`Storage bucket "${storageBuckets.exports}" is missing.`);
    }
  } catch (error) {
    exportStorageBucketReady = false;
    exportReadinessIssues.push(
      error instanceof Error ? `storage bucket check failed: ${error.message}` : "storage bucket check failed."
    );
  }

  const diagnostics: OrganizationDiagnostics = {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    brandingComplete: Boolean(
      organization.publicDisplayName &&
        organization.primaryColor &&
        organization.secondaryColor &&
        organization.accentColor
    ),
    teamCount: teamIds.length,
    seasonCount: seasonRows.length,
    opponentCount: opponentRows.length,
    venueCount: venueRows.length,
    gameCount: gameRows.length,
    liveGameCount: gameRows.filter((game) => game.status === "in_progress").length,
    publicShareCount: gameRows.filter((game) => game.publicLiveEnabled || game.publicReportsEnabled).length,
    exportCount: exportRows.length,
    exportReadiness: {
      reportExportsTableReady,
      exportStorageBucketReady,
      issues: exportReadinessIssues
    },
    activeSeasonCount: seasonRows.filter((season) => season.isActive).length,
    lastGameKickoffAt: gameRows[0]?.kickoffAt?.toISOString() ?? null
  };

  return diagnostics;
}
