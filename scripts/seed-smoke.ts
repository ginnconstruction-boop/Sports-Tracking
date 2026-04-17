import { seedSmokeEnvironment } from "../tests/e2e/support/smoke-seed";

function parseMode(argv: string[]) {
  const modeFlag = argv.find((value) => value.startsWith("--mode="));
  if (modeFlag) {
    return modeFlag.slice("--mode=".length);
  }

  const modeIndex = argv.findIndex((value) => value === "--mode");
  if (modeIndex >= 0) {
    return argv[modeIndex + 1];
  }

  return "baseline";
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const normalizedMode = mode === "full" || mode === "reset" ? mode : "baseline";
  const result = await seedSmokeEnvironment(normalizedMode);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
