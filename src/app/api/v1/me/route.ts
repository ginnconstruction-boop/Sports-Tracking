import { NextResponse } from "next/server";
import { getCurrentUserMemberships } from "@/server/auth/context";

export async function GET() {
  const { user, memberships } = await getCurrentUserMemberships();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    memberships
  });
}
