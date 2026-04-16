import { NextRequest, NextResponse } from "next/server";
import { createOpponentInputSchema } from "@/lib/contracts/admin";
import { logServerError } from "@/lib/server/observability";
import { getRuntimeConnectionSummary } from "@/lib/server/runtime-diagnostics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationRole } from "@/server/auth/context";
import { createOpponent } from "@/server/services/football-admin-service";

type OpponentRow = {
  id: string;
  organization_id: string;
  school_name: string;
  mascot: string | null;
  short_code: string | null;
  archived_at: string | null;
  created_at?: string;
};

function mapOpponent(row: OpponentRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    schoolName: row.school_name,
    mascot: row.mascot,
    shortCode: row.short_code,
    archivedAt: row.archived_at
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
      .from("opponents")
      .select("*")
      .eq("organization_id", organizationId)
      .order("school_name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: (data ?? []).map((row) => mapOpponent(row as OpponentRow)) });
  } catch (error) {
    logServerError("opponents-route", "list_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load opponents.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createOpponentInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await createOpponent(parsed.data);
    return NextResponse.json({ item: mapOpponent(item as OpponentRow) }, { status: 201 });
  } catch (error) {
    logServerError("opponents-route", "create_failed", error, getRuntimeConnectionSummary());

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create opponent.",
        runtime: getRuntimeConnectionSummary()
      },
      { status: 500 }
    );
  }
}
