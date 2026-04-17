import fs from "node:fs";
import path from "node:path";

export type SmokeTarget = "local" | "deployed";
export type SmokeSeedMode = "baseline" | "full" | "reset" | "none";

let envLoaded = false;

function parseEnvFile(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadSmokeEnvironment() {
  if (envLoaded) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(filePath)) {
      parseEnvFile(fs.readFileSync(filePath, "utf8"));
    }
  }

  envLoaded = true;
}

function readEnv(name: string, fallback?: string) {
  loadSmokeEnvironment();
  const value = process.env[name];
  if (value && value.length > 0) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${name} is required for smoke testing.`);
}

export function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function resolveSmokeConfig() {
  const organizationName = readEnv("SMOKE_ORGANIZATION_NAME", "REST Smoke Organization");
  const teamName = readEnv("SMOKE_TEAM_NAME", "REST Smoke Team");
  const seasonLabel = readEnv("SMOKE_SEASON_LABEL", "REST Smoke Season");
  const seasonYear = Number.parseInt(readEnv("SMOKE_SEASON_YEAR", "2026"), 10);
  const opponentSchoolName = readEnv("SMOKE_OPPONENT_NAME", "REST Smoke Opponent");
  const venueName = readEnv("SMOKE_VENUE_NAME", "REST Smoke Venue");

  return {
    target: readEnv("SMOKE_TARGET", "local") === "deployed" ? ("deployed" as SmokeTarget) : ("local" as SmokeTarget),
    baseUrl: readEnv("SMOKE_BASE_URL", "http://127.0.0.1:3000"),
    email: readEnv("SMOKE_TEST_EMAIL", "smoke-tracking@example.com").trim().toLowerCase(),
    password: readEnv("SMOKE_TEST_PASSWORD", "SmokePass123!"),
    displayName: readEnv("SMOKE_DISPLAY_NAME", "REST Smoke Operator"),
    organization: {
      name: organizationName,
      slug: readEnv("SMOKE_ORGANIZATION_SLUG", `${toSlug(organizationName)}-smoke`)
    },
    team: {
      name: teamName,
      level: readEnv("SMOKE_TEAM_LEVEL", "Varsity")
    },
    season: {
      label: seasonLabel,
      year: seasonYear
    },
    opponent: {
      schoolName: opponentSchoolName,
      mascot: readEnv("SMOKE_OPPONENT_MASCOT", "Storm"),
      shortCode: readEnv("SMOKE_OPPONENT_SHORT_CODE", "RST")
    },
    venue: {
      name: venueName,
      city: readEnv("SMOKE_VENUE_CITY", "Austin"),
      state: readEnv("SMOKE_VENUE_STATE", "TX")
    },
    game: {
      homeAway: readEnv("SMOKE_GAME_SIDE", "home") === "away" ? ("away" as const) : ("home" as const),
      status: readEnv("SMOKE_GAME_STATUS", "scheduled")
    }
  };
}

export function validateSmokeEnvironment() {
  const smoke = resolveSmokeConfig();
  const seedMode = process.env.SMOKE_SEED_MODE === "full"
    ? "full"
    : process.env.SMOKE_SEED_MODE === "reset"
      ? "reset"
      : process.env.SMOKE_SEED_MODE === "none"
        ? "none"
        : "baseline";
  const missing: string[] = [];

  if (smoke.target === "local") {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY"
    ]) {
      if (!process.env[name]) {
        missing.push(name);
      }
    }
  } else if (seedMode !== "none") {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      if (!process.env[name]) {
        missing.push(name);
      }
    }
  }

  if (!process.env.SMOKE_TEST_EMAIL) {
    missing.push("SMOKE_TEST_EMAIL");
  }

  if (!process.env.SMOKE_TEST_PASSWORD) {
    missing.push("SMOKE_TEST_PASSWORD");
  }

  if (smoke.target === "deployed" && !process.env.SMOKE_BASE_URL) {
    missing.push("SMOKE_BASE_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Smoke environment is missing: ${missing.join(", ")}.`);
  }

  return smoke;
}
