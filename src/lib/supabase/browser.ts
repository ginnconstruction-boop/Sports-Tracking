"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const supabaseEnv = getSupabaseEnv();
  return createBrowserClient(supabaseEnv.url, supabaseEnv.publishableKey);
}
