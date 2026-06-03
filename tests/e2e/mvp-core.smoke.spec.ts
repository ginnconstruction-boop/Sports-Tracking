import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolveSmokeConfig } from "./support/smoke-config";

type BrowserJsonResult<T = unknown> = {
  status: number;
  body: T;
};

type BrowserBinaryResult = {
  status: number;
  byteLength: number;
  contentType: string | null;
};

type ApiEvidence = {
  method: string;
  url: string;
  status: number;
  requestBody: string | null;
  responseBody: string | null;
};

type LandingState = "setup" | "games" | "dashboard" | "gameday" | "unknown";
type SmokeMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug?: string;
  role?: string;
};

const smoke = resolveSmokeConfig();
const preferredGameId = process.env.SMOKE_GAME_ID?.trim() ?? "";
const requireCloseoutReady = process.env.SMOKE_REQUIRE_CLOSEOUT_READY === "true";

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

async function browserBinary(page: Page, url: string): Promise<BrowserBinaryResult> {
  return page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl);
    const body = await response.arrayBuffer();

    return {
      status: response.status,
      byteLength: body.byteLength,
      contentType: response.headers.get("content-type")
    };
  }, url);
}

async function attachDiagnostics(
  page: Page,
  testInfo: TestInfo,
  apiEvidence: ApiEvidence[],
  consoleErrors: string[],
  currentStep: string
) {
  if (!page.isClosed()) {
    const screenshotPath = testInfo.outputPath("final-page.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("final-page", {
      path: screenshotPath,
      contentType: "image/png"
    });
  }
  await testInfo.attach("api-evidence", {
    body: Buffer.from(JSON.stringify(apiEvidence, null, 2)),
    contentType: "application/json"
  });
  await testInfo.attach("console-errors", {
    body: Buffer.from(JSON.stringify({ currentStep, consoleErrors }, null, 2)),
    contentType: "application/json"
  });
}

async function detectLandingState(page: Page): Promise<LandingState> {
  const pathName = new URL(page.url()).pathname;

  if (pathName.includes("/gameday")) {
    return "gameday";
  }

  if (pathName === "/setup" || (await page.getByLabel("Organization").count()) > 0) {
    return "setup";
  }

  if (pathName === "/games" || (await page.getByRole("heading", { name: "Game schedule" }).count()) > 0) {
    return "games";
  }

  if (pathName === "/" || (await page.getByRole("button", { name: "Operations" }).count()) > 0) {
    return "dashboard";
  }

  return "unknown";
}

