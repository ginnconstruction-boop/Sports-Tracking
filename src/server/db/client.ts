import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

const connectionString = process.env.DATABASE_URL;
let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!client) {
    client = postgres(connectionString, {
      prepare: false,
      max: 10
    });
  }

  return drizzle(client, { schema });
}
