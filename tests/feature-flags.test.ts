import assert from "node:assert/strict";
import test from "node:test";
import { launchProfiles } from "@/lib/features/profiles";
import { getFeatureFlags } from "@/lib/features/runtime";

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
  assert.equal(production.pilot_simplicity_mode, true);
  assert.equal(production.game_day_minimal_mode, true);
  assert.equal(production.required_fields_only_entry, true);
  assert.equal(production.pilot_settings_scoped_storage, true);
  assert.equal(production.pilot_settings_server_sync, false);

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

test("pilot core launch profile keeps optional features off by default", () => {
  const pilot = launchProfiles.pilot_core;

  assert.equal(pilot.game_day_mode, true);
  assert.equal(pilot.resume_live_game, true);
  assert.equal(pilot.undo_last_play, true);
  assert.equal(pilot.reports_preview, true);
  assert.equal(pilot.roster_import_csv, true);
  assert.equal(pilot.team_management, true);
  assert.equal(pilot.season_management, true);
  assert.equal(pilot.opponent_management, true);
  assert.equal(pilot.offline_outbox_sync, true);
  assert.equal(pilot.pilot_simplicity_mode, true);
  assert.equal(pilot.game_day_minimal_mode, true);
  assert.equal(pilot.required_fields_only_entry, true);
  assert.equal(pilot.pilot_settings_scoped_storage, true);
  assert.equal(pilot.pilot_settings_server_sync, true);

  assert.equal(pilot.csv_export, false);
  assert.equal(pilot.json_export, false);
  assert.equal(pilot.xlsx_export, true);
  assert.equal(pilot.pdf_export, true);
  assert.equal(pilot.drive_summary, false);
  assert.equal(pilot.advanced_participant_capture, false);
  assert.equal(pilot.live_public_tracker, false);
  assert.equal(pilot.advanced_analytics, false);
  assert.equal(pilot.organization_branding, true);
  assert.equal(pilot.internal_debug_tools, false);
});

test("feature overrides can selectively promote optional pilot features", () => {
  const publicOverrideKey = "NEXT_PUBLIC_FEATURE_OVERRIDE_XLSX_EXPORT";
  const serverOverrideKey = "FEATURE_OVERRIDE_XLSX_EXPORT";
  const previousPublic = process.env[publicOverrideKey];
  const previousServer = process.env[serverOverrideKey];

  process.env[publicOverrideKey] = "true";
  delete process.env[serverOverrideKey];
  assert.equal(getFeatureFlags("pilot_core").xlsx_export, true);

  process.env[serverOverrideKey] = "false";
  assert.equal(getFeatureFlags("pilot_core").xlsx_export, false);

  if (previousPublic === undefined) {
    delete process.env[publicOverrideKey];
  } else {
    process.env[publicOverrideKey] = previousPublic;
  }

  if (previousServer === undefined) {
    delete process.env[serverOverrideKey];
  } else {
    process.env[serverOverrideKey] = previousServer;
  }
});
