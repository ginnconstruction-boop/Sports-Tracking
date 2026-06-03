import postgres from "postgres";
import { loadSmokeEnvironment } from "../tests/e2e/support/smoke-config";
import { resolveDatabaseConnectionConfig } from "../src/server/db/connection";

async function main() {
  loadSmokeEnvironment();
  const connection = resolveDatabaseConnectionConfig();

  console.log("=== DB probe ===");
  console.log(`Source: ${connection.source ?? "none"}`);
  console.log(`Host: ${connection.host ?? "n/a"}`);
  console.log(`Direct host: ${connection.directHost ?? "n/a"}`);

  if (!connection.connectionString) {
    throw new Error("DATABASE_URL or DATABASE_POOLER_URL is not configured.");
  }

  const sql = postgres(connection.connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1
  });

  try {
    const result = await sql`select current_database() as db, current_user as user`;
    console.log(`Result: PASS (${result[0]?.db ?? "unknown db"} as ${result[0]?.user ?? "unknown user"})`);
  } catch (error) {
    console.log("Result: FAIL");
    if (connection.poolerHint) {
      console.log(connection.poolerHint);
    }
    throw error;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

