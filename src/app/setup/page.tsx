import { AppShell } from "@/components/chrome/app-shell";
import { SetupConsole } from "@/components/setup/setup-console";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <AppShell
      current="setup"
      title="Program setup without leaving the product."
      subtitle="Manage teams, seasons, opponents, and roster imports from the same operational surface that feeds live Game Day use."
    >
      <SetupConsole />
    </AppShell>
  );
}
