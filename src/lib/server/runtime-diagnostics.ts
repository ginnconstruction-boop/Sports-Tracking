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

export function getRuntimeConnectionSummary() {
  return {
    databaseHost: safeUrlHost(process.env.DATABASE_URL),
    directUrlHost: safeUrlHost(process.env.DIRECT_URL),
    supabaseHost: safeUrlHost(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}
