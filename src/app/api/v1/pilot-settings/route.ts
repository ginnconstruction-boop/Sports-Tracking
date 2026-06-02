import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pilotSettingKeys } from "@/lib/domain/pilot-settings";
import { listPilotSettingsForTeam, upsertPilotSetting } from "@/server/services/pilot-settings-service";
import { pilotSettingsErrorResponse } from "@/app/api/v1/pilot-settings/route-helpers";

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
    return pilotSettingsErrorResponse(error, "Pilot settings sync is unavailable.");
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
    return pilotSettingsErrorResponse(error, "Pilot settings sync is unavailable.");
  }
}
