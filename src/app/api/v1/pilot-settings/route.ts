import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pilotSettingKeys } from "@/lib/domain/pilot-settings";
import { FeatureDisabledError } from "@/lib/features/server";
import { listPilotSettingsForTeam, upsertPilotSetting } from "@/server/services/pilot-settings-service";

const pilotSettingsPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid(),
  key: z.enum(pilotSettingKeys),
  enabled: z.boolean()
});

const pilotSettingsQuerySchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid()
});

export async function GET(request: NextRequest) {
  try {
    const parsed = pilotSettingsQuerySchema.safeParse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      teamId: request.nextUrl.searchParams.get("teamId")
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await listPilotSettingsForTeam(parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof FeatureDisabledError) {
      return NextResponse.json({ error: "Pilot settings sync is disabled." }, { status: 404 });
    }
    return NextResponse.json({ error: "Pilot settings sync is unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = pilotSettingsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await upsertPilotSetting(parsed.data);
    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    if (error instanceof FeatureDisabledError) {
      return NextResponse.json({ error: "Pilot settings sync is disabled." }, { status: 404 });
    }
    return NextResponse.json({ error: "Pilot settings sync is unavailable." }, { status: 500 });
  }
}
