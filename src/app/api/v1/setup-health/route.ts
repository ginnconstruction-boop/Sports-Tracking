import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/server/db/client";
import { appUsers, organizationMemberships, organizations } from "@/server/db/schema";

export async function GET() {
  const runtime = getRuntimeConnectionSummary();

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user?.email) {
      return NextResponse.json(
        {
          error: "Authentication required.",
          runtime
        },
        { status: 401 }
      );
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const directDb = getDb();
    const supabaseAdmin = createSupabaseAdminClient();

    const direct = await (async () => {
      try {
        const byId = await directDb
          .select({
            id: appUsers.id,
            email: appUsers.email,
            displayName: appUsers.displayName
          })
          .from(appUsers)
          .where(eq(appUsers.id, user.id))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        const byEmail = await directDb
          .select({
            id: appUsers.id,
            email: appUsers.email,
            displayName: appUsers.displayName
          })
          .from(appUsers)
          .where(sql`lower(${appUsers.email}) = ${normalizedEmail}`)
          .limit(1)
          .then((rows) => rows[0] ?? null);

        const memberships = await directDb
          .select({
            organizationId: organizationMemberships.organizationId,
            role: organizationMemberships.role
          })
          .from(organizationMemberships)
          .where(eq(organizationMemberships.userId, user.id));

        const orgs = await directDb
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug
          })
          .from(organizations)
          .limit(10);

        return {
          ok: true,
          byId,
          byEmail,
          memberships,
          organizations: orgs
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })();

    const admin = await (async () => {
      try {
        const [{ data: byId, error: byIdError }, { data: byEmail, error: byEmailError }, { data: memberships, error: membershipsError }, { data: orgs, error: orgsError }] =
          await Promise.all([
            supabaseAdmin.from("app_users").select("id,email,display_name").eq("id", user.id).maybeSingle(),
            supabaseAdmin.from("app_users").select("id,email,display_name").ilike("email", normalizedEmail).limit(1).maybeSingle(),
            supabaseAdmin
              .from("organization_memberships")
              .select("organization_id,user_id,role")
              .eq("user_id", user.id),
            supabaseAdmin.from("organizations").select("id,name,slug").limit(10)
          ]);

        if (byIdError || byEmailError || membershipsError || orgsError) {
          throw byIdError || byEmailError || membershipsError || orgsError;
        }

        return {
          ok: true,
          byId,
          byEmail,
          memberships,
          organizations: orgs
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })();

    return NextResponse.json({
      runtime,
      auth: {
        id: user.id,
        email: normalizedEmail
      },
      direct,
      admin
    });
  } catch (error) {
    logServerError("setup-health-route", "load_failed", error, runtime);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load setup health.",
        runtime
      },
      { status: 500 }
    );
  }
}
