export const pilotSettingKeys = [
  "minimal_mode",
  "required_fields_only",
  "coach_ready_shortcuts"
] as const;

export type PilotSettingKey = (typeof pilotSettingKeys)[number];

export const pilotSettingDefaults: Record<PilotSettingKey, boolean> = {
  minimal_mode: true,
  required_fields_only: true,
  coach_ready_shortcuts: true
};

export type PilotSettingRecord = {
  key: PilotSettingKey;
  enabled: boolean;
  updatedAt: string | null;
};
