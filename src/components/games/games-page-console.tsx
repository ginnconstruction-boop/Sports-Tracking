"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type Team = {
  id: string;
  organizationId: string;
  name: string;
  level: string;
};

type Season = {
  id: string;
  teamId: string;
  label: string;
  year: number;
  isActive: boolean;
};

type GameListItem = {
  game: {
    id: string;
    seasonId: string;
    status: string;
    kickoffAt?: string | null;
    homeAway: "home" | "away";
    currentRevision: number;
  };
  opponentSchoolName: string;
  venueName?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
};

type GameRow = GameListItem & {
  organizationName: string;
  teamName: string;
  seasonLabel: string;
  seasonYear: number;
};

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }
  return body as T;
}

function groupTitle(game: GameRow) {
  return `${game.seasonLabel} - ${game.teamName}`;
}

function bucketForStatus(status: string) {
  if (status === "in_progress" || status === "ready") return "inProgress";
  if (status === "final" || status === "archived") return "final";
  return "upcoming";
}

function renderKickoff(value?: string | null) {
  if (!value) return "Kickoff TBD";
  return new Date(value).toLocaleString();
}

export function GamesPageConsole() {
  const [statusText, setStatusText] = useState("Loading games...");
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    void (async () => {
      const me = await readJson<{ memberships: Membership[] }>("/api/v1/me");

      const teamResponses = await Promise.all(
        me.memberships.map(async (membership) => {
          const teams = await readJson<{ items: Team[] }>(`/api/v1/teams?organizationId=${membership.organizationId}`);
          return teams.items.map((team) => ({
            ...team,
            organizationName: membership.organizationName
          }));
        })
      );

      const teams = teamResponses.flat();
      const seasonResponses = await Promise.all(
        teams.map(async (team) => {
          const seasons = await readJson<{ items: Season[] }>(`/api/v1/seasons?teamId=${team.id}`);
          return seasons.items.map((season) => ({
            ...season,
            teamName: team.name,
            organizationName: team.organizationName
          }));
        })
      );

      const seasons = seasonResponses.flat();
      const gameResponses = await Promise.all(
        seasons.map(async (season) => {
          const rows = await readJson<{ items: GameListItem[] }>(`/api/v1/games?seasonId=${season.id}`);
          return rows.items.map((item) => ({
            ...item,
            organizationName: season.organizationName,
            teamName: season.teamName,
            seasonLabel: season.label,
            seasonYear: season.year
          }));
        })
      );

      const nextGames = gameResponses
        .flat()
        .sort((left, right) => {
          const leftKickoff = left.game.kickoffAt ? new Date(left.game.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightKickoff = right.game.kickoffAt ? new Date(right.game.kickoffAt).getTime() : Number.MAX_SAFE_INTEGER;
          return leftKickoff - rightKickoff;
        });

      setGames(nextGames);
      setStatusText(nextGames.length > 0 ? "Games ready." : "No games scheduled yet.");
    })().catch((error) => setStatusText(error instanceof Error ? error.message : "Unable to load games."));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        organizationName: string;
        upcoming: GameRow[];
        inProgress: GameRow[];
        final: GameRow[];
      }
    >();

    for (const game of games) {
      const key = `${game.seasonLabel}-${game.teamName}`;
      if (!map.has(key)) {
        map.set(key, {
          title: groupTitle(game),
          organizationName: game.organizationName,
          upcoming: [],
          inProgress: [],
          final: []
        });
      }

      const group = map.get(key)!;
      group[bucketForStatus(game.game.status)].push(game);
    }

    return [...map.values()];
  }, [games]);

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Game schedule</h2>
            <p className="kicker">
              Open game admin from here, then move into Game Day or reports without hunting through setup screens.
            </p>
          </div>
          <span className="chip">{statusText}</span>
        </div>

        {grouped.length === 0 ? (
          <div className="section-card pad-md stack-sm" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
            <strong>No games yet.</strong>
            <p className="kicker" style={{ margin: 0 }}>
              Use onboarding to create your first opponent, venue, and scheduled game.
            </p>
            <div className="timeline-actions">
              <Link className="button-primary" href="/onboarding">
                Open onboarding
              </Link>
              <Link className="button-secondary-light" href="/setup">
                Open setup
              </Link>
            </div>
          </div>
        ) : null}

        {grouped.map((group) => (
          <section className="section-card pad-md stack-md" key={group.title} style={{ background: "rgba(255, 255, 255, 0.72)" }}>
            <div className="entry-header">
              <div>
                <h2 style={{ margin: 0 }}>{group.title}</h2>
                <p className="kicker">{group.organizationName}</p>
              </div>
            </div>

            {([
              ["In progress", group.inProgress],
              ["Upcoming", group.upcoming],
              ["Final", group.final]
            ] as const).map(([label, items]) =>
              items.length > 0 ? (
                <div className="stack-sm" key={label}>
                  <strong>{label}</strong>
                  <div className="table-like">
                    {items.map((item) => (
                      <div className="timeline-card" key={item.game.id}>
                        <div className="timeline-top">
                          <strong>
                            {item.game.homeAway === "home" ? "vs." : "at"} {item.opponentSchoolName}
                          </strong>
                          <span className="chip">{item.game.status.replace("_", " ")}</span>
                        </div>
                        <div className="stack-sm">
                          <div className="kicker">{renderKickoff(item.game.kickoffAt)}</div>
                          <div className="kicker">
                            {item.venueName ? [item.venueName, item.venueCity, item.venueState].filter(Boolean).join(", ") : "Venue TBD"}
                          </div>
                          <div className="timeline-actions">
                            <Link className="button-primary-small button-primary" href={`/games/${item.game.id}/manage`}>
                              Open game
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </section>
        ))}
      </section>
    </section>
  );
}
