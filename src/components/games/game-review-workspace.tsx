"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayReviewPanel } from "@/components/game-day/play-review-panel";
import type { GameAdminRecord } from "@/lib/domain/game-admin";
import type { GameDaySnapshot } from "@/lib/domain/game-day";
import { formatClock } from "@/lib/engine/clock";

type Props = {
  gameId: string;
  initialSnapshot: GameDaySnapshot;
  record: GameAdminRecord;
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
    throw new Error(body.error?.message ?? body.error ?? "Request failed.");
  }
  return body as T;
}

export function GameReviewWorkspace({ gameId, initialSnapshot, record }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedPlayId, setSelectedPlayId] = useState(initialSnapshot.fullPlayLog[0]?.playId ?? null);
  const [search, setSearch] = useState("");
  const [quarter, setQuarter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [status, setStatus] = useState("Filter by tag, quarter, or search to build postgame review queues.");

  const reviewByPlayId = useMemo(
    () => new Map(snapshot.playReviews.map((item) => [item.playId, item])),
    [snapshot.playReviews]
  );

  const availableTags = useMemo(
    () =>
      [...new Set(snapshot.playReviews.flatMap((review) => review.tags))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [snapshot.playReviews]
  );

  const filteredPlays = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    return snapshot.fullPlayLog.filter((play) => {
      const review = reviewByPlayId.get(play.playId);
      if (quarter !== "all" && String(play.quarter) !== quarter) {
        return false;
      }
      if (tagFilter !== "all" && !(review?.tags ?? []).includes(tagFilter)) {
        return false;
      }
      if (!lowerSearch) {
        return true;
      }

      return (
        play.summary.toLowerCase().includes(lowerSearch) ||
        (review?.note ?? "").toLowerCase().includes(lowerSearch) ||
        (review?.tags ?? []).some((tag) => tag.toLowerCase().includes(lowerSearch))
      );
    });
  }, [quarter, reviewByPlayId, search, snapshot.fullPlayLog, tagFilter]);

  const selectedPlay = filteredPlays.find((play) => play.playId === selectedPlayId) ?? filteredPlays[0] ?? null;

  async function saveReview(payload: {
    playId: string;
    tags: string[];
    note?: string;
    filmUrl?: string;
  }) {
    setStatus("Saving review...");
    const response = await readJson<{ item: GameDaySnapshot["playReviews"][number] }>(
      `/api/v1/games/${gameId}/plays/${payload.playId}/review`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );

    setSnapshot((current) => ({
      ...current,
      playReviews: [...current.playReviews.filter((item) => item.playId !== payload.playId), response.item]
    }));
    setStatus("Review saved.");
  }

  async function deleteReview(playId: string) {
    setStatus("Clearing review...");
    await readJson<{ item: { success: true } }>(`/api/v1/games/${gameId}/plays/${playId}/review`, {
      method: "DELETE"
    });
    setSnapshot((current) => ({
      ...current,
      playReviews: current.playReviews.filter((item) => item.playId !== playId)
    }));
    setStatus("Review cleared.");
  }

  return (
    <section className="section-grid">
      <section className="section-card pad-lg stack-md">
        <div className="entry-header">
          <div>
            <h2 style={{ margin: 0 }}>Review workspace</h2>
            <p className="kicker">
              {record.sideLabels.away} at {record.sideLabels.home}. Build film and coaching queues from the same play-log timeline used for live stats and reports.
            </p>
          </div>
          <span className="chip">{status}</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="turnover, explosive, missed tackle" />
          </label>
          <label className="field">
            <span>Quarter</span>
            <select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
              <option value="all">All quarters</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={String(value)}>
                  Quarter {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tag</span>
            <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
              <option value="all">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pill-row">
          <span className="chip">{filteredPlays.length} filtered plays</span>
          <span className="chip">{snapshot.playReviews.length} reviewed plays</span>
          <span className="chip">{snapshot.turnoverTracker.length} turnovers</span>
          <span className="chip">{snapshot.penaltyTracker.length} penalties</span>
        </div>
      </section>

      <section className="two-column review-layout">
        <section className="section-card pad-lg stack-md">
          <div className="entry-header">
            <h2 style={{ margin: 0 }}>Timeline queue</h2>
            <span className="chip">{filteredPlays.length}</span>
          </div>
          <div className="table-like">
            {filteredPlays.map((play) => {
              const review = reviewByPlayId.get(play.playId);
              return (
                <div className="timeline-card" key={play.playId}>
                  <div className="timeline-top">
                    <strong>{play.summary}</strong>
                    <span className="mono">
                      Q{play.quarter} {formatClock(play.clockSeconds)} · {play.sequence}
                    </span>
                  </div>
                  <div className="pill-row">
                    <span className="chip">{play.playType.replaceAll("_", " ")}</span>
                    {review?.tags.map((tag) => (
                      <span className="chip" key={`${play.playId}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                    {review?.filmUrl ? <span className="chip">film linked</span> : null}
                  </div>
                  {review?.note ? <div className="kicker">{review.note}</div> : null}
                  <div className="timeline-actions">
                    <button className="mini-button" type="button" onClick={() => setSelectedPlayId(play.playId)}>
                      Review
                    </button>
                    <Link className="mini-button" href={`/games/${gameId}/gameday`}>
                      Open in Game Day
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <PlayReviewPanel
          play={selectedPlay}
          review={selectedPlay ? reviewByPlayId.get(selectedPlay.playId) ?? null : null}
          onSave={saveReview}
          onDelete={deleteReview}
        />
      </section>
    </section>
  );
}
