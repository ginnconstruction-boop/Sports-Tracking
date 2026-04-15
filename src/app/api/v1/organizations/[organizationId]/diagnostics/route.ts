import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { getOrganizationDiagnostics } from "@/server/services/organization-admin-service";

type RouteContext = {
  params: Promise<{
    organizationId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isFeatureEnabled("internal_debug_tools")) {
    return NextResponse.json({ error: "Internal diagnostics are disabled." }, { status: 404 });
  }
  const { organizationId } = await context.params;
  const item = await getOrganizationDiagnostics(organizationId);
  return NextResponse.json({ item });
}
