"use client";

import { useEffect, useState } from "react";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { readPilotSetting, writePilotSetting, type PilotSettingsScope } from "@/lib/pilot-settings/client";

type Props = {
  statusText?: string;
  onStatusChange?: (message: string) => void;
  scope?: PilotSettingsScope;
};

export function PilotSettingsPanel({ statusText, onStatusChange, scope }: Props) {
  const [minimalMode, setMinimalMode] = useState(true);
  const [requiredFieldsOnly, setRequiredFieldsOnly] = useState(true);
  const [coachReadyShortcuts, setCoachReadyShortcuts] = useState(true);
  const scopedStorageEnabled = isFeatureEnabled("pilot_settings_scoped_storage");
  const serverSyncEnabled = isFeatureEnabled("pilot_settings_server_sync");

  useEffect(() => {
    setMinimalMode(readPilotSetting("minimal_mode", true, scope));
    setRequiredFieldsOnly(readPilotSetting("required_fields_only", true, scope));
    setCoachReadyShortcuts(readPilotSetting("coach_ready_shortcuts", true, scope));
  }, [scope]);

  function updateSetting(
    key: "minimal_mode" | "required_fields_only" | "coach_ready_shortcuts",
    nextValue: boolean
  ) {
    writePilotSetting(key, nextValue, scope);
    const modeLabel = scopedStorageEnabled && scope?.organizationId && scope?.teamId
      ? "Pilot settings saved for this team on this device."
      : "Pilot settings saved on this device.";
    onStatusChange?.(modeLabel);
  }

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Pilot settings</h2>
          <p className="kicker" style={{ margin: "6px 0 0" }}>
            Pilot controls for keeping the sideline UI simple during pilot weeks.
          </p>
        </div>
        <span className="chip">{statusText ?? "Local device controls"}</span>
      </div>
      {scopedStorageEnabled && scope?.organizationId && scope?.teamId ? (
        <div className="kicker">Scope: this team on this device (org/team aware).</div>
      ) : null}
      {serverSyncEnabled ? (
        <div className="kicker">Server-sync wiring is enabled for rollout testing.</div>
      ) : null}

      <div className="table-like">
        <label className="timeline-card checkbox-field">
          <input
            type="checkbox"
            checked={minimalMode}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setMinimalMode(nextValue);
              updateSetting("minimal_mode", nextValue);
            }}
          />
          <div>
            <strong>Minimal mode</strong>
            <div className="kicker">Hide nonessential controls in Game Day and Live Entry.</div>
          </div>
        </label>

        <label className="timeline-card checkbox-field">
          <input
            type="checkbox"
            checked={requiredFieldsOnly}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setRequiredFieldsOnly(nextValue);
              updateSetting("required_fields_only", nextValue);
            }}
          />
          <div>
            <strong>Required fields only</strong>
            <div className="kicker">Default play entry to required inputs; optional fields stay collapsed.</div>
          </div>
        </label>

        <label className="timeline-card checkbox-field">
          <input
            type="checkbox"
            checked={coachReadyShortcuts}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setCoachReadyShortcuts(nextValue);
              updateSetting("coach_ready_shortcuts", nextValue);
            }}
          />
          <div>
            <strong>Coach-ready shortcuts</strong>
            <div className="kicker">Show quick actions like coach-ready PDF export.</div>
          </div>
        </label>
      </div>
    </section>
  );
}
