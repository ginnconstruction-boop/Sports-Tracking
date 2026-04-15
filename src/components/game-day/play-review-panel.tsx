"use client";

import { useEffect, useState } from "react";
import type { GameDayPlayView } from "@/lib/domain/game-day";
import type { PlayReviewAnnotation } from "@/lib/domain/play-review";

type Props = {
  play: GameDayPlayView | null;
  review?: PlayReviewAnnotation | null;
  onSave: (payload: { playId: string; tags: string[]; note?: string; filmUrl?: string }) => Promise<void>;
  onDelete: (playId: string) => Promise<void>;
};

export function PlayReviewPanel({ play, review, onSave, onDelete }: Props) {
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [filmUrl, setFilmUrl] = useState("");

  useEffect(() => {
    setTags(review?.tags.join(", ") ?? "");
    setNote(review?.note ?? "");
    setFilmUrl(review?.filmUrl ?? "");
  }, [review?.filmUrl, review?.note, review?.playId, review?.tags]);

  if (!play) {
    return (
      <section className="section-card pad-lg stack-sm">
        <h2 style={{ margin: 0 }}>Play review</h2>
        <p className="kicker">Select any play from the full timeline to add tags, coaching notes, or a film link.</p>
      </section>
    );
  }

  return (
    <section className="section-card pad-lg stack-md">
      <div className="entry-header">
        <div>
          <h2 style={{ margin: 0 }}>Play review</h2>
          <p className="kicker">{play.summary}</p>
        </div>
        <span className="chip">{play.sequence}</span>
      </div>
      <div className="form-grid">
        <label className="field field-span-2">
          <span>Tags</span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="turnover, explosive, red zone" />
        </label>
        <label className="field field-span-2">
          <span>Film URL</span>
          <input value={filmUrl} onChange={(event) => setFilmUrl(event.target.value)} placeholder="https://..." />
        </label>
        <label className="field field-span-2">
          <span>Coaching note</span>
          <textarea value={note} rows={5} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      <div className="timeline-actions">
        <button
          className="button-primary"
          type="button"
          onClick={() =>
            void onSave({
              playId: play.playId,
              tags: tags
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              note: note || undefined,
              filmUrl: filmUrl || undefined
            })
          }
        >
          Save review
        </button>
        {review ? (
          <button className="mini-button danger-button" type="button" onClick={() => void onDelete(play.playId)}>
            Clear review
          </button>
        ) : null}
      </div>
    </section>
  );
}
