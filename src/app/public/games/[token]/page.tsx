import { PublicGameView } from "@/components/public/public-game-view";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getPublicLiveGame } from "@/server/services/public-game-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicGamePage({ params }: PageProps) {
  if (!isFeatureEnabled("live_public_tracker")) {
    notFound();
  }
  const { token } = await params;
  const { snapshot, record, branding } = await getPublicLiveGame(token);

  return <PublicGameView mode="live" snapshot={snapshot} record={record} branding={branding} />;
}
