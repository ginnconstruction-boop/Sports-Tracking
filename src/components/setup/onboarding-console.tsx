"use client";

import { useEffect, useMemo, useState } from "react";
import { gameStatusValues } from "@/lib/contracts/admin";
import { RosterImportPanel } from "@/components/setup/roster-import-panel";

type Membership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type Team = {
  id: string;
  name: string;
  level: string;
};

type Season = {
  id: string;
  label: string;
  year: number;
};

type Opponent = {
  id: string;
  schoolName: string;
};

type Venue = {
  id: string;
  name: string;
};

type Game = {
  id: string;
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

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function OnboardingConsole() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [team, setTeam] = useState<Team | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [statusText, setStatusText] = useState("Loading onboarding...");
  const [isBusy, setIsBusy] = useState(false);

  const [teamForm, setTeamForm] = useState({ name: "", level: "Varsity" });
  const [seasonForm, setSeasonForm] = useState({ label: `${new Date().getFullYear()} Season`, year: String(new Date().getFullYear()) });
  const [opponentForm, setOpponentForm] = useState({ schoolName: "", mascot: "", shortCode: "" });
  const [venueForm, setVenueForm] = useState({ name: "", city: "", state: "" });
  const [gameForm, setGameForm] = useState({
    kickoffAt: "",
    arrivalAt: "",
    reportAt: "",
    homeAway: "home" as "home" | "away",
    status: "ready" as (typeof gameStatusValues)[number]
  });

  useEffect(() => {
    void readJson<{ memberships: Membership[] }>("/api/v1/me")
      .then((body) => {
        setMemberships(body.memberships);
        setOrganizationId(body.memberships[0]?.organizationId ?? "");
        setStatusText("Follow the steps below to get your first game ready.");
      })
      .catch((error) => setStatusText(error instanceof Error ? error.message : "Unable to load onboarding."));
  }, []);

  const checklist = useMemo(
    () => [
      { label: "Choose organization", complete: Boolean(organizationId) },
      { label: "Create team", complete: Boolean(team) },
      { label: "Create season", complete: Boolean(season) },
      { label: "Import roster", complete: Boolean(season) },
      { label: "Add opponent", complete: Boolean(opponent) },
      { label: "Add venue", complete: Boolean(venue) },
      { label: "Schedule first game", complete: Boolean(game) }
    ],
    [game, opponent, organizationId, season, team, venue]
  );

  async function createTeam() {
    if (!organizationId) return;
    setIsBusy(true);
    setStatusText("Creating team...");
    try {
      const result = await readJson<{ item: Team }>("/api/v1/teams", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          ...teamForm
        })
      });
      setTeam(result.item);
      setStatusText("Team created.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to create team.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createSeason() {
    if (!team) return;
    setIsBusy(true);
    setStatusText("Creating season...");
    try {
      const result = await readJson<{ item: Season }>("/api/v1/seasons", {
        method: "POST",
        body: JSON.stringify({
          teamId: team.id,
          label: seasonForm.label,
          year: Number(seasonForm.year),
          isActive: true
        })
      });
      setSeason(result.item);
      setStatusText("Season created.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to create season.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createOpponent() {
    if (!organizationId) return;
    setIsBusy(true);
    setStatusText("Creating opponent...");
    try {
      const result = await readJson<{ item: Opponent }>("/api/v1/opponents", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          ...opponentForm
        })
      });
      setOpponent(result.item);
      setStatusText("Opponent added.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to create opponent.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createVenue() {
    if (!organizationId) return;
    setIsBusy(true);
    setStatusText("Creating venue...");
    try {
      const result = await readJson<{ item: Venue }>("/api/v1/venues", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          name: venueForm.name,
          city: venueForm.city || undefined,
          state: venueForm.state || undefined
        })
      });
      setVenue(result.item);
      setStatusText("Venue added.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to create venue.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createGame() {
    if (!season || !opponent) return;
    setIsBusy(true);
    setStatusText("Scheduling first game...");
    try {
      const result = await readJson<{ item: Game }>("/api/v1/games", {
        method: "POST",
        body: JSON.stringify({
          seasonId: season.id,
          opponentId: opponent.id,
          venueId: venue?.id || undefined,
          kickoffAt: gameForm.kickoffAt ? new Date(gameForm.kickoffAt).toISOString() : undefined,
          arrivalAt: gameForm.arrivalAt ? new Date(gameForm.arrivalAt).toISOString() : undefined,
          reportAt: gameForm.reportAt ? new Date(gameForm.reportAt).toISOString() : undefined,
          homeAway: gameForm.homeAway,
          status: gameForm.status
        })
      });
      setGame(result.item);
      setStatusText("First game scheduled.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Unable to schedule first game.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
              Guided onboarding
            </span>
            <h2 style={{ margin: "8px 0 0" }}>Get a team from zero to first kickoff.</h2>
            <p className="kicker">
              This flow creates the basic setup records in order, then drops you into a schedule that can immediately
              open Game Day Mode and reports.
            </p>
          </div>
          <span className="chip">{statusText}</span>
        </div>

        <div className="pill-row">
          {checklist.map((item) => (
            <span className="chip" key={item.label}>
              {item.complete ? "Done" : "Open"} · {item.label}
            </span>
          ))}
        </div>
      </section>

      <section className="three-column">
        <div className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>1. Organization and team</h2>
          <label className="field">
            <span>Organization</span>
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              {memberships.map((membership) => (
                <option key={membership.organizationId} value={membership.organizationId}>
                  {membership.organizationName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Team name</span>
            <input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>Level</span>
            <input value={teamForm.level} onChange={(event) => setTeamForm((current) => ({ ...current, level: event.target.value }))} />
          </label>
          <button className="button-primary" disabled={isBusy || !organizationId || !teamForm.name.trim()} type="button" onClick={() => void createTeam()}>
            Create team
          </button>
          {team ? <div className="chip">Created: {team.name} {team.level}</div> : null}
        </div>

        <div className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>2. Season</h2>
          <label className="field">
            <span>Season label</span>
            <input value={seasonForm.label} onChange={(event) => setSeasonForm((current) => ({ ...current, label: event.target.value }))} />
          </label>
          <label className="field">
            <span>Year</span>
            <input value={seasonForm.year} onChange={(event) => setSeasonForm((current) => ({ ...current, year: event.target.value }))} />
          </label>
          <button className="button-primary" disabled={isBusy || !team || !seasonForm.label.trim()} type="button" onClick={() => void createSeason()}>
            Create season
          </button>
          {season ? <div className="chip">Created: {season.label}</div> : null}
        </div>

        <div className="section-card pad-lg stack-md">
          <h2 style={{ margin: 0 }}>3. Opponent and venue</h2>
          <label className="field">
            <span>Opponent</span>
            <input value={opponentForm.schoolName} onChange={(event) => setOpponentForm((current) => ({ ...current, schoolName: event.target.value }))} />
          </label>
          <label className="field">
            <span>Venue</span>
            <input value={venueForm.name} onChange={(event) => setVenueForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>Venue city</span>
            <input value={venueForm.city} onChange={(event) => setVenueForm((current) => ({ ...current, city: event.target.value }))} />
          </label>
          <div className="timeline-actions">
            <button className="mini-button" disabled={isBusy || !opponentForm.schoolName.trim()} type="button" onClick={() => void createOpponent()}>
              Save opponent
            </button>
            <button className="mini-button" disabled={isBusy || !venueForm.name.trim()} type="button" onClick={() => void createVenue()}>
              Save venue
            </button>
          </div>
          <div className="pill-row">
            {opponent ? <span className="chip">{opponent.schoolName}</span> : null}
            {venue ? <span className="chip">{venue.name}</span> : null}
          </div>
        </div>
      </section>

      <section className="section-card pad-lg stack-md">
        <RosterImportPanel
          organizationId={organizationId}
          seasonId={season?.id ?? ""}
          targetLabel={season ? `${season.label} roster` : undefined}
          onImported={() => setStatusText("Roster imported. Move on to scheduling the first game.")}
        />
      </section>

      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <h2 style={{ margin: 0 }}>4. Schedule first game</h2>
          {game ? (
            <div className="timeline-actions">
              <a className="mini-button" href={`/games/${game.id}/manage`}>
                Open game admin
              </a>
              <a className="mini-button" href={`/games/${game.id}/gameday`}>
                Open Game Day
              </a>
            </div>
          ) : null}
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Kickoff</span>
            <input type="datetime-local" value={gameForm.kickoffAt} onChange={(event) => setGameForm((current) => ({ ...current, kickoffAt: event.target.value }))} />
          </label>
          <label className="field">
            <span>Arrival</span>
            <input type="datetime-local" value={gameForm.arrivalAt} onChange={(event) => setGameForm((current) => ({ ...current, arrivalAt: event.target.value }))} />
          </label>
          <label className="field">
            <span>Report time</span>
            <input type="datetime-local" value={gameForm.reportAt} onChange={(event) => setGameForm((current) => ({ ...current, reportAt: event.target.value }))} />
          </label>
          <label className="field">
            <span>Side</span>
            <select value={gameForm.homeAway} onChange={(event) => setGameForm((current) => ({ ...current, homeAway: event.target.value as "home" | "away" }))}>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={gameForm.status} onChange={(event) => setGameForm((current) => ({ ...current, status: event.target.value as (typeof gameStatusValues)[number] }))}>
              {gameStatusValues.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="button-primary" disabled={isBusy || !season || !opponent} type="button" onClick={() => void createGame()}>
          Schedule first game
        </button>
        {gameForm.kickoffAt ? <div className="chip">Kickoff {toDateTimeLocalValue(gameForm.kickoffAt)}</div> : null}
      </section>
    </section>
  );
}
