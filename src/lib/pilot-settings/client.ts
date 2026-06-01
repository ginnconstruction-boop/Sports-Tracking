"use client";

import { isFeatureEnabled } from "@/lib/features/runtime";
import type { PilotSettingKey } from "@/lib/domain/pilot-settings";

export type PilotSettingsScope = {
  organizationId?: string;
  teamId?: string;
};

const keyMap: Record<PilotSettingKey, string> = {
  minimal_mode: "tracking-the-game:pilot-setting:minimal-mode",
  required_fields_only: "tracking-the-game:pilot-setting:required-fields-only",
  coach_ready_shortcuts: "tracking-the-game:pilot-setting:coach-ready-shortcuts"
};

declare global {
  interface Window {
    __trackingPilotSettingsScope?: PilotSettingsScope;
  }
}

function scopedKey(baseKey: string, scope?: PilotSettingsScope) {
  if (!scope?.organizationId || !scope?.teamId) {
    return null;
  }

  return `${baseKey}:org:${scope.organizationId}:team:${scope.teamId}`;
}

function resolveScope(scope?: PilotSettingsScope) {
  if (scope) {
    return scope;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__trackingPilotSettingsScope;
}

export function setPilotSettingsScope(scope?: PilotSettingsScope) {
  if (typeof window === "undefined") {
    return;
  }

  window.__trackingPilotSettingsScope = scope;
}

export function readPilotSetting(key: PilotSettingKey, fallback: boolean, scope?: PilotSettingsScope) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const baseKey = keyMap[key];
  const resolvedScope = resolveScope(scope);
  const scopedStorageEnabled = isFeatureEnabled("pilot_settings_scoped_storage");
  const nextScopedKey = scopedStorageEnabled ? scopedKey(baseKey, resolvedScope) : null;
  const rawValue = nextScopedKey ? window.localStorage.getItem(nextScopedKey) : window.localStorage.getItem(baseKey);
  if (rawValue === null) {
    const legacyValue = nextScopedKey ? window.localStorage.getItem(baseKey) : null;
    if (legacyValue !== null) {
      return legacyValue === "1";
    }
    return fallback;
  }

  return rawValue === "1";
}

export function writePilotSetting(key: PilotSettingKey, enabled: boolean, scope?: PilotSettingsScope) {
  if (typeof window === "undefined") {
    return;
  }

  const baseKey = keyMap[key];
  const resolvedScope = resolveScope(scope);
  const scopedStorageEnabled = isFeatureEnabled("pilot_settings_scoped_storage");
  const nextValue = enabled ? "1" : "0";

  window.localStorage.setItem(baseKey, nextValue);

  if (scopedStorageEnabled) {
    const nextScopedKey = scopedKey(baseKey, resolvedScope);
    if (nextScopedKey) {
      window.localStorage.setItem(nextScopedKey, nextValue);
    }
  }
}
