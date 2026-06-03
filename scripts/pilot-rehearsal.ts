import { spawn } from "node:child_process";
import { loadSmokeEnvironment, resolveSmokeConfig } from "../tests/e2e/support/smoke-config";

type Step = {
  label: string;
  command: string;
  env?: Record<string, string>;
};

type SmokeSeedResult = {
  mode: "baseline" | "full" | "reset" | "none";
  skipped?: boolean;
  email?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  teamId?: string;
  seasonId?: string;
  opponentId?: string;
  venueId?: string;
  gameId?: string;
};

function readArg(name: string) {
  const prefixed = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3);
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function runStep(step: Step) {
  return new Promise<number>((resolve) => {
    const started = Date.now();
    const child = spawn(step.command, {
      shell: true,
      stdio: "inherit",
      env: {
        ...process.env,
        ...(step.env ?? {})
      }
    });

    child.on("exit", (code) => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[pilot-rehearsal] ${step.label} finished in ${elapsed}s (code ${code ?? 1})`);
      resolve(code ?? 1);
    });
  });
}

function runAndCapture(command: string, env?: Record<string, string>) {
  return new Promise<{ code: number; stdout: string }>((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["inherit", "pipe", "inherit"],
      env: {
        ...process.env,
        ...(env ?? {})
      }
    });

    let stdout = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.on("exit", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

async function resolveRehearsalGameId(existingGameId?: string) {
  if (existingGameId) {
    return existingGameId;
  }

  console.log("\n>>> Seed rehearsal game");
  const seeded = await runAndCapture("tsx scripts/seed-smoke.ts --mode full");
  if (seeded.code !== 0) {
    throw new Error("Unable to seed a rehearsal game.");
  }

  const trimmed = seeded.stdout.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("Seed step did not return JSON output.");
  }

  const payload = JSON.parse(trimmed.slice(jsonStart)) as SmokeSeedResult;
  if (!payload.gameId) {
    throw new Error("Seed result did not include a gameId.");
  }

  return payload.gameId;
}

async function main() {
  loadSmokeEnvironment();
  const smoke = resolveSmokeConfig();
  const strictCloseout = hasFlag("strict-closeout");
  const seededGameId = await resolveRehearsalGameId(readArg("gameId"));
  const steps: Step[] = [
    { label: "Typecheck", command: "npm run typecheck" },
    { label: "Unit tests", command: "npm run test" },
    ...(strictCloseout ? [{ label: "DB probe", command: "npm run db:probe" }] : []),
    {
      label: "Smoke on rehearsal game",
      command: "npm run smoke:test",
      env: {
        SMOKE_SEED_MODE: "none",
        SMOKE_GAME_ID: seededGameId,
        ...(strictCloseout ? { SMOKE_REQUIRE_CLOSEOUT_READY: "true" } : {})
      }
    },
    ...(strictCloseout
      ? [{ label: "Postgame closeout gate", command: `npm run closeout:gate -- --gameId=${seededGameId}` }]
      : [])
  ];

  console.log("=== Pilot rehearsal ===");
  console.log(
    strictCloseout
      ? "Covers: one seeded rehearsal game -> live path -> report/export handoff -> postgame closeout."
      : "Covers: one seeded rehearsal game -> live path -> report/export handoff on the current smoke target."
  );
  console.log(`Rehearsal game: ${seededGameId}`);
  console.log(`Smoke target: ${smoke.target} (${smoke.baseUrl})`);
  if (!strictCloseout) {
    console.log("Tip: pass --strict-closeout to require final status plus completed exports on the same rehearsal game.");
  }

  const summary: Array<{ label: string; pass: boolean }> = [];
  for (const step of steps) {
    console.log(`\n>>> ${step.label}`);
    const code = await runStep(step);
    const pass = code === 0;
    summary.push({ label: step.label, pass });
    if (!pass) break;
  }

  console.log("\n=== Rehearsal summary ===");
  for (const row of summary) {
    console.log(`${row.pass ? "PASS" : "FAIL"} - ${row.label}`);
  }

  if (summary.some((row) => !row.pass)) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
