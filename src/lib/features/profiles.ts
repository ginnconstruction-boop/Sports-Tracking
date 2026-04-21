import type { FeatureKey } from "@/lib/features/definitions";

export type LaunchProfileName = "development" | "staging" | "production_mvp";

type FeatureProfile = Record<FeatureKey, boolean>;

const allFlags = (value: boolean) =>
  ({
    game_day_mode: value,
    resume_live_game: value,
    undo_last_play: value,
    drive_summary: value,
    reports_preview: value,
    csv_export: value,
    json_export: value,
    xlsx_export: value,
    pdf_export: value,
    roster_import_csv: value,
    opponent_management: value,
    team_management: value,
    season_management: value,
    advanced_participant_capture: value,
    offline_outbox_sync: value,
    live_public_tracker: value,
    parent_portal: value,
    advanced_analytics: value,
    voice_input: value,
    organization_branding: value,
    internal_debug_tools: value
  }) satisfies FeatureProfile;

export const launchProfiles: Record<LaunchProfileName, FeatureProfile> = {
  development: {
    ...allFlags(true),
    parent_portal: false,
    voice_input: false
  },
  staging: {
    ...allFlags(true),
    parent_portal: false,
    voice_input: false
  },
  production_mvp: {
    ...allFlags(false),
    game_day_mode: true,
    resume_live_game: true,
    undo_last_play: true,
    reports_preview: true,
    csv_export: false,
    json_export: false,
    roster_import_csv: true,
    opponent_management: true,
    team_management: true,
    season_management: true,
    offline_outbox_sync: true,
    drive_summary: false,
    advanced_participant_capture: false,
    xlsx_export: true,
    pdf_export: true,
    live_public_tracker: false,
    parent_portal: false,
    advanced_analytics: false,
    voice_input: false,
    organization_branding: false,
    internal_debug_tools: false
  }
};
