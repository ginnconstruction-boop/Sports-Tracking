"use client";

export type PilotSettingKey =
  | "minimal_mode"
  | "required_fields_only"
  | "coach_ready_shortcuts";

const keyMap: Record<PilotSettingKey, string> = {
  minimal_mode: "tracking-the-game:pilot-setting:minimal-mode",
  required_fields_only: "tracking-the-game:pilot-setting:required-fields-only",
  coach_ready_shortcuts: "tracking-the-game:pilot-setting:coach-ready-shortcuts"
};

export function readPilotSetting(key: PilotSettingKey, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(keyMap[key]);
  if (rawValue === null) {
    return fallback;
  }

  return rawValue === "1";
}

export function writePilotSetting(key: PilotSettingKey, enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(keyMap[key], enabled ? "1" : "0");
}
