import { and, eq } from "drizzle-orm";
import type { UpdateOrganizationSettingsInput } from "@/lib/contracts/admin";
import { assertFeatureEnabled } from "@/lib/features/server";
import type { OrganizationBranding } from "@/lib/domain/organization-settings";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { organizations } from "@/server/db/schema";

function toBranding(record: typeof organizations.$inferSelect): OrganizationBranding {
  return {
    organizationId: record.id,
    name: record.name,
    slug: record.slug,
    publicDisplayName: record.publicDisplayName,
    primaryColor: record.primaryColor,
    secondaryColor: record.secondaryColor,
    accentColor: record.accentColor,
    wordmarkPath: record.wordmarkPath
  };
}

export async function getOrganizationBranding(organizationId: string, options: { skipAuth?: boolean } = {}) {
  assertFeatureEnabled("organization_branding");
  if (!options.skipAuth) {
    await requireOrganizationRole(organizationId, "read_only");
  }
  const db = getDb();
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId)
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  return toBranding(organization);
}

export async function updateOrganizationBranding(input: UpdateOrganizationSettingsInput) {
  assertFeatureEnabled("organization_branding");
  await requireOrganizationRole(input.organizationId, "admin");
  const db = getDb();
  const updated = await db
    .update(organizations)
    .set({
      publicDisplayName: input.publicDisplayName ?? null,
      primaryColor: input.primaryColor ?? null,
      secondaryColor: input.secondaryColor ?? null,
      accentColor: input.accentColor ?? null,
      wordmarkPath: input.wordmarkPath ?? null
    })
    .where(eq(organizations.id, input.organizationId))
    .returning();

  if (!updated[0]) {
    throw new Error("Organization not found.");
  }

  return toBranding(updated[0]);
}
