"use client";

import { useEffect, useState, useTransition } from "react";
import { getEnabledExportFormats } from "@/lib/features/runtime";
import type { ExportFormat } from "@/lib/domain/reports";
import { readPilotSetting } from "@/lib/pilot-settings/client";

type ExportJob = {
  id: string;
  reportType: string;
  format: string;
  status: "queued" | "processing" | "complete" | "failed";
  createdAt: string | Date;
  completedAt?: string | Date | null;
  errorMessage?: string | null;
  fileSizeBytes?: number | null;
  downloadUrl?: string | null;
};

type Props = {
  gameId: string;
  initialExports: ExportJob[];
  canRequestExports?: boolean;
};

type ReportsGetResponse = {
  exports: ExportJob[];
};

type ReportsPostResponse = {
  item: ExportJob;
};

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      throw new Error("Server returned an invalid JSON response.");
    }
  }

  if (!response.ok) {
    const errorPayload =
      typeof body === "object" && body !== null
        ? (body as { error?: { message?: string } | string })
        : null;

    const message =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : typeof errorPayload?.error?.message === "string"
          ? errorPayload.error.message
          : `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return body as T;
}

function formatBytes(value?: number | null) {
  if (!value) return "pending";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function exportFormatLabel(format: ExportFormat) {
  if (format === "xlsx") {
    return "Google Sheets";
  }

  return format.toUpperCase();
}

function exportFailureSuggestion(message?: string | null) {
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (normalized.includes("report_exports")) {
    return "Database migration missing. Apply latest migrations and rerun export.";
  }
  if (normalized.includes("storage") || normalized.includes("bucket")) {
    return "Storage setup issue. Verify the exports bucket exists and service key permissions are valid.";
  }
  if (normalized.includes("disabled in the active launch profile")) {
    return "This export format is disabled in the current launch profile.";
  }
  return "Retry the export. If it fails again, capture this message and run setup health diagnostics.";
}

export function ReportExportPanel({ gameId, initialExports, canRequestExports = true }: Props) {
  const exportFormats = getEnabledExportFormats().filter(
    (format): format is Extract<ExportFormat, "pdf" | "xlsx"> => format === "pdf" || format === "xlsx"
  );
  const [exports, setExports] = useState(initialExports);
  const [showCoachReadyShortcut, setShowCoachReadyShortcut] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setShowCoachReadyShortcut(readPilotSetting("coach_ready_shortcuts", true));
  }, []);

  async function refreshExports() {
    try {
      const body = await readJson<ReportsGetResponse>(`/api/v1/games/${gameId}/reports`, {
        method: "GET",
        cache: "no-store"
      });
      setExports(body.exports);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unable to refresh exports.");
    }
  }

  async function requestExport(format: (typeof exportFormats)[number]) {
    setErrorText(null);

    try {
      const body = await readJson<ReportsPostResponse>(`/api/v1/games/${gameId}/reports`, {
        method: "POST",
        body: JSON.stringify({
          reportType: "game_report",
          format
        })
      });

      startTransition(() => {
        setExports((current) => [body.item, ...current.filter((item) => item.id !== body.item.id)]);
      });
      await refreshExports();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unable to create export.");
      return;
    }
  }

  return (
    <div className="stack-md">
      <div className="entry-header">
        <div className="stack-sm">
          <h2 style={{ margin: 0 }}>Export pipeline</h2>
          <p className="kicker" style={{ margin: 0 }}>
            Generate the canonical game report in PDF or Google Sheets-compatible workbook format, store each
            artifact in Supabase Storage, and keep it linked to the report job.
          </p>
        </div>
        <div className="pill-row">
          {showCoachReadyShortcut ? (
            <button
              className="button-secondary button-secondary-light"
              disabled={isPending || !canRequestExports || !exportFormats.includes("pdf")}
              type="button"
              onClick={() => void requestExport("pdf")}
            >
              Coach-ready PDF
            </button>
          ) : null}
          {exportFormats.map((format, index) => (
            <button
              className={index === 0 ? "button-primary button-primary-small" : "button-secondary button-secondary-light"}
              disabled={isPending || !canRequestExports}
              key={format}
              type="button"
              onClick={() => void requestExport(format)}
            >
              {index === 0 && isPending ? "Working..." : `Export ${exportFormatLabel(format)}`}
            </button>
          ))}
          <button className="mini-button" disabled={isPending} type="button" onClick={() => void refreshExports()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="pill-row">
        <div className="chip">Canonical game report document</div>
        <div className="chip">{exportFormats.map((item) => exportFormatLabel(item)).join(" / ")}</div>
        <div className="chip">Supabase Storage artifact tracking</div>
      </div>

      {errorText ? <div className="error-note">{errorText}</div> : null}
      {!canRequestExports ? (
        <div className="kicker">Your role can review exports, but only coaches/admin can generate new export jobs.</div>
      ) : null}

      <div className="table-like">
        {exports.length === 0 ? <div className="kicker">No exports yet for this game.</div> : null}
        {[...exports]
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
          .map((job) => (
          <div className="timeline-card" key={job.id}>
            <div className="timeline-top">
              <strong>{exportFormatLabel(job.format as ExportFormat)}</strong>
              <span className="mono">{job.status}</span>
            </div>
            <div className="timeline-meta">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              <span className="mono">{formatBytes(job.fileSizeBytes)}</span>
            </div>
            {job.errorMessage ? <div className="error-note">{job.errorMessage}</div> : null}
            {job.errorMessage ? <div className="kicker">{exportFailureSuggestion(job.errorMessage)}</div> : null}
            <div className="timeline-actions">
              {job.downloadUrl ? (
                <a className="utility-link" href={job.downloadUrl} rel="noreferrer" target="_blank">
                  Download artifact
                </a>
              ) : (
                <span className="kicker">Artifact link becomes available when the job completes.</span>
              )}
              {canRequestExports && exportFormats.includes(job.format as (typeof exportFormats)[number]) ? (
                <button className="mini-button" type="button" onClick={() => void requestExport(job.format as (typeof exportFormats)[number])}>
                  Re-run
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
