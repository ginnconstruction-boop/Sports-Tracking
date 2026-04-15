import { PublicGameView } from "@/components/public/public-game-view";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { notFound } from "next/navigation";
import { getPublicGameReport } from "@/server/services/public-game-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicReportPage({ params }: PageProps) {
  if (!isFeatureEnabled("live_public_tracker")) {
    notFound();
  }
  const { token } = await params;
  const { report, record, branding } = await getPublicGameReport(token);

  return <PublicGameView mode="report" report={report} record={record} branding={branding} />;
}
