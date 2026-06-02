import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPilotSettingAuditHistory } from "@/server/services/pilot-settings-service";
import { pilotSettingsErrorResponse } from "@/app/api/v1/pilot-settings/route-helpers";

const pilotSettingsAuditQuerySchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid(),
  limit: z.coerce.number().int().positive().optional()
});

export async function GET(request: NextRequest) {
  try {
    const parsed = pilotSettingsAuditQuerySchema.safeParse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      teamId: request.nextUrl.searchParams.get("teamId"),
      limit: request.nextUrl.searchParams.get("limit") ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await listPilotSettingAuditHistory(parsed.data);
    return NextResponse.json({ item });
  } catch (error) {
    return pilotSettingsErrorResponse(error, "Pilot settings audit history is unavailable.");
  }
}
