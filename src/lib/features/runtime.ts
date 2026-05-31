import {
  featureDefinitions,
  type FeatureCategory,
  type FeatureDefinition,
  type FeatureKey
} from "@/lib/features/definitions";
import { launchProfiles, type LaunchProfileName } from "@/lib/features/profiles";
import type { ExportFormat } from "@/lib/domain/reports";

export type FeatureMatrixItem = {
  key: FeatureKey;
  enabled: boolean;
  label: string;
  description: string;
  category: FeatureCategory;
  organizationOverridable: boolean;
};

function normalizeProfile(value?: string | null): LaunchProfileName | null {
  if (!value) {
    return null;
  }

  if (value === "development" || value === "staging" || value === "production_mvp" || value === "pilot_core") {
    return value;
  }

  return null;
}

function parseBooleanOverride(rawValue?: string | null) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") {
    return false;
  }
  return null;
}

function envOverridesForFeature(feature: FeatureKey) {
  const publicKey = `NEXT_PUBLIC_FEATURE_OVERRIDE_${feature.toUpperCase()}` as const;
  const serverKey = `FEATURE_OVERRIDE_${feature.toUpperCase()}` as const;
  const publicOverride = parseBooleanOverride(process.env[publicKey]);
  const serverOverride =
    typeof window === "undefined" ? parseBooleanOverride(process.env[serverKey]) : null;

  return serverOverride ?? publicOverride;
}

function applyFeatureOverrides(flags: Record<FeatureKey, boolean>) {
  const next = { ...flags };
  for (const feature of Object.keys(featureDefinitions) as FeatureKey[]) {
    const override = envOverridesForFeature(feature);
    if (override === null) {
      continue;
    }
    next[feature] = override;
  }
  return next;
}

export function getLaunchProfileName(): LaunchProfileName {
  const explicit =
    normalizeProfile(process.env.NEXT_PUBLIC_APP_LAUNCH_PROFILE) ??
    normalizeProfile(process.env.APP_LAUNCH_PROFILE);

  if (explicit) {
    return explicit;
  }

  return process.env.NODE_ENV === "production" ? "production_mvp" : "development";
}

export function getFeatureFlags(profileName: LaunchProfileName = getLaunchProfileName()) {
  return applyFeatureOverrides(launchProfiles[profileName]);
}

export function isFeatureEnabled(feature: FeatureKey, profileName: LaunchProfileName = getLaunchProfileName()) {
  return getFeatureFlags(profileName)[feature];
}

export function getFeatureMatrix(profileName: LaunchProfileName = getLaunchProfileName()): FeatureMatrixItem[] {
  const flags = getFeatureFlags(profileName);
  return (Object.keys(featureDefinitions) as FeatureKey[]).map((key) => ({
    ...(featureDefinitions[key] as FeatureDefinition),
    key,
    enabled: flags[key],
    organizationOverridable: (featureDefinitions[key] as FeatureDefinition).organizationOverridable ?? false
  }));
}

export function canInspectFeatureFlags() {
  return process.env.NODE_ENV !== "production";
}

const exportFormatFlags: Record<ExportFormat, FeatureKey> = {
  json: "json_export",
  csv: "csv_export",
  xlsx: "xlsx_export",
  pdf: "pdf_export"
};

export function isExportFormatEnabled(format: ExportFormat) {
  return isFeatureEnabled(exportFormatFlags[format]);
}

export function getEnabledExportFormats(): ExportFormat[] {
  return (Object.keys(exportFormatFlags) as ExportFormat[]).filter((format) =>
    isExportFormatEnabled(format)
  );
}