function pickPreferredMatch<T>(items: T[], predicate: (item: T) => boolean) {
  return items.find(predicate) ?? items[0];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    let landingState: LandingState = "unknown";
    let resolvedMembership: SmokeMembership | null = null;
    let organizationName = "";
    let teamName = "";
    let opponentName = "";
    let venueName = "";
    const setupMode = () => landingState === "setup";

    await runStep("preflight runtime diagnostics and auth guard", async () => {
      await page.goto("/api/health");

      const health = await browserJson<{ ok: boolean; timestamp: string }>(page, "/api/health");
      expect(health.status).toBe(200);
      expect(health.body.ok).toBeTruthy();
      expect(typeof health.body.timestamp).toBe("string");

      const meBeforeAuth = await browserJson<{ error?: string }>(page, "/api/v1/me");
      expect([200, 401]).toContain(meBeforeAuth.status);

      const setupHealthBeforeAuth = await browserJson<{
        error?: string;
        runtime?: {
          databaseHost?: string | null;
          directUrlHost?: string | null;
          supabaseHost?: string | null;
          hasServiceRoleKey?: boolean;
        };
      }>(page, "/api/v1/setup-health");

      expect([200, 401]).toContain(setupHealthBeforeAuth.status);
      if (setupHealthBeforeAuth.body.runtime) {
        expect(setupHealthBeforeAuth.body.runtime.supabaseHost).toBeTruthy();
        expect(typeof setupHealthBeforeAuth.body.runtime.hasServiceRoleKey).toBe("boolean");
      }
    });

    await runStep("login", async () => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(smoke.email);
      await page.getByLabel("Password").fill(smoke.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }).catch(() => null);
      await page.waitForLoadState("networkidle");
      if (new URL(page.url()).pathname.startsWith("/login")) {
        const errorNote = page.locator(".error-note").first();
        const errorText =
          (await errorNote.isVisible().catch(() => false)) ? await errorNote.textContent() : null;
        throw new Error(errorText?.trim() || "Login did not redirect off /login.");
      }
      landingState = await detectLandingState(page);
      expect(landingState).not.toBe("unknown");
    });

    await runStep("setup health resolves for authenticated smoke user", async () => {
      const setupHealthAfterAuth = await browserJson<{
        runtime?: {
          supabaseHost?: string | null;
        };
        auth?: {
          id: string;
          email: string;
        };
        admin?: {
          ok: boolean;
        };
      }>(page, "/api/v1/setup-health");

      expect(setupHealthAfterAuth.status).toBe(200);
      expect(setupHealthAfterAuth.body.runtime?.supabaseHost).toBeTruthy();
      expect(setupHealthAfterAuth.body.auth?.email).toBe(smoke.email);
      expect(setupHealthAfterAuth.body.admin?.ok).toBeTruthy();
    });

    await runStep("/api/v1/me returns 200", async () => {
      const me = await browserJson<{
        id: string;
        email: string;
        memberships: SmokeMembership[];
      }>(page, "/api/v1/me");

      expect(me.status).toBe(200);
      const memberships = Array.isArray(me.body?.memberships) ? me.body.memberships : [];
      const membership = pickPreferredMatch(
        memberships,
        (item) =>
          item.organizationName === smoke.organization.name || item.organizationSlug === smoke.organization.slug
      );
      expect(membership).toBeTruthy();
      resolvedMembership = membership ?? null;
      organizationId = membership!.organizationId;
      organizationName = membership!.organizationName;
    });

    await runStep("organization load/select", async () => {
      if (setupMode()) {
        const organizationSelect = page.getByLabel("Organization");
        await expect(organizationSelect).toBeVisible();
        await expect(organizationSelect).toHaveValue(organizationId);
        return;
      }

      expect(organizationId).toBeTruthy();
      expect(organizationName).toBeTruthy();
    });

    await runStep("create/select team", async () => {
      const teams = await browserJson<{ items: Array<{ id: string; name: string }> }>(
        page,
        `/api/v1/teams?organizationId=${organizationId}`
      );
      expect(teams.status).toBe(200);
      const teamItems = Array.isArray(teams.body.items) ? teams.body.items : [];
      let match = pickPreferredMatch(teamItems, (item) => item.name === smoke.team.name);

      if (!match && setupMode()) {
        await page.getByLabel("Team name").fill(smoke.team.name);
        await page.getByLabel("Level").fill(smoke.team.level);
        await page.getByRole("button", { name: "Create team" }).click();

        await expect(page.getByRole("button", { name: "2. Team done" })).toBeVisible();

        const refreshedTeams = await browserJson<{ items: Array<{ id: string; name: string }> }>(
          page,
          `/api/v1/teams?organizationId=${organizationId}`
        );
        expect(refreshedTeams.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedTeams.body.items) ? refreshedTeams.body.items : [],
          (item) => item.name === smoke.team.name
        );
      }

      if (!match && !setupMode()) {
        const createdTeam = await browserJson<{ item?: { id: string; name: string } }>(page, "/api/v1/teams", {
          method: "POST",
          body: JSON.stringify({
            organizationId,
            name: smoke.team.name,
            level: smoke.team.level
          })
        });
        expect([201, 500].includes(createdTeam.status)).toBeTruthy();

        const refreshedTeams = await browserJson<{ items: Array<{ id: string; name: string }> }>(
          page,
          `/api/v1/teams?organizationId=${organizationId}`
        );
        expect(refreshedTeams.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedTeams.body.items) ? refreshedTeams.body.items : [],
          (item) => item.name === smoke.team.name
        );
      }

      expect(match).toBeTruthy();
      teamId = match!.id;
      teamName = match!.name;
    });

    await runStep("create/select season", async () => {
      const seasons = await browserJson<{ items: Array<{ id: string; label: string }> }>(
        page,
        `/api/v1/seasons?teamId=${teamId}`
      );
      expect(seasons.status).toBe(200);
      const seasonItems = Array.isArray(seasons.body.items) ? seasons.body.items : [];
      let match = pickPreferredMatch(seasonItems, (item) => item.label === smoke.season.label);

      if (!match && setupMode()) {
        await page.getByLabel("Label").fill(smoke.season.label);
        await page.getByLabel("Year").fill(String(smoke.season.year));
        await page.getByRole("button", { name: "Create season" }).click();

        await expect(page.getByRole("button", { name: "3. Season done" })).toBeVisible();

        const refreshedSeasons = await browserJson<{ items: Array<{ id: string; label: string }> }>(
          page,
          `/api/v1/seasons?teamId=${teamId}`
        );
        expect(refreshedSeasons.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedSeasons.body.items) ? refreshedSeasons.body.items : [],
          (item) => item.label === smoke.season.label
        );
      }

      if (!match && !setupMode()) {
        const createdSeason = await browserJson<{ item?: { id: string; label: string } }>(page, "/api/v1/seasons", {
          method: "POST",
          body: JSON.stringify({
            teamId,
            label: smoke.season.label,
            year: smoke.season.year,
            isActive: true
          })
        });
        expect([201, 500].includes(createdSeason.status)).toBeTruthy();

        const refreshedSeasons = await browserJson<{ items: Array<{ id: string; label: string }> }>(
          page,
          `/api/v1/seasons?teamId=${teamId}`
        );
        expect(refreshedSeasons.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedSeasons.body.items) ? refreshedSeasons.body.items : [],
          (item) => item.label === smoke.season.label
        );
      }

      expect(match).toBeTruthy();
      seasonId = match!.id;
    });

    await runStep("create/select opponent", async () => {
      const opponents = await browserJson<{ items: Array<{ id: string; schoolName: string }> }>(
        page,
        `/api/v1/opponents?organizationId=${organizationId}`
      );
      expect(opponents.status).toBe(200);
      const opponentItems = Array.isArray(opponents.body.items) ? opponents.body.items : [];
      let match = pickPreferredMatch(opponentItems, (item) => item.schoolName === smoke.opponent.schoolName);

      if (!match && setupMode()) {
        await page.getByLabel("School").fill(smoke.opponent.schoolName);
        await page.getByLabel("Mascot").fill(smoke.opponent.mascot);
        await page.getByLabel("Short code").fill(smoke.opponent.shortCode);
        await page.getByRole("button", { name: "Create opponent" }).click();

        const refreshedOpponents = await browserJson<{ items: Array<{ id: string; schoolName: string }> }>(
          page,
          `/api/v1/opponents?organizationId=${organizationId}`
        );
        expect(refreshedOpponents.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedOpponents.body.items) ? refreshedOpponents.body.items : [],
          (item) => item.schoolName === smoke.opponent.schoolName
        );
      }

      if (!match && !setupMode()) {
        const createdOpponent = await browserJson<{ item?: { id: string; schoolName: string } }>(
          page,
          "/api/v1/opponents",
          {
            method: "POST",
            body: JSON.stringify({
              organizationId,
              schoolName: smoke.opponent.schoolName,
              mascot: smoke.opponent.mascot,
              shortCode: smoke.opponent.shortCode
            })
          }
        );
        expect([201, 500].includes(createdOpponent.status)).toBeTruthy();

        const refreshedOpponents = await browserJson<{ items: Array<{ id: string; schoolName: string }> }>(
          page,
          `/api/v1/opponents?organizationId=${organizationId}`
        );
        expect(refreshedOpponents.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedOpponents.body.items) ? refreshedOpponents.body.items : [],
          (item) => item.schoolName === smoke.opponent.schoolName
        );
      }

      expect(match).toBeTruthy();
      opponentId = match!.id;
      opponentName = match!.schoolName;
    });

    await runStep("create/select venue", async () => {
      const venues = await browserJson<{ items: Array<{ id: string; name: string }> }>(
        page,
        `/api/v1/venues?organizationId=${organizationId}`
      );
      expect(venues.status).toBe(200);
      const venueItems = Array.isArray(venues.body.items) ? venues.body.items : [];
      let match = pickPreferredMatch(venueItems, (item) => item.name === smoke.venue.name);

      if (!match && setupMode()) {
        await page.getByLabel("Venue name").fill(smoke.venue.name);
        await page.getByLabel("City").fill(smoke.venue.city);
        await page.getByLabel("State").fill(smoke.venue.state);
        await page.getByRole("button", { name: "Create venue" }).click();

        await expect(page.getByRole("button", { name: "4. Opponent + venue done" })).toBeVisible();

        const refreshedVenues = await browserJson<{ items: Array<{ id: string; name: string }> }>(
          page,
          `/api/v1/venues?organizationId=${organizationId}`
        );
        expect(refreshedVenues.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedVenues.body.items) ? refreshedVenues.body.items : [],
          (item) => item.name === smoke.venue.name
        );
      }

      if (!match && !setupMode()) {
        const createdVenue = await browserJson<{ item?: { id: string; name: string } }>(page, "/api/v1/venues", {
          method: "POST",
          body: JSON.stringify({
            organizationId,
            name: smoke.venue.name,
            city: smoke.venue.city,
            state: smoke.venue.state
          })
        });
        expect([201, 500].includes(createdVenue.status)).toBeTruthy();

        const refreshedVenues = await browserJson<{ items: Array<{ id: string; name: string }> }>(
          page,
          `/api/v1/venues?organizationId=${organizationId}`
        );
        expect(refreshedVenues.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedVenues.body.items) ? refreshedVenues.body.items : [],
          (item) => item.name === smoke.venue.name
        );
      }

      expect(match).toBeTruthy();
      venueId = match!.id;
      venueName = match!.name;
    });

    await runStep("create/select game", async () => {
      if (preferredGameId) {
        gameId = preferredGameId;
        return;
      }

      if (!setupMode()) {
        const kickoff = new Date();
        kickoff.setMinutes(kickoff.getMinutes() + 90);
        kickoff.setSeconds(0, 0);
        const arrival = new Date(kickoff.getTime() - 45 * 60_000);
        const report = new Date(arrival.getTime() - 30 * 60_000);

        const createdGame = await browserJson<{ item: { id: string } }>(page, "/api/v1/games", {
          method: "POST",
          body: JSON.stringify({
            seasonId,
            opponentId,
            venueId: venueId || undefined,
            kickoffAt: kickoff.toISOString(),
            arrivalAt: arrival.toISOString(),
            reportAt: report.toISOString(),
            homeAway: smoke.game.homeAway,
            status: "scheduled"
          })
        });

        expect(createdGame.status).toBe(201);
        gameId = createdGame.body.item.id;
        return;
      }

      const games = await browserJson<{
        items: Array<{
          game: {
            id: string;
            opponentId: string;
            venueId?: string | null;
            currentRevision?: number;
            status?: string;
          };
        }>;
      }>(
        page,
        `/api/v1/games?seasonId=${seasonId}`
      );
      expect(games.status).toBe(200);
      const gameItems = Array.isArray(games.body.items) ? games.body.items : [];
      let match = gameItems.find(
        (item) => item.game.opponentId === opponentId && item.game.venueId === venueId
      );

      if (!match && setupMode()) {
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

        const refreshedGames = await browserJson<{
          items: Array<{ game: { id: string; opponentId: string; venueId?: string | null } }>;
        }>(page, `/api/v1/games?seasonId=${seasonId}`);
        expect(refreshedGames.status).toBe(200);
        match = pickPreferredMatch(
          Array.isArray(refreshedGames.body.items) ? refreshedGames.body.items : [],
          (item) => item.game.opponentId === opponentId && item.game.venueId === venueId
        );
      }

      if (!match) {
        match = pickPreferredMatch(
          gameItems,
          (item) => item.game.opponentId === opponentId && item.game.venueId === venueId
        );
      }

      expect(match).toBeTruthy();
      gameId = match!.game.id;
    });

    await runStep("games list load", async () => {
      await page.goto("/games");
      const manageLink = page.locator(`a[href="/games/${gameId}/manage"]`);
      const gameCard = manageLink.locator("xpath=ancestor::div[contains(@class,'timeline-card')][1]");
      const gameGroup = manageLink.locator("xpath=ancestor::section[contains(@class,'section-card')][1]");

      await expect(page.getByRole("heading", { name: "Game schedule" })).toBeVisible();
      await expect(gameGroup.getByRole("heading", { name: new RegExp(escapeRegExp(teamName || smoke.team.name)) }).first()).toBeVisible();
      await expect(gameCard).toContainText(opponentName || smoke.opponent.schoolName);
      await expect(gameCard).toContainText(venueName || smoke.venue.name);
      await expect(manageLink).toBeVisible();
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
      await page.locator(`a[href="/games/${gameId}/manage"]`).click();
      await page.waitForURL(new RegExp(`/games/${gameId}/manage$`));
      await expect(page.getByRole("heading", { name: /Game admin/i })).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: new RegExp(`${escapeRegExp(teamName || smoke.team.name)}\\s+vs\\s+${escapeRegExp(opponentName || smoke.opponent.schoolName)}`)
        })
      ).toBeVisible();
    });

    await runStep("Game Day open and session connect", async () => {
      const sessionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/games/${gameId}/session`) &&
          response.request().method() === "POST"
      );

      await page.locator(`a[href="/games/${gameId}/gameday"]`).first().click();
      await page.waitForURL(new RegExp(`/games/${gameId}/gameday$`));

      const sessionResponse = await sessionResponsePromise;
      const sessionBodyText = await sessionResponse.text();
      const sessionBody = sessionBodyText ? JSON.parse(sessionBodyText) : null;

      expect([201, 409]).toContain(sessionResponse.status());
      expect(sessionBody).toBeTruthy();
      await expect(
        page.getByRole("heading", {
          name: new RegExp(`${escapeRegExp(opponentName || smoke.opponent.schoolName)}\\s+(at|vs\\.)\\s+${escapeRegExp(teamName || smoke.team.name)}`)
        }).first()
      ).toBeVisible();
    });

    await runStep("live snapshot and plays load", async () => {
      const [live, plays] = await Promise.all([
        browserJson<{ item: { gameId: string } }>(page, `/api/v1/games/${gameId}/live`),
        browserJson<{ items: Array<{ id: string }> }>(page, `/api/v1/games/${gameId}/plays`)
      ]);

      expect(live.status).toBe(200);
      expect(plays.status).toBe(200);
      await expect(page.getByTestId("game-day-recent-plays")).toBeVisible();
    });

    await runStep("submit one simple play", async () => {
      const playEntrySection = page.getByTestId("play-entry-shell");
      const collapsedEntry = page.getByTestId("play-entry-collapsed");
      if (await collapsedEntry.count()) {
        await collapsedEntry.getByRole("button", { name: "Open play entry", exact: true }).click();
      }

      const submitButton = page.getByTestId("submit-play-button");
      if (await submitButton.isDisabled()) {
        const leaseButton = page.getByRole("button", { name: /^(Try writer lease|Trying\.\.\.)$/ }).first();
        if (await leaseButton.count()) {
          await leaseButton.click();
          await page.waitForLoadState("networkidle");
        }
      }

      await expect(submitButton).toBeEnabled();

      const runButton = playEntrySection.getByRole("button", { name: /^Run$/, exact: true });
      if (await runButton.count()) {
        await runButton.first().click();
      }

      const ballCarrierField = playEntrySection.getByLabel(/Ball carrier/i).first();
      const kickerField = playEntrySection.getByLabel(/^Kicker/i).first();

      if (await ballCarrierField.count()) {
        await expect(ballCarrierField).toBeVisible();
        await ballCarrierField.fill("1");
      } else if (await kickerField.count()) {
        await expect(kickerField).toBeVisible();
        await kickerField.fill("1");

        const touchbackButton = playEntrySection.getByRole("button", { name: /^Touchback$/, exact: true }).first();
        if (await touchbackButton.count()) {
          await touchbackButton.click();
        } else {
          const returnResultSelect = playEntrySection.getByLabel(/Return result/i).first();
          if (await returnResultSelect.count()) {
            await returnResultSelect.selectOption("touchback");
          }
        }
      } else {
        throw new Error("No supported primary entry field was visible for the smoke play submission.");
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

    await runStep("final lock + reopen guardrails", async () => {
      await page.goto(`/games/${gameId}/manage`);
      await page.waitForLoadState("networkidle");

      const markFinalButton = page.getByRole("button", { name: "Mark final + lock" });
      const canManageFinalStatus = (await markFinalButton.count()) > 0;
      if (!canManageFinalStatus) {
        await expect(page.getByRole("button", { name: "Reopen final game" })).toHaveCount(0);
        return;
      }

      await markFinalButton.click();
      await expect(page.getByLabel("Status")).toHaveValue("final");

      await page.goto(`/games/${gameId}/gameday`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("submit-play-button")).toBeDisabled();

      await page.goto(`/games/${gameId}/manage`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Reopen final game" }).click();
      await page.getByRole("button", { name: "Confirm reopen" }).click();
      await expect(page.getByText("Reopen reason is required").first()).toBeVisible();

      await page.getByLabel("Reopen reason (required)").fill("Smoke validation reopen for corrections.");
      await page.getByRole("button", { name: "Confirm reopen" }).click();
      await expect(page.getByText("Game reopened and set to ready.").first()).toBeVisible();
    });

    await runStep("writer handoff controls render and release path works", async () => {
      await page.goto(`/games/${gameId}/gameday`);
      await page.waitForLoadState("networkidle");

      const tryWriter = page.getByRole("button", { name: /Try writer lease/i }).first();
      if (await tryWriter.count()) {
        await tryWriter.click();
        await page.waitForLoadState("networkidle");
      }

      const handoffButton = page.getByRole("button", { name: "Handoff writer" }).first();
      if (await handoffButton.count()) {
        await handoffButton.click();
        await expect(page.getByText("Transfer control to next device")).toBeVisible();
        await page.getByRole("button", { name: "Release and hand off" }).click();
        await page.waitForLoadState("networkidle");
      }

      const releaseVisible = await page.getByRole("button", { name: "Release writer" }).first().isVisible().catch(() => false);
      const tryVisible = await page.getByRole("button", { name: /Try writer lease/i }).first().isVisible().catch(() => false);
      expect(releaseVisible || tryVisible).toBeTruthy();
    });

    await runStep("reports preview loads", async () => {
      await page.goto(`/games/${gameId}/reports`);
      const reportPreviewHeading = page.getByText("Report preview");
      if (await reportPreviewHeading.count()) {
        await expect(reportPreviewHeading.first()).toBeVisible();
      }
      const coachPacketSummary = page.getByText("Coach packet summary");
      if (await coachPacketSummary.count()) {
        await expect(coachPacketSummary.first()).toBeVisible();
      }

      const initialReports = await browserJson<{ preview: unknown; exports: Array<{ id: string }> }>(
        page,
        `/api/v1/games/${gameId}/reports`
      );
      expect(initialReports.status).toBe(200);
      expect(initialReports.body.preview).toBeTruthy();
      expect(Array.isArray(initialReports.body.exports)).toBeTruthy();
      const preview = initialReports.body.preview as {
        fullTimeline?: unknown[];
        situational?: {
          byDownDistance?: unknown[];
          byFieldZone?: Array<{ key?: string }>;
        };
      };
      expect(Array.isArray(preview.fullTimeline)).toBeTruthy();
      const hasSituationalBoardShape =
        Array.isArray(preview.situational?.byDownDistance) &&
        Array.isArray(preview.situational?.byFieldZone);
      if (hasSituationalBoardShape) {
        const zoneKeys = new Set((preview.situational?.byFieldZone ?? []).map((item) => item.key));
        expect(zoneKeys.has("red_zone")).toBeTruthy();
        expect(zoneKeys.has("goal_to_go")).toBeTruthy();
      }

      const pdfExport = await browserJson<{
        error?: unknown;
        item: {
          id: string;
          format: string;
          status: string;
          contentType: string | null;
          fileSizeBytes: number | null;
          downloadUrl: string | null;
        };
      }>(page, `/api/v1/games/${gameId}/reports`, {
        method: "POST",
        body: JSON.stringify({
          reportType: "game_report",
          format: "pdf"
        })
      });
      if (pdfExport.status !== 201) {
        const message = typeof pdfExport.body.error === "string" ? pdfExport.body.error : JSON.stringify(pdfExport.body);
        if (requireCloseoutReady) {
          expect(pdfExport.status).toBe(201);
          return;
        }
        expect(pdfExport.status).toBe(500);
        expect(message).toContain("report_exports");
        return;
      }
      expect(pdfExport.body.item.format).toBe("pdf");
      expect(pdfExport.body.item.status).toBe("complete");
      expect(pdfExport.body.item.contentType).toBe("application/pdf");
      expect((pdfExport.body.item.fileSizeBytes ?? 0) > 0).toBeTruthy();
      expect(pdfExport.body.item.downloadUrl).toBeTruthy();

      const pdfBinary = await browserBinary(page, pdfExport.body.item.downloadUrl!);
      expect(pdfBinary.status).toBe(200);
      expect(pdfBinary.byteLength).toBeGreaterThan(0);
      expect(pdfBinary.contentType).toContain("application/pdf");

      const xlsxExport = await browserJson<{
        error?: unknown;
        item: {
          id: string;
          format: string;
          status: string;
          contentType: string | null;
          fileSizeBytes: number | null;
          downloadUrl: string | null;
        };
      }>(page, `/api/v1/games/${gameId}/reports`, {
        method: "POST",
        body: JSON.stringify({
          reportType: "game_report",
          format: "xlsx"
        })
      });
      if (xlsxExport.status !== 201) {
        const message = typeof xlsxExport.body.error === "string" ? xlsxExport.body.error : JSON.stringify(xlsxExport.body);
        if (requireCloseoutReady) {
          expect(xlsxExport.status).toBe(201);
          return;
        }
        expect(xlsxExport.status).toBe(500);
        expect(message).toContain("report_exports");
        return;
      }
      expect(xlsxExport.body.item.format).toBe("xlsx");
      expect(xlsxExport.body.item.status).toBe("complete");
      expect(xlsxExport.body.item.contentType).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect((xlsxExport.body.item.fileSizeBytes ?? 0) > 0).toBeTruthy();
      expect(xlsxExport.body.item.downloadUrl).toBeTruthy();

      const xlsxBinary = await browserBinary(page, xlsxExport.body.item.downloadUrl!);
      expect(xlsxBinary.status).toBe(200);
      expect(xlsxBinary.byteLength).toBeGreaterThan(0);
      expect(xlsxBinary.contentType).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    });

    await runStep("return game to final closeout state", async () => {
      if (!requireCloseoutReady) {
        return;
      }

      await page.goto(`/games/${gameId}/manage`);
      await page.waitForLoadState("networkidle");

      const statusField = page.getByLabel("Status");
      if (await statusField.count()) {
        await expect(statusField).toHaveValue("ready");
      }

      const markFinalButton = page.getByRole("button", { name: "Mark final + lock" });
      await expect(markFinalButton).toBeVisible();
      await markFinalButton.click();
      await expect(statusField).toHaveValue("final");
    });
  } catch (error) {
    await attachDiagnostics(page, testInfo, apiEvidence, consoleErrors, currentStep);
    throw error;
  }
});
