import { and, eq } from "drizzle-orm";
import { hasRoleAccess, type MembershipRole } from "@/lib/auth/roles";
import { isEmailAllowedForPrivateBeta, isPrivateBetaInviteOnly } from "@/lib/auth/private-beta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { appUsers, organizationMemberships, organizations } from "@/server/db/schema";

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

  const memberships = await db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
      organizationName: organizations.name,
      organizationSlug: organizations.slug
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(eq(organizationMemberships.userId, user.id));

  return {
    user,
    memberships
  };
}
