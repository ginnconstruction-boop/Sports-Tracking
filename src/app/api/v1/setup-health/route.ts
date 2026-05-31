import { NextResponse } from "next/server";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { storageBuckets } from "@/lib/storage/buckets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const supabaseAdmin = createSupabaseAdminClient();

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

    const exportReadiness = await (async () => {
      const issues: string[] = [];
      let reportExportsTableReady = true;
      let exportStorageBucketReady = true;

      try {
        const { error } = await supabaseAdmin.from("report_exports").select("id").limit(1);
        if (error) {
          throw error;
        }
      } catch (error) {
        reportExportsTableReady = false;
        issues.push(error instanceof Error ? `report_exports query failed: ${error.message}` : "report_exports query failed.");
      }

      try {
        const buckets = await supabaseAdmin.storage.listBuckets();
        if (buckets.error) {
          throw buckets.error;
        }
        exportStorageBucketReady = (buckets.data ?? []).some((bucket) => bucket.name === storageBuckets.exports);
        if (!exportStorageBucketReady) {
          issues.push(`Storage bucket "${storageBuckets.exports}" is missing.`);
        }
      } catch (error) {
        exportStorageBucketReady = false;
        issues.push(error instanceof Error ? `storage bucket check failed: ${error.message}` : "storage bucket check failed.");
      }

      return {
        reportExportsTableReady,
        exportStorageBucketReady,
        issues
      };
    })();

    return NextResponse.json({
      runtime,
      auth: {
        id: user.id,
        email: normalizedEmail
      },
      admin,
      exportReadiness
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
