import type { PostgrestError } from "@supabase/supabase-js";
import type { CreateOrganizationInput } from "@/lib/contracts/admin";
import { hasRoleAccess, type MembershipRole } from "@/lib/auth/roles";
import { isEmailAllowedForPrivateBeta, isPrivateBetaInviteOnly } from "@/lib/auth/private-beta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

type OrganizationMembership = {
  organizationId: string;
  role: MembershipRole;
  organizationName: string;
  organizationSlug: string;
};

type AppUserRow = {
  id: string;
  email: string;
  display_name: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

type MembershipRow = {
  organization_id: string;
  user_id?: string;
  role: MembershipRole;
  organizations?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mapAppUser(row: AppUserRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name
  };
}

function unwrapOrganization(
  value: MembershipRow["organizations"]
): { name: string; slug: string } | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function isNoRowsError(error: PostgrestError | null) {
  return error?.code === "PGRST116";
}

async function findAppUserByEmail(email: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,email,display_name")
    .ilike("email", email)
    .limit(1)
    .maybeSingle<AppUserRow>();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ? mapAppUser(data) : null;
}

async function ensureStarterOrganizationMembership(user: AuthenticatedUser) {
  const baseName = user.displayName.trim() || user.email.split("@")[0] || "Tracking the Game";
  await createOrganizationForUserRecord(user, { name: `${baseName} Program` });
}

async function createOrganizationForUserRecord(user: AuthenticatedUser, input: CreateOrganizationInput) {
  const supabaseAdmin = createSupabaseAdminClient();
  const slugBase = slugify(input.name) || "tracking-the-game";
  const slug = `${slugBase}-${user.id.slice(0, 8)}`.slice(0, 80);

  const { data: existingOrganization, error: existingError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", slug)
    .maybeSingle<OrganizationRow>();

  if (existingError && !isNoRowsError(existingError)) {
    throw existingError;
  }

  let organization = existingOrganization;

  if (!organization) {
    const { data: insertedOrganization, error: insertError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: input.name,
        slug
      })
      .select("id,name,slug")
      .single<OrganizationRow>();

    if (insertError) {
      throw insertError;
    }

    organization = insertedOrganization;
  }

  const { error: membershipError } = await supabaseAdmin.from("organization_memberships").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      role: "admin"
    },
    {
      onConflict: "organization_id,user_id"
    }
  );

  if (membershipError) {
    throw membershipError;
  }

  return organization;
}

async function loadMembershipsForUser(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("organization_id,role,organizations!inner(name,slug)")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((item) => {
      const row = item as MembershipRow;
      const organization = unwrapOrganization(row.organizations);
      if (!organization) {
        return null;
      }

      return {
        organizationId: row.organization_id,
        role: row.role,
        organizationName: organization.name,
        organizationSlug: organization.slug
      } satisfies OrganizationMembership;
    })
    .filter((item): item is OrganizationMembership => item !== null);
}

export async function createOrganizationForCurrentUser(input: CreateOrganizationInput) {
  const user = await requireAuthenticatedUser();
  return createOrganizationForUserRecord(user, input);
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

  const normalizedEmail = email.trim().toLowerCase();

  if (isPrivateBetaInviteOnly() && !isEmailAllowedForPrivateBeta(normalizedEmail)) {
    throw new Error("This account is not approved for the private beta.");
  }

  const displayName =
    user.user_metadata.full_name ??
    [user.user_metadata.first_name, user.user_metadata.last_name].filter(Boolean).join(" ") ??
    normalizedEmail;

  const supabaseAdmin = createSupabaseAdminClient();

  try {
    const { data, error: upsertError } = await supabaseAdmin
      .from("app_users")
      .upsert(
        {
          id: user.id,
          email: normalizedEmail,
          display_name: displayName
        },
        {
          onConflict: "id"
        }
      )
      .select("id,email,display_name")
      .single<AppUserRow>();

    if (upsertError) {
      throw upsertError;
    }

    return mapAppUser(data);
  } catch (error) {
    const existingByEmail = await findAppUserByEmail(normalizedEmail);

    if (existingByEmail) {
      return existingByEmail;
    }

    throw error;
  }
}

export async function requireOrganizationRole(organizationId: string, minimumRole: MembershipRole) {
  const user = await requireAuthenticatedUser();
  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("organization_id,user_id,role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle<{ organization_id: string; user_id: string; role: MembershipRole }>();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  if (!data || !hasRoleAccess(data.role, minimumRole)) {
    throw new Error("Insufficient permissions for this organization.");
  }

  return {
    user,
    membership: {
      organizationId: data.organization_id,
      userId: data.user_id,
      role: data.role
    }
  };
}

export async function getCurrentUserMemberships() {
  const user = await requireAuthenticatedUser();
  let memberships = await loadMembershipsForUser(user.id);

  if (memberships.length === 0) {
    await ensureStarterOrganizationMembership(user);
    memberships = await loadMembershipsForUser(user.id);
  }

  return {
    user,
    memberships
  };
}
