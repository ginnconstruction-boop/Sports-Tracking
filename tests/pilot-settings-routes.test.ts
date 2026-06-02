import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as getPilotSettings, POST as postPilotSettings } from "@/app/api/v1/pilot-settings/route";
import { GET as getPilotSettingAudits } from "@/app/api/v1/pilot-settings/audits/route";
import { POST as postPilotSettingsReset } from "@/app/api/v1/pilot-settings/reset/route";
import { pilotSettingsErrorResponse } from "@/app/api/v1/pilot-settings/route-helpers";

const organizationId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const featureOverrideKey = "FEATURE_OVERRIDE_PILOT_SETTINGS_SERVER_SYNC";
const publicFeatureOverrideKey = "NEXT_PUBLIC_FEATURE_OVERRIDE_PILOT_SETTINGS_SERVER_SYNC";

async function readResponseJson(response: Response) {
  return (await response.json()) as { error?: string | { fieldErrors?: Record<string, string[]> } };
}

function withPilotSettingsFeatureDisabled<T>(callback: () => Promise<T>) {
  const previousServer = process.env[featureOverrideKey];
  const previousPublic = process.env[publicFeatureOverrideKey];
  process.env[featureOverrideKey] = "false";
  process.env[publicFeatureOverrideKey] = "false";

  return callback().finally(() => {
    if (previousServer === undefined) {
      delete process.env[featureOverrideKey];
    } else {
      process.env[featureOverrideKey] = previousServer;
    }

    if (previousPublic === undefined) {
      delete process.env[publicFeatureOverrideKey];
    } else {
      process.env[publicFeatureOverrideKey] = previousPublic;
    }
  });
}

test("pilot settings GET returns 400 for missing scope params", async () => {
  const response = await getPilotSettings(new NextRequest("http://localhost/api/v1/pilot-settings"));
  assert.equal(response.status, 400);
});

test("pilot settings POST returns 400 for invalid payload", async () => {
  const response = await postPilotSettings(
    new NextRequest("http://localhost/api/v1/pilot-settings", {
      method: "POST",
      body: JSON.stringify({
        organizationId,
        teamId,
        key: "invalid_key",
        enabled: true
      })
    })
  );

  assert.equal(response.status, 400);
});

test("pilot settings GET returns 404 when server sync is disabled", async () => {
  await withPilotSettingsFeatureDisabled(async () => {
    const response = await getPilotSettings(
      new NextRequest(
        `http://localhost/api/v1/pilot-settings?organizationId=${organizationId}&teamId=${teamId}`
      )
    );
    const body = await readResponseJson(response);

    assert.equal(response.status, 404);
    assert.equal(body.error, "Pilot settings sync is disabled.");
  });
});

test("pilot settings audits GET returns 400 for invalid limit", async () => {
  const response = await getPilotSettingAudits(
    new NextRequest(
      `http://localhost/api/v1/pilot-settings/audits?organizationId=${organizationId}&teamId=${teamId}&limit=0`
    )
  );

  assert.equal(response.status, 400);
});

test("pilot settings audits GET returns 404 when server sync is disabled", async () => {
  await withPilotSettingsFeatureDisabled(async () => {
    const response = await getPilotSettingAudits(
      new NextRequest(
        `http://localhost/api/v1/pilot-settings/audits?organizationId=${organizationId}&teamId=${teamId}`
      )
    );
    const body = await readResponseJson(response);

    assert.equal(response.status, 404);
    assert.equal(body.error, "Pilot settings sync is disabled.");
  });
});

test("pilot settings reset POST returns 400 for invalid payload", async () => {
  const response = await postPilotSettingsReset(
    new NextRequest("http://localhost/api/v1/pilot-settings/reset", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "bad-id",
        teamId
      })
    })
  );

  assert.equal(response.status, 400);
});

test("pilot settings reset POST returns 404 when server sync is disabled", async () => {
  await withPilotSettingsFeatureDisabled(async () => {
    const response = await postPilotSettingsReset(
      new NextRequest("http://localhost/api/v1/pilot-settings/reset", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          teamId
        })
      })
    );
    const body = await readResponseJson(response);

    assert.equal(response.status, 404);
    assert.equal(body.error, "Pilot settings sync is disabled.");
  });
});

test("pilot settings error helper maps auth and permission failures", async () => {
  const authResponse = pilotSettingsErrorResponse(
    new Error("Authentication required."),
    "Pilot settings are unavailable."
  );
  const authBody = await readResponseJson(authResponse);
  assert.equal(authResponse.status, 401);
  assert.equal(authBody.error, "Authentication required.");

  const permissionResponse = pilotSettingsErrorResponse(
    new Error("Insufficient permissions for this organization."),
    "Pilot settings are unavailable."
  );
  const permissionBody = await readResponseJson(permissionResponse);
  assert.equal(permissionResponse.status, 403);
  assert.equal(permissionBody.error, "Insufficient permissions for this organization.");
});
