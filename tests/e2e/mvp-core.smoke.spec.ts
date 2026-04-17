import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolveSmokeConfig } from "./support/smoke-config";

type BrowserJsonResult<T = unknown> = {
  status: number;
  body: T;
};

type ApiEvidence = {
  method: string;
  url: string;
  status: number;
  requestBody: string | null;
  responseBody: string | null;
};

const smoke = resolveSmokeConfig();

function toDateTimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function browserJson<T>(page: Page, url: string, init?: RequestInit): Promise<BrowserJsonResult<T>> {
  return page.evaluate(
    async ({ targetUrl, targetInit }) => {
      const response = await fetch(targetUrl, targetInit);
      const text = await response.text();
      let body: unknown = null;

      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      return {
        status: response.status,
        body: body as T
      };
    },
    {
      targetUrl: url,
      targetInit: init
    }
  );
}

async function attachDiagnostics(
  page: Page,
  testInfo: TestInfo,
  apiEvidence: ApiEvidence[],
  consoleErrors: string[],
  currentStep: string
) {
  const screenshotPath = testInfo.outputPath("final-page.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("final-page", {
    path: screenshotPath,
    contentType: "image/png"
  });
  await testInfo.attach("api-evidence", {
    body: Buffer.from(JSON.stringify(apiEvidence, null, 2)),
    contentType: "application/json"
  });
  await testInfo.attach("console-errors", {
    body: Buffer.from(JSON.stringify({ currentStep, consoleErrors }, null, 2)),
    contentType: "application/json"
  });
}

test.describe.configure({ mode: "serial" });

