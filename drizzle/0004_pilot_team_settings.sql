DO $$ BEGIN
  CREATE TYPE pilot_setting_key AS ENUM (
    'minimal_mode',
    'required_fields_only',
    'coach_ready_shortcuts'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS pilot_team_settings (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE cascade,
  key pilot_setting_key NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE restrict,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (organization_id, team_id, key)
);

CREATE INDEX IF NOT EXISTS pilot_team_settings_team_idx
  ON pilot_team_settings (team_id);

ALTER TABLE pilot_team_settings ENABLE ROW LEVEL SECURITY;
