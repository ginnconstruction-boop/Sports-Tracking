import { NextResponse } from "next/server";
import { getCurrentUserMemberships } from "@/server/auth/context";

export async function GET() {
  try {
    const { user, memberships } = await getCurrentUserMemberships();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      memberships
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load current user."
      },
      { status: 500 }
    );
  }
}
