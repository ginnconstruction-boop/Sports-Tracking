import { spawn } from "node:child_process";

type Step = {
  label: string;
  command: string;
  env?: Record<string, string>;
};

function readArg(name: string) {
  const prefixed = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3);
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

async function main() {
  const gameId = readArg("gameId");
  const steps: Step[] = [
    { label: "Go-test gate", command: "npm run go-test" },
    ...(gameId
      ? [{ label: "Postgame closeout gate", command: `npm run closeout:gate -- --gameId=${gameId}` }]
      : [])
  ];

  console.log("=== Pilot rehearsal ===");
  console.log("Covers: seed -> live path -> correction/export checks via smoke + go-test.");
  if (!gameId) {
    console.log("Tip: pass --gameId=<id> to also run closeout gate on a specific game.");
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
