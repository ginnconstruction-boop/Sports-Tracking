CREATE TABLE IF NOT EXISTS pilot_team_setting_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE cascade,
  key pilot_setting_key NOT NULL,
  previous_enabled boolean,
  next_enabled boolean NOT NULL,
  changed_by_user_id uuid REFERENCES app_users(id) ON DELETE restrict,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS pilot_team_setting_audits_team_changed_idx
  ON pilot_team_setting_audits (team_id, changed_at);

CREATE INDEX IF NOT EXISTS pilot_team_setting_audits_org_team_key_changed_idx
  ON pilot_team_setting_audits (organization_id, team_id, key, changed_at);

ALTER TABLE pilot_team_setting_audits ENABLE ROW LEVEL SECURITY;
