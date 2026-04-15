import { AnalyticsConsole } from "@/components/analytics/analytics-console";
import { AppShell } from "@/components/chrome/app-shell";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getCurrentUserMemberships } from "@/server/auth/context";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  if (!isFeatureEnabled("advanced_analytics")) {
    notFound();
  }
  const { memberships } = await getCurrentUserMemberships();

  return (
    <AppShell
      current="analytics"
      title="Season analytics"
      subtitle="Trend reporting, opponent history, and situational football derived from the same play-log-first game engine."
    >
      <AnalyticsConsole memberships={memberships} />
    </AppShell>
  );
}
