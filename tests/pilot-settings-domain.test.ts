import assert from "node:assert/strict";
import test from "node:test";
import { pilotSettingDefaults, pilotSettingKeys } from "@/lib/domain/pilot-settings";

test("pilot settings defaults cover every key", () => {
  assert.deepEqual(pilotSettingKeys, [
    "minimal_mode",
    "required_fields_only",
    "coach_ready_shortcuts"
  ]);

  for (const key of pilotSettingKeys) {
    assert.equal(typeof pilotSettingDefaults[key], "boolean");
  }
});
