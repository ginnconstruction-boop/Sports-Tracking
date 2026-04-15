import { NextRequest, NextResponse } from "next/server";
import { updateVenueInputSchema } from "@/lib/contracts/admin";
import { deleteVenue, updateVenue } from "@/server/services/football-admin-service";

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
    return NextResponse.json({ item });
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
