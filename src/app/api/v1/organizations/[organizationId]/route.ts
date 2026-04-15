import { NextRequest, NextResponse } from "next/server";
import { updateOrganizationSettingsInputSchema } from "@/lib/contracts/admin";
import { isFeatureEnabled } from "@/lib/features/runtime";
import {
  getOrganizationBranding,
  updateOrganizationBranding
} from "@/server/services/organization-settings-service";

type Context = {
  params: Promise<{
    organizationId: string;
  }>;
};

export async function GET(_request: NextRequest, context: Context) {
  if (!isFeatureEnabled("organization_branding")) {
    return NextResponse.json({ error: "Organization branding is disabled." }, { status: 404 });
  }
  const { organizationId } = await context.params;
  const item = await getOrganizationBranding(organizationId);
  return NextResponse.json({ item });
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("organization_branding")) {
    return NextResponse.json({ error: "Organization branding is disabled." }, { status: 404 });
  }
  const { organizationId } = await context.params;
  const json = await request.json();
  const parsed = updateOrganizationSettingsInputSchema.safeParse({
    ...json,
    organizationId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await updateOrganizationBranding(parsed.data);
  return NextResponse.json({ item });
}
