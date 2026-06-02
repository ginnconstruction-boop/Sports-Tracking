import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPilotSettingsForTeam } from "@/server/services/pilot-settings-service";
import { pilotSettingsErrorResponse } from "@/app/api/v1/pilot-settings/route-helpers";

const pilotSettingsResetSchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  try {
    const parsed = pilotSettingsResetSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await resetPilotSettingsForTeam(parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return pilotSettingsErrorResponse(error, "Pilot settings reset is unavailable.");
  }
}
