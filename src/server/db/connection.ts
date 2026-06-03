export type DatabaseUrlSource = "DATABASE_POOLER_URL" | "SUPABASE_DB_POOLER_URL" | "DATABASE_URL";

export type DatabaseConnectionConfig = {
  connectionString: string | null;
  source: DatabaseUrlSource | null;
  host: string | null;
  directHost: string | null;
  isPooler: boolean;
  isDirectSupabase: boolean;
  poolerHint: string | null;
};

function safeUrlHost(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    const match = value.match(/@([^:/?#]+)(?::\d+)?/);
    return match?.[1] ?? null;
  }
}

function deriveSupabasePoolerHint(host: string | null) {
  if (!host) {
    return null;
  }

  const projectRefMatch = host.match(/^db\.([^.]+)\.supabase\.co(?::\d+)?$/i);
  if (!projectRefMatch) {
    return null;
  }

  const ref = projectRefMatch[1];
  return `Set DATABASE_POOLER_URL to your Supavisor session-mode connection string (username usually postgres.${ref}) and keep DIRECT_URL on the direct db host for migrations.`;
}

export function resolveDatabaseConnectionConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConnectionConfig {
  const poolerUrl = env.DATABASE_POOLER_URL?.trim() || env.SUPABASE_DB_POOLER_URL?.trim() || null;
  const directUrl = env.DATABASE_URL?.trim() || null;

  const connectionString = poolerUrl ?? directUrl;
  const source: DatabaseUrlSource | null = poolerUrl
    ? env.DATABASE_POOLER_URL?.trim()
      ? "DATABASE_POOLER_URL"
      : "SUPABASE_DB_POOLER_URL"
    : directUrl
      ? "DATABASE_URL"
      : null;
  const host = safeUrlHost(connectionString);
  const directHost = safeUrlHost(directUrl);

  return {
    connectionString,
    source,
    host,
    directHost,
    isPooler: Boolean(host && /pooler\.supabase\.com(?::\d+)?$/i.test(host)),
    isDirectSupabase: Boolean(host && /^db\.[^.]+\.supabase\.co(?::\d+)?$/i.test(host)),
    poolerHint: deriveSupabasePoolerHint(directHost ?? host)
  };
}

