import { NextRequest, NextResponse } from "next/server";
import { createOrganizationInputSchema } from "@/lib/contracts/admin";
import { createOrganizationForCurrentUser, getCurrentUserMemberships } from "@/server/auth/context";

export async function GET() {
  try {
    const { memberships } = await getCurrentUserMemberships();
    return NextResponse.json({ items: memberships });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load organizations."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createOrganizationInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await createOrganizationForCurrentUser(parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create organization."
      },
      { status: 500 }
    );
  }
}
