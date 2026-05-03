CREATE TABLE IF NOT EXISTS game_score_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE cascade,
  applies_after_sequence numeric(24, 12) NOT NULL,
  score jsonb NOT NULL,
  reason_category game_state_correction_reason_category NOT NULL,
  reason_note text NOT NULL,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE restrict,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  voided_by_user_id uuid REFERENCES app_users(id) ON DELETE restrict,
  voided_at timestamp with time zone,
  void_reason_note text
);

CREATE INDEX IF NOT EXISTS game_score_corrections_game_sequence_idx
  ON game_score_corrections (game_id, applies_after_sequence);

CREATE INDEX IF NOT EXISTS game_score_corrections_game_created_idx
  ON game_score_corrections (game_id, created_at);

ALTER TABLE game_score_corrections ENABLE ROW LEVEL SECURITY;
