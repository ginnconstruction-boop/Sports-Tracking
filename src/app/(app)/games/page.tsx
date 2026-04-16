import { AppShell } from "@/components/chrome/app-shell";
import { GamesPageConsole } from "@/components/games/games-page-console";

export const dynamic = "force-dynamic";

export default function GamesPage() {
  return (
    <AppShell
      current="games"
      title="Every scheduled game in one place."
      subtitle="Use this board to move from season setup into game admin, then into Game Day and reports without dead-end navigation."
    >
      <GamesPageConsole />
    </AppShell>
  );
}