test("MVP critical path smoke", async ({ page }, testInfo) => {
  test.setTimeout(240_000);

  const apiEvidence: ApiEvidence[] = [];
  const consoleErrors: string[] = [];
  let currentStep = "not-started";

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/v1/")) {
      return;
    }

    let responseBody: string | null = null;
    try {
      responseBody = await response.text();
    } catch {
      responseBody = null;
    }

    apiEvidence.push({
      method: response.request().method(),
      url,
      status: response.status(),
      requestBody: response.request().postData() ?? null,
      responseBody
    });
  });

  async function runStep(name: string, body: () => Promise<void>) {
    currentStep = name;
    await test.step(name, body);
  }

  try {
    let organizationId = "";
    let teamId = "";
    let seasonId = "";
    let opponentId = "";
    let venueId = "";
    let gameId = "";

    await runStep("login", async () => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(smoke.email);
      await page.getByLabel("Password").fill(smoke.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForLoadState("networkidle");
      await page.goto("/setup");
      await expect(page.getByRole("heading", { name: "Program setup" })).toBeVisible();
    });

    await runStep("/api/v1/me returns 200", async () => {
      const me = await browserJson<{
        id: string;
        email: string;
        memberships: Array<{ organizationId: string; organizationName: string }>;
      }>(page, "/api/v1/me");

      expect(me.status).toBe(200);
      const memberships = Array.isArray(me.body?.memberships) ? me.body.memberships : [];
      const membership = memberships.find((item) => item.organizationName === smoke.organization.name);
      expect(membership).toBeTruthy();
      organizationId = membership!.organizationId;
    });

    await runStep("organization load/select", async () => {
      await expect(page.getByLabel("Organization")).toBeVisible();
      await expect(page.getByText(smoke.organization.name, { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "1. Organization done" })).toBeVisible();
    });

    await runStep("create/select team", async () => {
      await page.getByLabel("Team name").fill(smoke.team.name);
      await page.getByLabel("Level").fill(smoke.team.level);
      await page.getByRole("button", { name: "Create team" }).click();

      await expect(page.getByRole("button", { name: "2. Team done" })).toBeVisible();

      const teams = await browserJson<{ items: Array<{ id: string; name: string }> }>(
        page,
        `/api/v1/teams?organizationId=${organizationId}`
      );
      expect(teams.status).toBe(200);
      const match = Array.isArray(teams.body.items)
        ? teams.body.items.find((item) => item.name === smoke.team.name)
        : undefined;
      expect(match).toBeTruthy();
      teamId = match!.id;
    });

    await runStep("create/select season", async () => {
      await page.getByLabel("Label").fill(smoke.season.label);
      await page.getByLabel("Year").fill(String(smoke.season.year));
      await page.getByRole("button", { name: "Create season" }).click();

      await expect(page.getByRole("button", { name: "3. Season done" })).toBeVisible();

      const seasons = await browserJson<{ items: Array<{ id: string; label: string }> }>(
        page,
        `/api/v1/seasons?teamId=${teamId}`
      );
      expect(seasons.status).toBe(200);
      const match = Array.isArray(seasons.body.items)
        ? seasons.body.items.find((item) => item.label === smoke.season.label)
        : undefined;
      expect(match).toBeTruthy();
      seasonId = match!.id;
    });

    await runStep("create/select opponent", async () => {
      await page.getByLabel("School").fill(smoke.opponent.schoolName);
      await page.getByLabel("Mascot").fill(smoke.opponent.mascot);
      await page.getByLabel("Short code").fill(smoke.opponent.shortCode);
      await page.getByRole("button", { name: "Create opponent" }).click();

      const opponents = await browserJson<{ items: Array<{ id: string; schoolName: string }> }>(
        page,
        `/api/v1/opponents?organizationId=${organizationId}`
      );
      expect(opponents.status).toBe(200);
      const match = Array.isArray(opponents.body.items)
        ? opponents.body.items.find((item) => item.schoolName === smoke.opponent.schoolName)
        : undefined;
      expect(match).toBeTruthy();
      opponentId = match!.id;
    });

    await runStep("create/select venue", async () => {
      await page.getByLabel("Venue name").fill(smoke.venue.name);
      await page.getByLabel("City").fill(smoke.venue.city);
      await page.getByLabel("State").fill(smoke.venue.state);
      await page.getByRole("button", { name: "Create venue" }).click();

      await expect(page.getByRole("button", { name: "4. Opponent + venue done" })).toBeVisible();

      const venues = await browserJson<{ items: Array<{ id: string; name: string }> }>(
        page,
        `/api/v1/venues?organizationId=${organizationId}`
      );
      expect(venues.status).toBe(200);
      const match = Array.isArray(venues.body.items)
        ? venues.body.items.find((item) => item.name === smoke.venue.name)
        : undefined;
      expect(match).toBeTruthy();
      venueId = match!.id;
    });

    await runStep("create game", async () => {
      await page.getByLabel("Opponent").selectOption(opponentId);
      await page.getByLabel("Venue").selectOption(venueId);

      const kickoff = new Date();
      kickoff.setMinutes(kickoff.getMinutes() + 90);
      const arrival = new Date(kickoff.getTime() - 45 * 60_000);
      const report = new Date(arrival.getTime() - 30 * 60_000);

      await page.getByLabel("Kickoff").fill(toDateTimeLocalValue(kickoff));
      await page.getByLabel("Arrival").fill(toDateTimeLocalValue(arrival));
      await page.getByLabel("Report time").fill(toDateTimeLocalValue(report));
      await page.getByLabel("Primary team side").selectOption(smoke.game.homeAway);
      await page.getByLabel("Status").selectOption("scheduled");
      await page.getByRole("button", { name: "Create game" }).click();

      const games = await browserJson<{ items: Array<{ game: { id: string; opponentId: string; venueId?: string | null } }> }>(
        page,
        `/api/v1/games?seasonId=${seasonId}`
      );
      expect(games.status).toBe(200);
      const match = Array.isArray(games.body.items)
        ? games.body.items.find((item) => item.game.opponentId === opponentId && item.game.venueId === venueId)
        : undefined;
      expect(match).toBeTruthy();
      gameId = match!.game.id;
    });

    await runStep("games list load", async () => {
      await page.goto("/games");
      await expect(page.getByRole("heading", { name: "Game schedule" })).toBeVisible();
      await expect(page.getByText(smoke.team.name, { exact: false })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open game" })).toBeVisible();
    });

    await runStep("GET /api/v1/games/[gameId] returns 200", async () => {
      const gameDetail = await browserJson<{ item: { id: string; status: string } }>(
        page,
        `/api/v1/games/${gameId}`
      );
      expect(gameDetail.status).toBe(200);
      expect(gameDetail.body.item?.id).toBe(gameId);
    });

    await runStep("open manage", async () => {
      await page.getByRole("link", { name: "Open game" }).first().click();
      await page.waitForURL(new RegExp(`/games/${gameId}/manage$`));
      await expect(page.getByRole("heading", { name: /Game admin/i })).toBeVisible();
    });

    await runStep("Game Day open and session connect", async () => {
      const sessionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/games/${gameId}/session`) &&
          response.request().method() === "POST"
      );

      await page.getByRole("link", { name: "Game Day Mode" }).click();
      await page.waitForURL(new RegExp(`/games/${gameId}/gameday$`));

      const sessionResponse = await sessionResponsePromise;
      const sessionBodyText = await sessionResponse.text();
      const sessionBody = sessionBodyText ? JSON.parse(sessionBodyText) : null;

      expect([201, 409]).toContain(sessionResponse.status());
      expect(sessionBody).toBeTruthy();
      await expect(page.getByText(smoke.team.name, { exact: false })).toBeVisible();
    });

    await runStep("live snapshot and plays load", async () => {
      const [live, plays] = await Promise.all([
        browserJson<{ item: { gameId: string } }>(page, `/api/v1/games/${gameId}/live`),
        browserJson<{ items: Array<{ id: string }> }>(page, `/api/v1/games/${gameId}/plays`)
      ]);

      expect(live.status).toBe(200);
      expect(plays.status).toBe(200);
      await expect(page.getByText("Live oversight")).toBeVisible();
    });

    await runStep("submit one simple play", async () => {
      const submitButton = page.getByRole("button", { name: "Submit play" });
      if (await submitButton.isDisabled()) {
        const leaseButton = page.getByRole("button", { name: /Try writer lease|Trying\.\.\./ });
        if (await leaseButton.count()) {
          await leaseButton.click();
          await page.waitForLoadState("networkidle");
        }
      }

      await expect(submitButton).toBeEnabled();
      if (await page.getByRole("button", { name: "Touchback" }).count()) {
        await page.getByRole("button", { name: "Touchback" }).click();
      } else if (await page.getByRole("button", { name: "Likely touchback" }).count()) {
        await page.getByRole("button", { name: "Likely touchback" }).click();
      } else {
        await page.getByLabel("Return result").selectOption("touchback");
      }

      const playPost = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/games/${gameId}/plays`) &&
          response.request().method() === "POST"
      );

      await submitButton.click();
      const playResponse = await playPost;
      expect(playResponse.status()).toBe(201);

      const plays = await browserJson<{ items: Array<{ id: string }> }>(page, `/api/v1/games/${gameId}/plays`);
      expect(plays.status).toBe(200);
      expect(Array.isArray(plays.body.items)).toBeTruthy();
      expect(plays.body.items.length).toBeGreaterThan(0);
      await expect(page.getByText("No plays logged yet.")).toHaveCount(0);
    });

    await runStep("refresh and confirm state persists", async () => {
      await page.reload();
      await page.waitForLoadState("networkidle");
      const plays = await browserJson<{ items: Array<{ id: string }> }>(page, `/api/v1/games/${gameId}/plays`);
      expect(plays.status).toBe(200);
      expect(plays.body.items.length).toBeGreaterThan(0);
      await expect(page.getByRole("heading", { name: "Recent plays" })).toBeVisible();
    });

    await runStep("reports preview loads", async () => {
      await page.goto(`/games/${gameId}/reports`);
      await expect(page.getByText("Report preview")).toBeVisible();
      await expect(page.getByText("Coach packet summary")).toBeVisible();
    });
  } catch (error) {
    await attachDiagnostics(page, testInfo, apiEvidence, consoleErrors, currentStep);
    throw error;
  }
});
