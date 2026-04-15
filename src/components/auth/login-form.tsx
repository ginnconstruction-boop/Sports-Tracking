"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  betaBlocked?: boolean;
};

export function LoginForm({ betaBlocked = false }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handlePasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  async function handleMagicLink() {
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false
      }
    });

    setMessage(error ? error.message : "Magic link sent. Check your email.");
  }

  return (
    <form onSubmit={handlePasswordLogin} className="section-card pad-lg stack-md" style={{ maxWidth: 460 }}>
      <div className="stack-sm">
        <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
          Supabase Auth
        </span>
        <h1 style={{ margin: 0 }}>Log in to Tracking the Game</h1>
        <p className="kicker">
          Private beta access is invite-only. Use an approved staff email and password, or request a magic link as a fallback.
        </p>
      </div>

      {betaBlocked ? (
        <p className="error-note">
          This email is not approved for the private beta. Ask an admin to add it to the beta allowlist before trying again.
        </p>
      ) : null}

      <label className="stack-sm">
        <span>Email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          style={{
            minHeight: 48,
            borderRadius: 14,
            border: "1px solid rgba(24, 35, 30, 0.14)",
            padding: "0 14px",
            background: "white"
          }}
        />
      </label>

      <label className="stack-sm">
        <span>Password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          style={{
            minHeight: 48,
            borderRadius: 14,
            border: "1px solid rgba(24, 35, 30, 0.14)",
            padding: "0 14px",
            background: "white"
          }}
        />
      </label>

      {message ? <p className="kicker">{message}</p> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="button-primary" disabled={isPending} type="submit">
          {isPending ? "Logging in..." : "Log in"}
        </button>
        <button
          className="button-secondary"
          onClick={handleMagicLink}
          type="button"
          style={{
            color: "var(--text)",
            borderColor: "rgba(24, 35, 30, 0.18)",
            background: "rgba(24, 35, 30, 0.04)"
          }}
        >
          Send magic link
        </button>
      </div>
    </form>
  );
}
