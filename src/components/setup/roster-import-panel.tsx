"use client";

import { useMemo, useState } from "react";
import { rosterColumnKeys, type RosterColumnKey } from "@/lib/contracts/admin";
import { parseRosterCsv, type RosterImportError } from "@/lib/import/roster-csv";

type ImportedRosterRow = {
  rosterId: string;
  jerseyNumber: string;
  grade?: string | null;
  position?: string | null;
  offenseRole: boolean;
  defenseRole: boolean;
  specialTeamsRole: boolean;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
};

type Props = {
  organizationId: string;
  seasonId: string;
  targetLabel?: string;
  onImported?: (items: ImportedRosterRow[]) => void;
};

type ImportMode = "replace" | "merge";

function labelForColumn(key: RosterColumnKey) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

export function RosterImportPanel({ organizationId, seasonId, targetLabel, onImported }: Props) {
  const [csvFileName, setCsvFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("replace");
  const [columnMapping, setColumnMapping] = useState<Partial<Record<string, RosterColumnKey | "ignore">>>({});
  const [statusText, setStatusText] = useState("Load a roster CSV to preview it before import.");
  const [isBusy, setIsBusy] = useState(false);
  const [importErrors, setImportErrors] = useState<RosterImportError[]>([]);

  const parsed = useMemo(() => parseRosterCsv(csvText, { columnMapping }), [columnMapping, csvText]);

  async function readFile(file?: File | null) {
    if (!file) return;
    const text = await file.text();
    setCsvFileName(file.name);
    setCsvText(text);
    setImportErrors([]);
    setStatusText(`Loaded ${file.name}. Review the mapping and preview before importing.`);
  }

  async function importRoster() {
    if (!organizationId || !seasonId || !csvText.trim()) return;
    setIsBusy(true);
    setImportErrors([]);
    setStatusText(importMode === "merge" ? "Merging roster..." : "Replacing roster...");

    try {
      const response = await fetch(`/api/v1/seasons/${seasonId}/roster/import-csv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationId,
          csvText,
          mode: importMode,
          columnMapping
        })
      });

      const body = await response.json();
      if (!response.ok) {
        setImportErrors(body.rowErrors ?? []);
        throw new Error(body.error ?? "Roster import failed.");
      }

      onImported?.(body.items as ImportedRosterRow[]);
      setStatusText(`${body.importedCount} players imported in ${body.mode} mode.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Roster import failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Roster import</h2>
          <p className="kicker">
            Download the template, preview the CSV, map the columns clearly, then choose whether to replace or merge
            into the current season roster.
          </p>
        </div>
        <a className="button-secondary-light" href="/roster-import-template.csv" download>
          Download template
        </a>
      </div>

      <div className="pill-row">
        <span className="chip">{targetLabel ? `Target: ${targetLabel}` : "Select a season first"}</span>
        <span className="chip">Auto-detects common roster headers</span>
        <span className="chip">Merge keeps unmatched players in place</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Upload CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>
        <label className="field">
          <span>Import mode</span>
          <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)}>
            <option value="replace">Replace season roster</option>
            <option value="merge">Merge into season roster</option>
          </select>
        </label>
        <label className="field field-span-2">
          <span>CSV preview / paste</span>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={8}
            style={{ padding: 14, borderRadius: 14, border: "1px solid var(--line)" }}
          />
        </label>
      </div>

      {csvFileName ? <span className="chip">Loaded: {csvFileName}</span> : null}

      {parsed.headers.length > 0 ? (
        <div className="section-card" style={{ padding: 18 }}>
          <div className="entry-header">
            <strong>Column mapping</strong>
            <span className="chip">{parsed.headers.length} source columns</span>
          </div>
          <div className="form-grid">
            {parsed.headers.map((header) => (
              <label className="field" key={header}>
                <span>{header}</span>
                <select
                  value={parsed.columnMapping[header] ?? "ignore"}
                  onChange={(event) =>
                    setColumnMapping((current) => ({
                      ...current,
                      [header]: event.target.value as RosterColumnKey | "ignore"
                    }))
                  }
                >
                  <option value="ignore">Ignore</option>
                  {rosterColumnKeys.map((key) => (
                    <option key={key} value={key}>
                      {labelForColumn(key)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section-card" style={{ padding: 18 }}>
        <div className="entry-header">
          <strong>Preview</strong>
          <span className="chip">{parsed.players.length} parsed rows</span>
        </div>
        <div className="table-like">
          {parsed.players.length === 0 ? <div className="kicker">Parsed roster rows will appear here.</div> : null}
          {parsed.players.slice(0, 8).map((player) => (
            <div className="timeline-card" key={`${player.jerseyNumber}-${player.firstName}-${player.lastName}`}>
              <div className="timeline-top">
                <strong>
                  #{player.jerseyNumber} {player.preferredName || `${player.firstName} ${player.lastName}`}
                </strong>
                <span className="mono">{player.position || "ATH"}</span>
              </div>
              <div className="pill-row">
                {player.grade ? <span className="chip">Grade {player.grade}</span> : null}
                {player.offenseRole ? <span className="chip">Offense</span> : null}
                {player.defenseRole ? <span className="chip">Defense</span> : null}
                {player.specialTeamsRole ? <span className="chip">Special teams</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {parsed.errors.length > 0 || importErrors.length > 0 ? (
        <div className="error-note">
          <strong>Import errors</strong>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {[...(parsed.errors.length > 0 ? parsed.errors : importErrors)].slice(0, 12).map((error) => (
              <div key={`${error.row}-${error.field}-${error.message}`} className="mono">
                Row {error.row}
                {error.field ? ` - ${error.field}` : ""}: {error.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="timeline-actions">
        <button
          className="button-primary"
          disabled={isBusy || !organizationId || !seasonId || !csvText.trim() || parsed.errors.length > 0}
          type="button"
          onClick={() => void importRoster()}
        >
          {importMode === "merge" ? "Merge roster" : "Replace roster"}
        </button>
        <span className="kicker">{statusText}</span>
      </div>
    </div>
  );
}
