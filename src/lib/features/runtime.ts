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

  if (value === "development" || value === "staging" || value === "production_mvp") {
    return value;
  }

  return null;
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
  return launchProfiles[profileName];
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
