import { AppShell } from "@/components/chrome/app-shell";
import { OnboardingConsole } from "@/components/setup/onboarding-console";

export default function OnboardingPage() {
  return (
    <AppShell
      current="onboarding"
      title="Guide one program from setup to first kickoff."
      subtitle="The onboarding flow creates the operational records in order, keeps roster import explicit, and leaves the live game engine untouched until the foundation is ready."
    >
      <OnboardingConsole />
    </AppShell>
  );
}
