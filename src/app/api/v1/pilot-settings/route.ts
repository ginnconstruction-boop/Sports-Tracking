import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertFeatureEnabled, FeatureDisabledError } from "@/lib/features/server";

const pilotSettingsPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid(),
  key: z.enum(["minimal_mode", "required_fields_only", "coach_ready_shortcuts"]),
  enabled: z.boolean()
});

export async function POST(request: NextRequest) {
  try {
    assertFeatureEnabled("pilot_settings_server_sync");
    const payload = await request.json();
    const parsed = pilotSettingsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Stub endpoint: local scoped storage remains the source of truth until a DB-backed settings table is added.
    return NextResponse.json(
      {
        item: {
          ...parsed.data,
          persisted: false
        }
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof FeatureDisabledError) {
      return NextResponse.json({ error: "Pilot settings sync is disabled." }, { status: 404 });
    }
    return NextResponse.json({ error: "Pilot settings sync is unavailable." }, { status: 500 });
  }
}
