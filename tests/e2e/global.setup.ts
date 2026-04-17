import type { FullConfig } from "@playwright/test";
import { seedSmokeEnvironment } from "./support/smoke-seed";

export default async function globalSetup(_config: FullConfig) {
  const mode =
    process.env.SMOKE_SEED_MODE === "full"
      ? "full"
      : process.env.SMOKE_SEED_MODE === "reset"
        ? "reset"
        : "baseline";

  const result = await seedSmokeEnvironment(mode);
  console.log(
    `[smoke-seed] mode=${result.mode} email=${result.email} organization=${result.organization.name} orgId=${result.organization.id}`
  );
}
