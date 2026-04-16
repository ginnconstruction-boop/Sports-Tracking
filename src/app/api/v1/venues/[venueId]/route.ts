import { NextRequest, NextResponse } from "next/server";
import { updateVenueInputSchema } from "@/lib/contracts/admin";
import { deleteVenue, updateVenue } from "@/server/services/football-admin-service";

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

type Context = {
  params: Promise<{ venueId: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  const { venueId } = await context.params;
  const parsed = updateVenueInputSchema.safeParse({
    ...(await request.json()),
    venueId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await updateVenue(parsed.data);
    return NextResponse.json({ item: mapVenue(item as VenueRow) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update venue." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { venueId } = await context.params;

  try {
    const result = await deleteVenue(venueId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete venue." },
      { status: 400 }
    );
  }
}
