"use client";

import { useEffect, useMemo, useState } from "react";
import type { SeasonAnalyticsDocument } from "@/lib/domain/analytics";

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
  isActive: boolean;
};

type Props = {
  memberships: Membership[];
};

async function readJson<T>(input: RequestInfo) {
  const response = await fetch(input);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.error ?? "Request failed.");
  }
  return body as T;
}

export function AnalyticsConsole({ memberships }: Props) {
  const [organizationId, setOrganizationId] = useState(memberships[0]?.organizationId ?? "");
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teamId, setTeamId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [analytics, setAnalytics] = useState<SeasonAnalyticsDocument | null>(null);
  const [status, setStatus] = useState("Select a season to see trend and situational analytics.");

  const selectedSeason = useMemo(
    () => seasons.find((item) => item.id === seasonId) ?? null,
    [seasonId, seasons]
  );

  useEffect(() => {
    if (!organizationId) return;
    void readJson<{ items: Team[] }>(`/api/v1/teams?organizationId=${organizationId}`)
      .then((response) => {
        setTeams(response.items);
        setTeamId(response.items[0]?.id ?? "");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load teams."));
  }, [organizationId]);

  useEffect(() => {
    if (!teamId) return;
    void readJson<{ items: Season[] }>(`/api/v1/seasons?teamId=${teamId}`)
      .then((response) => {
        setSeasons(response.items);
        const active = response.items.find((item) => item.isActive) ?? response.items[0];
        setSeasonId(active?.id ?? "");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load seasons."));
  }, [teamId]);

  useEffect(() => {
    if (!seasonId) return;
    setStatus("Building season analytics from derived game reports...");
    void readJson<{ item: SeasonAnalyticsDocument }>(`/api/v1/seasons/${seasonId}/analytics`)
      .then((response) => {
        setAnalytics(response.item);
        setStatus("Analytics ready.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to build analytics."));
  }, [seasonId]);

  const summaryCards = analytics
    ? [
        `${analytics.summary.wins}-${analytics.summary.losses}-${analytics.summary.ties}`,
        `${analytics.summary.pointsFor} PF`,
        `${analytics.summary.pointsAgainst} PA`,
        `${analytics.summary.totalPlays} plays`,
        `${analytics.summary.totalDrives} drives`
      ]
    : [];

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Season analytics</h2>
            <p className="kicker">
              Trend lines, opponent history, and situational football all stay derived from the game play log and canonical reports.
            </p>
          </div>
          <span className="chip">{status}</span>
        </div>
        <div className="form-grid">
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
            <span>Team</span>
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} {team.level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Season</span>
            <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label} ({season.year})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {analytics ? (
        <>
          <section className="three-column">
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Season summary</h3>
              <div className="pill-row">
                {summaryCards.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Situational</h3>
              <div className="pill-row">
                <span className="chip">3rd down {analytics.situational.thirdDownConversions}/{analytics.situational.thirdDownAttempts} ({analytics.situational.thirdDownRate}%)</span>
                <span className="chip">4th down {analytics.situational.fourthDownConversions}/{analytics.situational.fourthDownAttempts} ({analytics.situational.fourthDownRate}%)</span>
                <span className="chip">Red zone {analytics.situational.redZoneScores}/{analytics.situational.redZoneTrips} ({analytics.situational.redZoneRate}%)</span>
                <span className="chip">Goal-to-go {analytics.situational.goalToGoScores}/{analytics.situational.goalToGoTrips} ({analytics.situational.goalToGoRate}%)</span>
                <span className="chip">Explosive {analytics.situational.explosivePlays}</span>
              </div>
            </div>
            <div className="section-card pad-lg stack-sm">
              <h3 style={{ margin: 0 }}>Field + takeaway profile</h3>
              <div className="pill-row">
                <span className="chip">Committed {analytics.situational.turnoversCommitted}</span>
                <span className="chip">Forced {analytics.situational.turnoversForced}</span>
                <span className="chip">Stops {analytics.situational.defensiveStops}</span>
                <span className="chip">Avg start {analytics.situational.averageStartingYardLine}</span>
                <span className="chip">Avg drive {analytics.situational.averageDriveYards} yds</span>
                <span className="chip">ST return yds {analytics.situational.specialTeamsReturnYards}</span>
              </div>
            </div>
          </section>

          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Performance flags</h2>
              <span className="chip">{analytics.seasonLabel}</span>
            </div>
            <div className="report-grid">
              {[
                analytics.performance.bestScoringGame,
                analytics.performance.bestDefensiveGame,
                analytics.performance.bestDriveEfficiencyGame,
                analytics.performance.cleanestGame
              ].map((item) =>
                item ? (
                  <div className="report-card stack-sm" key={`${item.label}-${item.gameId}`}>
                    <strong>{item.label}</strong>
                    <div className="timeline-meta">
                      <span>{item.opponentLabel}</span>
                      <span className="mono">{item.value}</span>
                    </div>
                    <div className="kicker">{item.detail}</div>
                  </div>
                ) : null
              )}
            </div>
          </section>

          <section className="two-column">
            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Trend line</h2>
                <span className="chip">{selectedSeason?.label ?? analytics.seasonLabel}</span>
              </div>
              <div className="table-like">
                {analytics.trends.map((point) => (
                  <div className="timeline-card" key={point.gameId}>
                    <div className="timeline-top">
                      <strong>{point.label}</strong>
                      <span className="mono">
                        {point.pointsAgainst}-{point.pointsFor}
                      </span>
                    </div>
                    <div className="pill-row">
                      <span className="chip">Turnover margin {point.turnoverMargin}</span>
                      <span className="chip">Explosive {point.explosivePlays}</span>
                      <span className="chip">3rd down conv. {point.thirdDownConversions}</span>
                      <span className="chip">Red zone trips {point.redZoneTrips}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="section-card pad-lg stack-md">
              <div className="entry-header">
                <h2 style={{ margin: 0 }}>Opponent history</h2>
                <span className="chip">{analytics.opponentHistory.length} opponents</span>
              </div>
              <div className="table-like">
                {analytics.opponentHistory.map((item) => (
                  <div className="timeline-card" key={item.opponentId}>
                    <div className="timeline-top">
                      <strong>{item.opponentLabel}</strong>
                      <span className="mono">{item.gamesPlayed} games</span>
                    </div>
                    <div className="pill-row">
                      <span className="chip">{item.wins}-{item.losses}</span>
                      <span className="chip">{item.pointsFor} PF</span>
                      <span className="chip">{item.pointsAgainst} PA</span>
                      <span className="chip">Avg PF {item.averagePointsFor}</span>
                      <span className="chip">Avg PA {item.averagePointsAgainst}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Opponent comparison</h2>
              <span className="chip">{analytics.opponentBreakdowns.length} opponents</span>
            </div>
            <div className="table-like">
              {analytics.opponentBreakdowns.map((item) => (
                <div className="timeline-card" key={`compare-${item.opponentId}`}>
                  <div className="timeline-top">
                    <strong>{item.opponentLabel}</strong>
                    <span className="mono">{item.gamesPlayed} games</span>
                  </div>
                  <div className="pill-row">
                    <span className="chip">Avg margin {item.averageMargin}</span>
                    <span className="chip">TO margin {item.averageTurnoverMargin}</span>
                    <span className="chip">Explosive {item.averageExplosivePlays}</span>
                    <span className="chip">3rd down {item.thirdDownRate}%</span>
                    <span className="chip">Red zone {item.redZoneRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Player leaders</h2>
              <span className="chip">{analytics.playerLeaders.length} buckets</span>
            </div>
            <div className="report-grid">
              {analytics.playerLeaders.map((bucket) => (
                <div className="report-card stack-sm" key={bucket.stat}>
                  <strong>{bucket.title}</strong>
                  {bucket.leaders.length === 0 ? <div className="kicker">No qualifying production yet.</div> : null}
                  {bucket.leaders.map((leader) => (
                    <div className="timeline-meta" key={`${bucket.stat}-${leader.playerKey}`}>
                      <span>{leader.label}</span>
                      <span className="mono">{leader.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="section-card pad-lg stack-md">
            <div className="entry-header">
              <h2 style={{ margin: 0 }}>Player trends</h2>
              <span className="chip">{analytics.playerTrends.length} tracked trend sets</span>
            </div>
            <div className="report-grid">
              {analytics.playerTrends.map((trend) => (
                <div className="report-card stack-sm" key={trend.stat}>
                  <strong>{trend.title}</strong>
                  {trend.players.length === 0 ? <div className="kicker">No qualifying production yet.</div> : null}
                  {trend.players.map((player) => (
                    <div className="stack-sm" key={`${trend.stat}-${player.playerKey}`}>
                      <div className="timeline-top">
                        <span>{player.label}</span>
                        <span className="mono">
                          {player.points.reduce((sum, point) => sum + point.value, 0)}
                        </span>
                      </div>
                      <div className="pill-row">
                        {player.points.map((point) => (
                          <span className="chip" key={`${player.playerKey}-${point.gameId}`}>
                            {point.label}: {point.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
