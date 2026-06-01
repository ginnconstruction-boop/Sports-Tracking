import assert from "node:assert/strict";
import test from "node:test";
import { shouldCreatePilotSettingAudit } from "@/server/services/pilot-settings-service";

test("shouldCreatePilotSettingAudit records first write and value changes only", () => {
  assert.equal(shouldCreatePilotSettingAudit(null, true), true);
  assert.equal(shouldCreatePilotSettingAudit(null, false), true);
  assert.equal(shouldCreatePilotSettingAudit(true, false), true);
  assert.equal(shouldCreatePilotSettingAudit(false, true), true);
  assert.equal(shouldCreatePilotSettingAudit(true, true), false);
  assert.equal(shouldCreatePilotSettingAudit(false, false), false);
});
