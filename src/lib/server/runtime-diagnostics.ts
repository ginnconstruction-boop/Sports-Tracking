import { resolveDatabaseConnectionConfig } from "@/server/db/connection";

export function getRuntimeConnectionSummary() {
  const database = resolveDatabaseConnectionConfig();
  return {
    databaseHost: database.host,
    databaseSource: database.source,
    databaseUsesPooler: database.isPooler,
    databaseHint: database.poolerHint,
    directUrlHost: database.directHost,
    supabaseHost: (() => {
      const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!value) {
        return null;
      }

      try {
        return new URL(value).host;
      } catch {
        return null;
      }
    })(),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}
