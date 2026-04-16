import { NextRequest, NextResponse } from "next/server";
import { createVenueInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { createVenue } from "@/server/services/football-admin-service";

type VenueRow = {
  id: string;
  organization_id: string;
  name: string;
  field_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

function mapVenue(row: VenueRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    fieldName: row.field_name,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code
  };
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
    }

    await requireOrganizationRole(organizationId, "read_only");
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: (data ?? []).map((row) => mapVenue(row as VenueRow)) });
  } catch (error) {
    logServerError("venues-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load venues.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createVenueInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await createVenue(parsed.data);
    return NextResponse.json({ item: mapVenue(item as VenueRow) }, { status: 201 });
  } catch (error) {
    logServerError("venues-route", "create_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create venue.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
