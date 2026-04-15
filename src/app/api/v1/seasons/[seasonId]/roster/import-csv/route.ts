import { NextRequest, NextResponse } from "next/server";
import { importSeasonRosterCsvInputSchema } from "@/lib/contracts/admin";
import { parseRosterCsv } from "@/lib/import/roster-csv";
import { mergeSeasonRoster, replaceSeasonRoster } from "@/server/services/football-admin-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await context.params;
  const seasonId = typeof params.seasonId === "string" ? params.seasonId : "";
  const parsed = importSeasonRosterCsvInputSchema.safeParse({
    ...(await request.json()),
    seasonId
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const csv = parseRosterCsv(parsed.data.csvText, {
    columnMapping: parsed.data.columnMapping
  });
  if (parsed.data.previewOnly) {
    return NextResponse.json({
      headers: csv.headers,
      columnMapping: csv.columnMapping,
      previewRows: csv.previewRows.slice(0, 12),
      parsedCount: csv.players.length,
      rowErrors: csv.errors
    });
  }

  if (csv.errors.length > 0) {
    return NextResponse.json(
      {
        error: "Roster import validation failed.",
        rowErrors: csv.errors
      },
      { status: 400 }
    );
  }

  const payload = {
    organizationId: parsed.data.organizationId,
    seasonId,
    players: csv.players
  };
  const items =
    parsed.data.mode === "merge"
      ? await mergeSeasonRoster(payload)
      : await replaceSeasonRoster(payload);

  return NextResponse.json({
    items,
    mode: parsed.data.mode,
    importedCount: csv.players.length
  });
}
