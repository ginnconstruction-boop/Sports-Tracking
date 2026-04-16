import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(request: Request, params: Record<string, string>) {
  const url = new URL("/login", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function getRedirectOrigin(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return redirectWithMessage(request, {
      error: "Enter your invited email before requesting a magic link."
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getRedirectOrigin(request)}/auth/callback`,
      shouldCreateUser: false
    }
  });

  if (error) {
    return redirectWithMessage(request, {
      error: error.message
    });
  }

  return redirectWithMessage(request, {
    message: "Magic link sent. Check your email."
  });
}
