import { eq } from "drizzle-orm";
import type { ExportFormat, GameReportDocument, ReportType } from "@/lib/domain/reports";
import { assertFeatureEnabled } from "@/lib/features/server";
import { isExportFormatEnabled } from "@/lib/features/runtime";
import { buildCanonicalGameReportDocument } from "@/lib/reports/document";
import { serializeGameReport } from "@/lib/reports/export-artifacts";
import { storageBuckets } from "@/lib/storage/buckets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/observability";
import { getDb } from "@/server/db/client";
import { reportExports } from "@/server/db/schema";
import { getGameAdminRecord } from "@/server/services/game-admin-service";
import { getGameDaySnapshot } from "@/server/services/game-day-service";
import { requireGameRole } from "@/server/services/game-access";
import { projectGameFromPlayLog } from "@/server/services/rebuild-service";

type ReportExportRow = typeof reportExports.$inferSelect;
type ReportExportTableRow = {
  id: string;
  game_id: string | null;
  season_id: string | null;
  report_type: string;
  format: string;
  status: "queued" | "processing" | "complete" | "failed";
  requested_by_user_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  payload: GameReportDocument | null;
  completed_at: string | null;
  created_at: string;
};

function mapReportExportRow(row: ReportExportTableRow): ReportExportRow {
  return {
    id: row.id,
    gameId: row.game_id,
    seasonId: row.season_id,
    reportType: row.report_type,
    format: row.format,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    contentType: row.content_type,
    fileSizeBytes: row.file_size_bytes,
    errorMessage: row.error_message,
    payload: row.payload,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at)
  };
}

async function withDownloadUrl(job: ReportExportRow) {
  if (!job.storageBucket || !job.storagePath || job.status !== "complete") {
    return {
      ...job,
      downloadUrl: null
    };
  }

  const supabase = createSupabaseAdminClient();
  const signedUrl = await supabase.storage.from(job.storageBucket).createSignedUrl(job.storagePath, 60 * 60);

  return {
    ...job,
    downloadUrl: signedUrl.data?.signedUrl ?? null
  };
}

function buildVenueLabel(reportContext: Awaited<ReturnType<typeof getGameAdminRecord>>) {
  if (!reportContext.venue) {
    return "Venue TBD";
  }

  return [
    reportContext.venue.name,
    reportContext.venue.fieldName ? `Field ${reportContext.venue.fieldName}` : null,
    reportContext.venue.city,
    reportContext.venue.state
  ]
    .filter(Boolean)
    .join(", ");
}

export async function buildGameReportDocument(
  gameId: string,
  reportType: ReportType = "game_report",
  minimumRole: "read_only" | "assistant_coach" = "read_only",
  options: { skipAuth?: boolean } = {}
) {
  if (!options.skipAuth) {
    await requireGameRole(gameId, minimumRole);
  }
  const [{ projection }, snapshot, context] = await Promise.all([
    projectGameFromPlayLog(gameId, minimumRole, options),
    getGameDaySnapshot(gameId, minimumRole, options),
    getGameAdminRecord(gameId, options)
  ]);

  return buildCanonicalGameReportDocument({
    gameId,
    reportType,
    snapshot,
    projection,
    context: {
      status: context.game.status,
      homeTeam: snapshot.homeTeam,
      awayTeam: snapshot.awayTeam,
      kickoffAt: context.game.kickoffAt,
      arrivalAt: context.game.arrivalAt,
      reportAt: context.game.reportAt,
      venueLabel: buildVenueLabel(context),
      weatherConditions: context.game.weatherConditions,
      fieldConditions: context.game.fieldConditions,
      staffNotes: context.game.staffNotes,
      opponentPrepNotes: context.game.opponentPrepNotes,
      logisticsNotes: context.game.logisticsNotes
    },
    branding: context.branding ?? null
  });
}

export async function getGameReportPreview(gameId: string) {
  assertFeatureEnabled("reports_preview");
  return buildGameReportDocument(gameId, "game_report", "read_only");
}

export async function queueGameExport(
  gameId: string,
  reportType: ReportType,
  format: ExportFormat,
  requestedByUserId?: string
) {
  assertFeatureEnabled("reports_preview");
  if (!isExportFormatEnabled(format)) {
    throw new Error(`The ${format.toUpperCase()} export is disabled in the active launch profile.`);
  }
  await requireGameRole(gameId, "assistant_coach");
  const db = getDb();

  const inserted = await db
    .insert(reportExports)
    .values({
      gameId,
      reportType,
      format,
      requestedByUserId,
      status: "queued"
    })
    .returning();

  return inserted[0];
}

export async function processQueuedGameExport(exportId: string) {
  const db = getDb();
  const job = await db.query.reportExports.findFirst({
    where: eq(reportExports.id, exportId)
  });

  if (!job?.gameId) {
    throw new Error("Export job not found.");
  }

  await db
    .update(reportExports)
    .set({
      status: "processing"
    })
    .where(eq(reportExports.id, exportId));

  try {
    const report = await buildGameReportDocument(job.gameId, job.reportType as ReportType, "assistant_coach");
    const artifact = await serializeGameReport(report, job.format as ExportFormat);
    const storagePath = `${job.gameId}/${job.id}/${artifact.fileName}`;
    const body =
      typeof artifact.body === "string" ? Buffer.from(artifact.body, "utf8") : Buffer.from(artifact.body);

    const supabase = createSupabaseAdminClient();
    const upload = await supabase.storage.from(storageBuckets.exports).upload(storagePath, body, {
      contentType: artifact.contentType,
      upsert: true
    });

    if (upload.error) {
      throw upload.error;
    }

    const updated = await db
      .update(reportExports)
      .set({
        status: "complete",
        storageBucket: storageBuckets.exports,
        storagePath,
        contentType: artifact.contentType,
        fileSizeBytes: body.byteLength,
        payload: report,
        completedAt: new Date(),
        errorMessage: null
      })
      .where(eq(reportExports.id, exportId))
      .returning();

    return withDownloadUrl(updated[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export failure.";
    logServerError("report-service", "export_failed", error, {
      exportId,
      gameId: job.gameId,
      format: job.format
    });
    const failed = await db
      .update(reportExports)
      .set({
        status: "failed",
        errorMessage: message
      })
      .where(eq(reportExports.id, exportId))
      .returning();

    return withDownloadUrl(failed[0]);
  }
}

export async function listGameExports(gameId: string) {
  assertFeatureEnabled("reports_preview");
  await requireGameRole(gameId, "read_only");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("report_exports")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const jobs = (data ?? []).map((row) => mapReportExportRow(row as ReportExportTableRow));
  return Promise.all(jobs.map(withDownloadUrl));
}
