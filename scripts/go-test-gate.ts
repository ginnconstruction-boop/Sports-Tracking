import { spawn } from "node:child_process";

type GateStep = {
  label: string;
  command: string;
  env?: Record<string, string>;
};

const steps: GateStep[] = [
  { label: "Typecheck", command: "npm run typecheck" },
  { label: "Unit tests", command: "npm run test" },
  { label: "Smoke (baseline seed)", command: "npm run smoke:test", env: { SMOKE_SEED_MODE: "baseline" } },
  { label: "Smoke (full seed)", command: "npm run smoke:test", env: { SMOKE_SEED_MODE: "full" } }
];

function runStep(step: GateStep) {
  return new Promise<number>((resolve) => {
    const child = spawn(step.command, {
      shell: true,
      stdio: "inherit",
      env: {
        ...process.env,
        ...(step.env ?? {})
      }
    });

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const startedAt = Date.now();
  const results: Array<{ label: string; code: number }> = [];

  console.log("=== Tracking App go-test gate ===");

  for (const step of steps) {
    console.log(`\n>>> ${step.label}`);
    const code = await runStep(step);
    results.push({ label: step.label, code });
    if (code !== 0) {
      break;
    }
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n=== Gate summary ===");
  for (const result of results) {
    console.log(`${result.code === 0 ? "PASS" : "FAIL"} - ${result.label}`);
  }
  console.log(`Elapsed: ${elapsedSeconds}s`);

  const failed = results.find((result) => result.code !== 0);
  if (failed) {
    console.log(`Gate failed at: ${failed.label}`);
    process.exit(1);
  }

  console.log("All go-test gates passed.");
}

void main();
