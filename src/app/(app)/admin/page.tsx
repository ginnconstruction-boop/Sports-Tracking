import { OrganizationAdminConsole } from "@/components/admin/organization-admin-console";
import { FeatureFlagPanel } from "@/components/admin/feature-flag-panel";
import { AppShell } from "@/components/chrome/app-shell";
import { canInspectFeatureFlags, isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getCurrentUserMemberships } from "@/server/auth/context";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isFeatureEnabled("internal_debug_tools")) {
    notFound();
  }
  const { memberships } = await getCurrentUserMemberships();

  return (
    <AppShell
      current="admin"
      title="Organization readiness and beta operations."
      subtitle="Use this workspace to review branding completeness, schedule coverage, public sharing posture, and rollout diagnostics for each organization."
    >
      <section className="section-grid">
        <OrganizationAdminConsole memberships={memberships} />
        {canInspectFeatureFlags() ? <FeatureFlagPanel /> : null}
      </section>
    </AppShell>
  );
}
