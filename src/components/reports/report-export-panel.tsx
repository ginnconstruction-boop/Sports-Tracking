"use client";

import { useState, useTransition } from "react";
import { getEnabledExportFormats } from "@/lib/features/runtime";

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
};

type ReportsGetResponse = {
  exports: ExportJob[];
};

type ReportsPostResponse = {
  item: ExportJob;
};

function formatBytes(value?: number | null) {
  if (!value) return "pending";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportExportPanel({ gameId, initialExports }: Props) {
  const exportFormats = getEnabledExportFormats();
  const [exports, setExports] = useState(initialExports);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshExports() {
    const response = await fetch(`/api/v1/games/${gameId}/reports`, {
      method: "GET",
      cache: "no-store"
    });
    const body = (await response.json()) as ReportsGetResponse | { error?: string };
    if (!response.ok || !("exports" in body)) {
      throw new Error(("error" in body && body.error) || "Unable to refresh exports.");
    }
    setExports(body.exports);
  }

  async function requestExport(format: (typeof exportFormats)[number]) {
    setErrorText(null);

    const response = await fetch(`/api/v1/games/${gameId}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reportType: "game_report",
        format
      })
    });
    const body = (await response.json()) as ReportsPostResponse | { error?: string };

    if (!response.ok || !("item" in body)) {
      setErrorText(("error" in body && body.error) || "Unable to create export.");
      return;
    }

    startTransition(() => {
      setExports((current) => [body.item, ...current.filter((item) => item.id !== body.item.id)]);
    });
    await refreshExports();
  }

  return (
    <div className="stack-md">
      <div className="entry-header">
        <div className="stack-sm">
          <h2 style={{ margin: 0 }}>Export pipeline</h2>
          <p className="kicker" style={{ margin: 0 }}>
            Generate the canonical game report in the formats enabled for this launch profile, store each
            artifact in Supabase Storage, and keep it linked to the report job.
          </p>
        </div>
        <div className="pill-row">
          {exportFormats.map((format, index) => (
            <button
              className={index === 0 ? "button-primary button-primary-small" : "button-secondary button-secondary-light"}
              disabled={isPending}
              key={format}
              type="button"
              onClick={() => void requestExport(format)}
            >
              {index === 0 && isPending ? "Working..." : `Export ${format.toUpperCase()}`}
            </button>
          ))}
          <button className="mini-button" disabled={isPending} type="button" onClick={() => void refreshExports()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="pill-row">
        <div className="chip">Canonical game report document</div>
        <div className="chip">{exportFormats.map((item) => item.toUpperCase()).join(" / ")}</div>
        <div className="chip">Supabase Storage artifact tracking</div>
      </div>

      {errorText ? <div className="error-note">{errorText}</div> : null}

      <div className="table-like">
        {exports.length === 0 ? <div className="kicker">No exports yet for this game.</div> : null}
        {[...exports]
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
          .map((job) => (
          <div className="timeline-card" key={job.id}>
            <div className="timeline-top">
              <strong>{job.format.toUpperCase()}</strong>
              <span className="mono">{job.status}</span>
            </div>
            <div className="timeline-meta">
              <span>{new Date(job.createdAt).toLocaleString()}</span>
              <span className="mono">{formatBytes(job.fileSizeBytes)}</span>
            </div>
            {job.errorMessage ? <div className="error-note">{job.errorMessage}</div> : null}
            <div className="timeline-actions">
              {job.downloadUrl ? (
                <a className="utility-link" href={job.downloadUrl} rel="noreferrer" target="_blank">
                  Download artifact
                </a>
              ) : (
                <span className="kicker">Artifact link becomes available when the job completes.</span>
              )}
              {exportFormats.includes(job.format as (typeof exportFormats)[number]) ? (
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
