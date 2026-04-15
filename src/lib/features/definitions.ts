export type FeatureCategory =
  | "production_enabled"
  | "production_disabled"
  | "internal_only"
  | "experimental"
  | "organization_optional";

export type FeatureDefinition = {
  label: string;
  description: string;
  category: FeatureCategory;
  organizationOverridable?: boolean;
};

export const featureDefinitions = {
  game_day_mode: {
    label: "Game Day Mode",
    description: "Main sideline live-entry surface.",
    category: "production_enabled"
  },
  resume_live_game: {
    label: "Resume live game",
    description: "Resume the most recent local live session from this device.",
    category: "production_enabled"
  },
  undo_last_play: {
    label: "Undo last play",
    description: "Expose fast delete/undo controls for the most recent play.",
    category: "production_enabled"
  },
  drive_summary: {
    label: "Drive summary",
    description: "Show derived drive summaries in live and report surfaces.",
    category: "organization_optional",
    organizationOverridable: true
  },
  reports_preview: {
    label: "Reports preview",
    description: "Enable canonical report preview pages and summary views.",
    category: "production_enabled"
  },
  csv_export: {
    label: "CSV export",
    description: "Allow CSV artifact generation from canonical game reports.",
    category: "production_enabled"
  },
  json_export: {
    label: "JSON export",
    description: "Allow JSON artifact generation from canonical game reports.",
    category: "production_enabled"
  },
  xlsx_export: {
    label: "XLSX export",
    description: "Allow Excel artifact generation from canonical game reports.",
    category: "production_disabled"
  },
  pdf_export: {
    label: "PDF export",
    description: "Allow PDF artifact generation from canonical game reports.",
    category: "production_disabled"
  },
  roster_import_csv: {
    label: "CSV roster import",
    description: "Allow season roster import through the CSV workflow.",
    category: "production_enabled"
  },
  opponent_management: {
    label: "Opponent management",
    description: "Show opponent CRUD in setup/admin flows.",
    category: "production_enabled"
  },
  team_management: {
    label: "Team management",
    description: "Show team CRUD in setup/admin flows.",
    category: "production_enabled"
  },
  season_management: {
    label: "Season management",
    description: "Show season CRUD in setup/admin flows.",
    category: "production_enabled"
  },
  advanced_participant_capture: {
    label: "Advanced participant capture",
    description: "Expose richer participant capture banks, advanced roles, and next-play helpers.",
    category: "organization_optional",
    organizationOverridable: true
  },
  offline_outbox_sync: {
    label: "Offline outbox sync",
    description: "Enable local-first queued sync for live game mutations.",
    category: "production_enabled"
  },
  live_public_tracker: {
    label: "Live public tracker",
    description: "Enable public live/report share pages and public-share controls.",
    category: "production_disabled"
  },
  parent_portal: {
    label: "Parent portal",
    description: "Future external parent-facing experience.",
    category: "experimental"
  },
  advanced_analytics: {
    label: "Advanced analytics",
    description: "Enable season analytics, trends, and opponent-history views.",
    category: "production_disabled"
  },
  voice_input: {
    label: "Voice input",
    description: "Future voice-assisted live entry.",
    category: "experimental"
  },
  organization_branding: {
    label: "Organization branding",
    description: "Expose branding management and branded public/report controls.",
    category: "production_disabled"
  },
  internal_debug_tools: {
    label: "Internal debug tools",
    description: "Enable diagnostics, seed/demo utilities, and review/debug surfaces not meant for MVP launch.",
    category: "internal_only"
  }
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof featureDefinitions;

