"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { getMostRecentActiveGame } from "@/lib/offline/store";

type ResumeState = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  path: string;
};

export function ResumeLiveGameCard() {
  const [resumeGame, setResumeGame] = useState<ResumeState | null>(null);

  useEffect(() => {
    void getMostRecentActiveGame().then((record) => {
      if (!record) return;
      setResumeGame({
        gameId: record.gameId,
        homeTeam: record.homeTeam,
        awayTeam: record.awayTeam,
        path: record.path
      });
    });
  }, []);

  if (!resumeGame) {
    return null;
  }

  return (
    <div className="section-card pad-md stack-sm">
      <span className="eyebrow" style={{ background: "rgba(19, 34, 27, 0.08)", color: "#2f4338" }}>
        Resume live work
      </span>
      <strong>
        {resumeGame.awayTeam} at {resumeGame.homeTeam}
      </strong>
      <p className="kicker" style={{ margin: 0 }}>
        Reopen the most recent local live session from this device.
      </p>
      <div>
        <Link className="button-primary" href={resumeGame.path as Route}>
          Resume Game Day
        </Link>
      </div>
    </div>
  );
}
