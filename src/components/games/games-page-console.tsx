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
  organizationId: string;
  organizationName: string;
  teamName: string;
  seasonLabel: string;
  seasonYear: number;
};

type Opponent = {
  id: string;
  organizationId: string;
  schoolName: string;
};

type Venue = {
  id: string;
  organizationId: string;
  name: string;
  city?: string | null;
  state?: string | null;
};

type SeasonOption = {
  id: string;
  teamId: string;
  teamName: string;
  organizationId: string;
  organizationName: string;
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
  const [seasonOptions, setSeasonOptions] = useState<SeasonOption[]>([]);
  const [opponentsByOrganization, setOpponentsByOrganization] = useState<Record<string, Opponent[]>>({});
  const [venuesByOrganization, setVenuesByOrganization] = useState<Record<string, Venue[]>>({});
  const [freshSeasonId, setFreshSeasonId] = useState("");
  const [freshOpponentId, setFreshOpponentId] = useState("");
  const [freshVenueId, setFreshVenueId] = useState("");
  const [freshHomeAway, setFreshHomeAway] = useState<"home" | "away">("home");
  const [freshSubmitting, setFreshSubmitting] = useState(false);
  const [freshError, setFreshError] = useState<string | null>(null);

  async function loadGamesBoard() {
    setStatusText("Loading games...");
    const previousSeasonId = freshSeasonId;
    const previousOpponentId = freshOpponentId;
    const previousVenueId = freshVenueId;

    try {
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
            organizationId: team.organizationId,
            organizationName: team.organizationName
          }));
        })
      );

      const seasons = seasonResponses.flat();
      const nextSeasonOptions = seasons.map((season) => ({
          id: season.id,
          teamId: season.teamId,
          teamName: season.teamName,
          organizationId: season.organizationId,
          organizationName: season.organizationName,
          seasonLabel: season.label,
          seasonYear: season.year
        }));
      setSeasonOptions(nextSeasonOptions);

      const uniqueOrganizationIds = Array.from(new Set(teams.map((team) => team.organizationId)));
      const [opponentResponses, venueResponses] = await Promise.all([
        Promise.all(
          uniqueOrganizationIds.map(async (organizationId) => ({
            organizationId,
            items: (await readJson<{ items: Opponent[] }>(`/api/v1/opponents?organizationId=${organizationId}`)).items
          }))
        ),
        Promise.all(
          uniqueOrganizationIds.map(async (organizationId) => ({
            organizationId,
            items: (await readJson<{ items: Venue[] }>(`/api/v1/venues?organizationId=${organizationId}`)).items
          }))
        )
      ]);

      const nextOpponentsByOrganization = Object.fromEntries(
        opponentResponses.map((response) => [response.organizationId, response.items])
      );
      const nextVenuesByOrganization = Object.fromEntries(
        venueResponses.map((response) => [response.organizationId, response.items])
      );
      setOpponentsByOrganization(nextOpponentsByOrganization);
      setVenuesByOrganization(nextVenuesByOrganization);
      const gameResponses = await Promise.all(
        seasons.map(async (season) => {
          const rows = await readJson<{ items: GameListItem[] }>(`/api/v1/games?seasonId=${season.id}`);
          return rows.items.map((item) => ({
            ...item,
            organizationId: season.organizationId,
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
      if (nextSeasonOptions.length === 0) {
        setFreshSeasonId("");
        setFreshOpponentId("");
        setFreshVenueId("");
        return;
      }

      const seasonStillExists = nextSeasonOptions.some((option) => option.id === previousSeasonId);
      const nextSeasonId = seasonStillExists ? previousSeasonId : nextSeasonOptions[0].id;
      setFreshSeasonId(nextSeasonId);

      const selectedSeasonOption = nextSeasonOptions.find((option) => option.id === nextSeasonId) ?? nextSeasonOptions[0];
      const nextOpponents = nextOpponentsByOrganization[selectedSeasonOption.organizationId] ?? [];
      const nextVenues = nextVenuesByOrganization[selectedSeasonOption.organizationId] ?? [];

      setFreshOpponentId(
        nextOpponents.some((item) => item.id === previousOpponentId)
          ? previousOpponentId
          : (nextOpponents[0]?.id ?? "")
      );
      setFreshVenueId(
        nextVenues.some((item) => item.id === previousVenueId)
          ? previousVenueId
          : (nextVenues[0]?.id ?? "")
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to load games.");
    }
  }

  useEffect(() => {
    void loadGamesBoard();
  }, []);

  useEffect(() => {
    if (!freshSeasonId && seasonOptions.length > 0) {
      setFreshSeasonId(seasonOptions[0].id);
    }
  }, [freshSeasonId, seasonOptions]);

  const selectedSeason = useMemo(
    () => seasonOptions.find((option) => option.id === freshSeasonId) ?? null,
    [freshSeasonId, seasonOptions]
  );
  const availableOpponents = selectedSeason ? opponentsByOrganization[selectedSeason.organizationId] ?? [] : [];
  const availableVenues = selectedSeason ? venuesByOrganization[selectedSeason.organizationId] ?? [] : [];

  useEffect(() => {
    function refreshOnReturn() {
      void loadGamesBoard();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadGamesBoard();
      }
    }

    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [freshOpponentId, freshSeasonId, freshVenueId]);

  useEffect(() => {
    if (availableOpponents.length === 0) {
      setFreshOpponentId("");
      return;
    }

    if (!availableOpponents.some((item) => item.id === freshOpponentId)) {
      setFreshOpponentId(availableOpponents[0].id);
    }
  }, [availableOpponents, freshOpponentId]);

  useEffect(() => {
    if (availableVenues.length === 0) {
      setFreshVenueId("");
      return;
    }

    if (freshVenueId && availableVenues.some((item) => item.id === freshVenueId)) {
      return;
    }

    setFreshVenueId(availableVenues[0].id);
  }, [availableVenues, freshVenueId]);

  async function createFreshLiveEntryGame() {
    if (!selectedSeason || !freshOpponentId) {
      setFreshError("Choose a season and opponent first.");
      return;
    }

    setFreshSubmitting(true);
    setFreshError(null);

    try {
      const kickoffAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const response = await readJson<{ item: { id: string } }>("/api/v1/games", {
        method: "POST",
        body: JSON.stringify({
          seasonId: selectedSeason.id,
          opponentId: freshOpponentId,
          venueId: freshVenueId || undefined,
          kickoffAt,
          homeAway: freshHomeAway,
          status: "in_progress"
        })
      });

      window.location.href = `/games/${response.item.id}/live`;
    } catch (error) {
      setFreshError(error instanceof Error ? error.message : "Unable to create a fresh game.");
    } finally {
      setFreshSubmitting(false);
    }
  }

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

        <section className="section-card pad-md stack-md fresh-live-entry-panel" id="fresh-live-entry">
          <div className="entry-header">
            <div>
              <h2 style={{ margin: 0 }}>Fresh Live Entry game</h2>
              <p className="kicker" style={{ margin: "6px 0 0" }}>
                Create a brand new in-progress game and jump straight into Live Entry without fighting a shared writer lease.
              </p>
            </div>
            <span className="chip">Best for preview testing</span>
          </div>
          <div className="form-grid fresh-live-entry-grid">
            <label className="field">
              <span>Season</span>
              <select value={freshSeasonId} onChange={(event) => setFreshSeasonId(event.target.value)}>
                {seasonOptions.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.seasonLabel} - {season.teamName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Opponent</span>
              <select value={freshOpponentId} onChange={(event) => setFreshOpponentId(event.target.value)}>
                {availableOpponents.map((opponent) => (
                  <option key={opponent.id} value={opponent.id}>
                    {opponent.schoolName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Venue</span>
              <select value={freshVenueId} onChange={(event) => setFreshVenueId(event.target.value)}>
                <option value="">Venue optional</option>
                {availableVenues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team side</span>
              <select value={freshHomeAway} onChange={(event) => setFreshHomeAway(event.target.value as "home" | "away")}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
          </div>
          {freshError ? <div className="error-note">{freshError}</div> : null}
          <div className="timeline-actions">
            <button className="button-primary" disabled={freshSubmitting || !selectedSeason || !freshOpponentId} type="button" onClick={() => void createFreshLiveEntryGame()}>
              {freshSubmitting ? "Creating game..." : "Create fresh live game"}
            </button>
            <span className="kicker">This uses the normal game API and sends you straight to `/live`.</span>
          </div>
        </section>

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
