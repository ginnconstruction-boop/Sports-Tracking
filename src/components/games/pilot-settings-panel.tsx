"use client";

import { useEffect, useState } from "react";
import { readPilotSetting, writePilotSetting } from "@/lib/pilot-settings/client";

type Props = {
  statusText?: string;
  onStatusChange?: (message: string) => void;
};

export function PilotSettingsPanel({ statusText, onStatusChange }: Props) {
  const [minimalMode, setMinimalMode] = useState(true);
  const [requiredFieldsOnly, setRequiredFieldsOnly] = useState(true);
  const [coachReadyShortcuts, setCoachReadyShortcuts] = useState(true);

  useEffect(() => {
    setMinimalMode(readPilotSetting("minimal_mode", true));
    setRequiredFieldsOnly(readPilotSetting("required_fields_only", true));
    setCoachReadyShortcuts(readPilotSetting("coach_ready_shortcuts", true));
  }, []);

  function updateSetting(
    key: "minimal_mode" | "required_fields_only" | "coach_ready_shortcuts",
    nextValue: boolean
  ) {
    writePilotSetting(key, nextValue);
    onStatusChange?.("Pilot settings saved on this device.");
  }

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Pilot settings</h2>
          <p className="kicker" style={{ margin: "6px 0 0" }}>
            Device-level controls for keeping the sideline UI simple during pilot weeks.
          </p>
        </div>
        <span className="chip">{statusText ?? "Local device controls"}</span>
      </div>

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
