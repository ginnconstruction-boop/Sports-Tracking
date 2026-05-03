import assert from "node:assert/strict";
import test from "node:test";
import { launchProfiles } from "@/lib/features/profiles";

test("production MVP launch profile only exposes the intended core feature set", () => {
  const production = launchProfiles.production_mvp;

  assert.equal(production.game_day_mode, true);
  assert.equal(production.resume_live_game, true);
  assert.equal(production.undo_last_play, true);
  assert.equal(production.reports_preview, true);
  assert.equal(production.csv_export, false);
  assert.equal(production.json_export, false);
  assert.equal(production.roster_import_csv, true);
  assert.equal(production.team_management, true);
  assert.equal(production.season_management, true);
  assert.equal(production.opponent_management, true);
  assert.equal(production.offline_outbox_sync, true);

  assert.equal(production.drive_summary, false);
  assert.equal(production.advanced_participant_capture, false);
  assert.equal(production.xlsx_export, true);
  assert.equal(production.pdf_export, true);
  assert.equal(production.live_public_tracker, false);
  assert.equal(production.parent_portal, false);
  assert.equal(production.advanced_analytics, false);
  assert.equal(production.voice_input, false);
  assert.equal(production.organization_branding, false);
  assert.equal(production.internal_debug_tools, false);
});
