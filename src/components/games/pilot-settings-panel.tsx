"use client";

import { useEffect, useState } from "react";
import { isFeatureEnabled } from "@/lib/features/runtime";
import { readPilotSetting, writePilotSetting, type PilotSettingsScope } from "@/lib/pilot-settings/client";
import type { PilotSettingKey } from "@/lib/domain/pilot-settings";

type Props = {
  statusText?: string;
  onStatusChange?: (message: string) => void;
  scope?: PilotSettingsScope;
  canResetTeamSettings?: boolean;
};

type PilotSettingsAuditItem = {
  id: string;
  key: PilotSettingKey;
  previousEnabled: boolean | null;
  nextEnabled: boolean;
  changedByUserId: string | null;
  changedAt: string;
};

function pilotSettingLabel(key: PilotSettingKey) {
  if (key === "minimal_mode") {
    return "Minimal mode";
  }

  if (key === "required_fields_only") {
    return "Required fields only";
  }

  return "Coach-ready shortcuts";
}

function formatAuditChange(item: PilotSettingsAuditItem) {
  if (item.previousEnabled === null) {
    return `Initial set to ${item.nextEnabled ? "On" : "Off"}`;
  }

  return `${item.previousEnabled ? "On" : "Off"} -> ${item.nextEnabled ? "On" : "Off"}`;
}

export function PilotSettingsPanel({ statusText, onStatusChange, scope, canResetTeamSettings = false }: Props) {
  const [minimalMode, setMinimalMode] = useState(true);
  const [requiredFieldsOnly, setRequiredFieldsOnly] = useState(true);
  const [coachReadyShortcuts, setCoachReadyShortcuts] = useState(true);
  const [auditItems, setAuditItems] = useState<PilotSettingsAuditItem[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const scopedStorageEnabled = isFeatureEnabled("pilot_settings_scoped_storage");
  const serverSyncEnabled = isFeatureEnabled("pilot_settings_server_sync");

  async function loadAuditHistory(organizationId: string, teamId: string) {
    try {
      const params = new URLSearchParams({
        organizationId,
        teamId,
        limit: "6"
      });
      const response = await fetch(`/api/v1/pilot-settings/audits?${params.toString()}`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        item?: { items?: PilotSettingsAuditItem[] };
      };
      setAuditItems(payload.item?.items ?? []);
    } catch {
      setAuditItems([]);
    }
  }

  async function syncPilotSetting(key: PilotSettingKey, enabled: boolean) {
    if (!serverSyncEnabled || !scope?.organizationId || !scope?.teamId) {
      return false;
    }

    try {
      const response = await fetch("/api/v1/pilot-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationId: scope.organizationId,
          teamId: scope.teamId,
          key,
          enabled
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    setMinimalMode(readPilotSetting("minimal_mode", true, scope));
    setRequiredFieldsOnly(readPilotSetting("required_fields_only", true, scope));
    setCoachReadyShortcuts(readPilotSetting("coach_ready_shortcuts", true, scope));
    const organizationId = scope?.organizationId;
    const teamId = scope?.teamId;

    if (!serverSyncEnabled || !organizationId || !teamId) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const params = new URLSearchParams({
          organizationId,
          teamId
        });
        const response = await fetch(`/api/v1/pilot-settings?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          item?: { items?: Array<{ key: PilotSettingKey; enabled: boolean }> };
        };
        const items = payload.item?.items ?? [];

        for (const item of items) {
          writePilotSetting(item.key, item.enabled, scope);
        }

        const byKey = new Map(items.map((item) => [item.key, item.enabled]));
        setMinimalMode(byKey.get("minimal_mode") ?? true);
        setRequiredFieldsOnly(byKey.get("required_fields_only") ?? true);
        setCoachReadyShortcuts(byKey.get("coach_ready_shortcuts") ?? true);
        void loadAuditHistory(organizationId, teamId);
        onStatusChange?.("Pilot settings loaded for this team.");
      } catch {
        // Keep local scoped values as the fallback source of truth when sync is unavailable.
      }
    })();

    return () => {
      controller.abort();
    };
  }, [scope, serverSyncEnabled, onStatusChange]);

  async function updateSetting(key: PilotSettingKey, nextValue: boolean) {
    writePilotSetting(key, nextValue, scope);
    const serverSynced = await syncPilotSetting(key, nextValue);
    if (serverSynced && scope?.organizationId && scope?.teamId) {
      void loadAuditHistory(scope.organizationId, scope.teamId);
    }
    const modeLabel = scopedStorageEnabled && scope?.organizationId && scope?.teamId
      ? "Pilot settings saved for this team on this device."
      : "Pilot settings saved on this device.";
    onStatusChange?.(serverSynced ? `${modeLabel} Synced to server.` : modeLabel);
  }

  async function resetTeamSettings() {
    if (!scope?.organizationId || !scope?.teamId) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch("/api/v1/pilot-settings/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationId: scope.organizationId,
          teamId: scope.teamId
        })
      });

      if (!response.ok) {
        throw new Error("Unable to reset pilot settings.");
      }

      setMinimalMode(true);
      setRequiredFieldsOnly(true);
      setCoachReadyShortcuts(true);
      writePilotSetting("minimal_mode", true, scope);
      writePilotSetting("required_fields_only", true, scope);
      writePilotSetting("coach_ready_shortcuts", true, scope);
      await loadAuditHistory(scope.organizationId, scope.teamId);
      onStatusChange?.("Pilot settings reset to team defaults.");
    } catch {
      onStatusChange?.("Unable to reset pilot settings.");
    } finally {
      setIsResetting(false);
    }
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
        <div className="kicker">Server sync is enabled for this rollout.</div>
      ) : null}

      <div className="table-like">
        <label className="timeline-card checkbox-field">
          <input
            type="checkbox"
            checked={minimalMode}
              onChange={(event) => {
                const nextValue = event.target.checked;
                setMinimalMode(nextValue);
                void updateSetting("minimal_mode", nextValue);
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
                void updateSetting("required_fields_only", nextValue);
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
                void updateSetting("coach_ready_shortcuts", nextValue);
              }}
            />
          <div>
            <strong>Coach-ready shortcuts</strong>
            <div className="kicker">Show quick actions like coach-ready PDF export.</div>
          </div>
        </label>
      </div>

      {serverSyncEnabled && scope?.organizationId && scope?.teamId ? (
        <div className="timeline-actions">
          <button
            className="mini-button"
            disabled={!canResetTeamSettings || isResetting}
            type="button"
            onClick={() => void resetTeamSettings()}
          >
            {isResetting ? "Resetting..." : "Reset team settings to defaults"}
          </button>
        </div>
      ) : null}

      {serverSyncEnabled && scope?.organizationId && scope?.teamId ? (
        <section className="section-card stack-sm">
          <div className="entry-header">
            <strong style={{ margin: 0 }}>Recent pilot setting changes</strong>
            <span className="chip">{auditItems.length} shown</span>
          </div>
          {auditItems.length === 0 ? <div className="kicker">No server-synced pilot setting changes yet.</div> : null}
          <div className="table-like">
            {auditItems.map((item) => (
              <div className="timeline-card" key={item.id}>
                <div className="timeline-top">
                  <strong>{pilotSettingLabel(item.key)}</strong>
                  <span className="mono">{new Date(item.changedAt).toLocaleString()}</span>
                </div>
                <div className="kicker">{formatAuditChange(item)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
