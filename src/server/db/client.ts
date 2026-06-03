import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { resolveDatabaseConnectionConfig } from "@/server/db/connection";

let client: ReturnType<typeof postgres> | null = null;
let cachedConnectionString: string | null = null;

export function getDb() {
  const connection = resolveDatabaseConnectionConfig();
  if (!connection.connectionString) {
    throw new Error("DATABASE_URL or DATABASE_POOLER_URL is not configured.");
  }

  if (!client || cachedConnectionString !== connection.connectionString) {
    client = postgres(connection.connectionString, {
      prepare: false,
      max: 10
    });
    cachedConnectionString = connection.connectionString;
  }

  return drizzle(client, { schema });
}
