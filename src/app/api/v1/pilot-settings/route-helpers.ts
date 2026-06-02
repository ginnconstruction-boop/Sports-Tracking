import { NextResponse } from "next/server";
import { FeatureDisabledError } from "@/lib/features/server";

export function pilotSettingsErrorResponse(error: unknown, unavailableMessage: string) {
  if (error instanceof FeatureDisabledError) {
    return NextResponse.json({ error: "Pilot settings sync is disabled." }, { status: 404 });
  }

  if (error instanceof Error) {
    if (error.message === "Authentication required.") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error.message === "Insufficient permissions for this organization.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error.message === "Team not found for organization.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
  }

  return NextResponse.json({ error: unavailableMessage }, { status: 500 });
}
