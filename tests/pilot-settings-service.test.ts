import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPilotSettingAuditLimit,
  shouldCreatePilotSettingAudit
} from "@/server/services/pilot-settings-service";

test("shouldCreatePilotSettingAudit records first write and value changes only", () => {
  assert.equal(shouldCreatePilotSettingAudit(null, true), true);
  assert.equal(shouldCreatePilotSettingAudit(null, false), true);
  assert.equal(shouldCreatePilotSettingAudit(true, false), true);
  assert.equal(shouldCreatePilotSettingAudit(false, true), true);
  assert.equal(shouldCreatePilotSettingAudit(true, true), false);
  assert.equal(shouldCreatePilotSettingAudit(false, false), false);
});

test("clampPilotSettingAuditLimit enforces defaults and bounds", () => {
  assert.equal(clampPilotSettingAuditLimit(undefined), 50);
  assert.equal(clampPilotSettingAuditLimit(Number.NaN), 50);
  assert.equal(clampPilotSettingAuditLimit(0), 1);
  assert.equal(clampPilotSettingAuditLimit(-9), 1);
  assert.equal(clampPilotSettingAuditLimit(20.8), 20);
  assert.equal(clampPilotSettingAuditLimit(200), 200);
  assert.equal(clampPilotSettingAuditLimit(9999), 200);
});
