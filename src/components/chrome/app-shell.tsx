import Link from "next/link";
import type { Route } from "next";
import { isFeatureEnabled } from "@/lib/features/runtime";

type AppShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  current?: "home" | "games" | "onboarding" | "setup" | "analytics" | "admin" | "gameday" | "live" | "reports" | "manage" | "review";
  gameId?: string;
};

export function AppShell({ title, subtitle, children, current, gameId }: AppShellProps) {
  const showAnalytics = isFeatureEnabled("advanced_analytics");
  const showAdmin = isFeatureEnabled("internal_debug_tools");
  const showGameDay = isFeatureEnabled("game_day_mode");
  const showReports = isFeatureEnabled("reports_preview");
  const showReview = isFeatureEnabled("internal_debug_tools");
  const nav = [
    { href: "/", label: "Operations", key: "home" },
    { href: "/games", label: "Games", key: "games" },
    { href: "/onboarding", label: "Onboarding", key: "onboarding" },
    { href: "/setup", label: "Setup", key: "setup" },
    ...(showAnalytics ? [{ href: "/analytics", label: "Analytics", key: "analytics" as const }] : []),
    ...(showAdmin ? [{ href: "/admin", label: "Admin", key: "admin" as const }] : []),
    ...(gameId ? [{ href: `/games/${gameId}/manage`, label: "Game Admin", key: "manage" as const }] : []),
    ...(gameId && showGameDay
      ? [
          { href: `/games/${gameId}/gameday`, label: "Overview", key: "gameday" as const },
          { href: `/games/${gameId}/live`, label: "Enter Live Mode", key: "live" as const }
        ]
      : []),
    ...(gameId && showReports
      ? [{ href: `/games/${gameId}/reports`, label: "Reports", key: "reports" as const }]
      : []),
    ...(gameId && showReview ? [{ href: `/games/${gameId}/review`, label: "Review", key: "review" as const }] : [])
  ] as const;

  return (
    <div className="page-shell stack-lg">
      <section className="poster-panel app-hero">
        <div className="app-hero-shell">
          <div className="app-hero-copy stack-md">
            <span className="eyebrow">Tracking the Game</span>
            <div className="stack-sm">
              <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 4.4rem)", lineHeight: 0.95 }}>
                {title}
              </h1>
              <p className="kicker" style={{ color: "rgba(248, 243, 232, 0.82)" }}>
                {subtitle}
              </p>
            </div>
          </div>
          <nav className="app-nav" aria-label="Primary navigation">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className={item.key === current ? "button-primary app-nav-link" : "button-secondary app-nav-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      {children}
    </div>
  );
}
