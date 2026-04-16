import type { Route } from "next";

type LoginFormProps = {
  betaBlocked?: boolean;
  errorMessage?: string | null;
  infoMessage?: string | null;
};

const passwordLoginRoute = "/auth/login" as Route;
const magicLinkRoute = "/auth/magic-link" as Route;

export function LoginForm({ betaBlocked = false, errorMessage, infoMessage }: LoginFormProps) {
  return (
    <form action={passwordLoginRoute} method="post" className="section-card pad-lg stack-md" style={{ maxWidth: 460 }}>
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

      {errorMessage ? <p className="error-note">{errorMessage}</p> : null}
      {infoMessage ? (
        <p
          className="error-note"
          style={{ background: "rgba(46, 125, 87, 0.12)", color: "#1d5c3f" }}
        >
          {infoMessage}
        </p>
      ) : null}

      <label className="stack-sm">
        <span>Email</span>
        <input
          name="email"
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
          name="password"
          type="password"
          style={{
            minHeight: 48,
            borderRadius: 14,
            border: "1px solid rgba(24, 35, 30, 0.14)",
            padding: "0 14px",
            background: "white"
          }}
        />
      </label>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="button-primary" type="submit">
          Log in
        </button>
        <button
          className="button-secondary"
          formAction={magicLinkRoute}
          formMethod="post"
          type="submit"
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
