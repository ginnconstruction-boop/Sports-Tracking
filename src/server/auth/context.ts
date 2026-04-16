import { and, eq } from "drizzle-orm";
import { hasRoleAccess, type MembershipRole } from "@/lib/auth/roles";
import { isEmailAllowedForPrivateBeta, isPrivateBetaInviteOnly } from "@/lib/auth/private-beta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { appUsers, organizationMemberships, organizations } from "@/server/db/schema";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function ensureStarterOrganizationMembership(user: { id: string; email: string; displayName: string }) {
  const db = getDb();
  const baseName = user.displayName.trim() || user.email.split("@")[0] || "Tracking the Game";
  const organizationName = `${baseName} Program`;
  const slugBase = slugify(baseName) || "tracking-the-game";
  const slug = `${slugBase}-${user.id.slice(0, 8)}`.slice(0, 80);

  const existingOrganization =
    (await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug)
    })) ??
    (
      await db
        .insert(organizations)
        .values({
          name: organizationName,
          slug
        })
        .returning()
    )[0];

  const existingMembership = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, existingOrganization.id),
      eq(organizationMemberships.userId, user.id)
    )
  });

  if (!existingMembership) {
    await db.insert(organizationMemberships).values({
      organizationId: existingOrganization.id,
      userId: user.id,
      role: "admin"
    });
  }
}

export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication required.");
  }

  const email = user.email;

  if (!email) {
    throw new Error("Authenticated user must have an email address.");
  }

  if (isPrivateBetaInviteOnly() && !isEmailAllowedForPrivateBeta(email)) {
    throw new Error("This account is not approved for the private beta.");
  }

  const db = getDb();
  const existing = await db.query.appUsers.findFirst({
    where: eq(appUsers.id, user.id)
  });

  if (existing) {
    return existing;
  }

  const inserted = await db
    .insert(appUsers)
    .values({
      id: user.id,
      email,
      displayName:
        user.user_metadata.full_name ??
        [user.user_metadata.first_name, user.user_metadata.last_name].filter(Boolean).join(" ") ??
        email
    })
    .returning();

  return inserted[0];
}

export async function requireOrganizationRole(organizationId: string, minimumRole: MembershipRole) {
  const user = await requireAuthenticatedUser();
  const db = getDb();

  const membership = await db.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.userId, user.id)
    )
  });

  if (!membership || !hasRoleAccess(membership.role, minimumRole)) {
    throw new Error("Insufficient permissions for this organization.");
  }

  return {
    user,
    membership
  };
}

export async function getCurrentUserMemberships() {
  const user = await requireAuthenticatedUser();
  const db = getDb();

  const loadMemberships = () =>
    db
      .select({
        organizationId: organizationMemberships.organizationId,
        role: organizationMemberships.role,
        organizationName: organizations.name,
        organizationSlug: organizations.slug
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(eq(organizationMemberships.userId, user.id));

  let memberships = await loadMemberships();

  if (memberships.length === 0) {
    await ensureStarterOrganizationMembership(user);
    memberships = await loadMemberships();
  }

  return {
    user,
    memberships
  };
}
