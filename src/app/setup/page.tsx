import { AppShell } from "@/components/chrome/app-shell";
import { SetupConsole } from "@/components/setup/setup-console";
import { getCurrentUserMemberships } from "@/server/auth/context";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { memberships } = await getCurrentUserMemberships();

  return (
    <AppShell
      current="setup"
      title="Program setup without leaving the product."
      subtitle="Manage teams, seasons, opponents, and roster imports from the same operational surface that feeds live Game Day use."
    >
      <SetupConsole memberships={memberships} />
    </AppShell>
  );
}
