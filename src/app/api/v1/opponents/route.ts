import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createOpponentInputSchema } from "@/lib/contracts/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { opponents } from "@/server/db/schema";
import { createOpponent } from "@/server/services/football-admin-service";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  await requireOrganizationRole(organizationId, "read_only");
  const db = getDb();
  const rows = await db.select().from(opponents).where(eq(opponents.organizationId, organizationId));
  return NextResponse.json({ items: rows });
}

export async function POST(request: NextRequest) {
  const parsed = createOpponentInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await createOpponent(parsed.data);
  return NextResponse.json({ item }, { status: 201 });
}
