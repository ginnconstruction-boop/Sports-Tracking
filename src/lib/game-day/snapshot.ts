import type {
  GameDayDriveSummary,
  GameDayPlayView,
  GameDayPossessionSummary,
  GameDayPlayerStatLine,
  GameDayQuarterSummary,
  GameDayRosterEntry,
  GameDaySnapshot,
  GameDayTeamStatLine
} from "@/lib/domain/game-day";
import type { GameProjection, RebuildTimelineItem } from "@/lib/domain/game-state";
import type { FieldPosition, TeamSide } from "@/lib/domain/play-log";

function byJersey(left: { jerseyNumber?: string | null }, right: { jerseyNumber?: string | null }) {
  return Number.parseInt(left.jerseyNumber ?? "0", 10) - Number.parseInt(right.jerseyNumber ?? "0", 10);
}

export function buildPlayViews(timeline: RebuildTimelineItem[]) {
  return timeline.map((item, index): GameDayPlayView => ({
    playId: item.result.play.id,
    sequence: item.sequence,
    previousSequence: timeline[index - 1]?.sequence,
    nextSequence: timeline[index + 1]?.sequence,
    playType: item.result.play.playType,
    summary: item.result.summary,
    quarter: item.result.play.quarter,
    clockSeconds: item.result.play.clockSeconds,
    state: item.result.finalState,
    play: item.result.play
  }));
}

export function buildScoringSummary(playViews: GameDayPlayView[]) {
  let previousScore = { home: 0, away: 0 };

  return playViews.filter((item) => {
    const changed =
      item.state.score.home !== previousScore.home || item.state.score.away !== previousScore.away;
    previousScore = item.state.score;
    return changed;
  });
}

export function buildQuarterSummary(playViews: GameDayPlayView[]) {
  const summaries = new Map<number, GameDayQuarterSummary>();
  let previousScore = { home: 0, away: 0 };

  for (const playView of playViews) {
    const summary = summaries.get(playView.quarter) ?? {
      quarter: playView.quarter,
      playCount: 0,
      homePoints: 0,
      awayPoints: 0
    };

    summary.playCount += 1;
    summary.homePoints += Math.max(0, playView.state.score.home - previousScore.home);
    summary.awayPoints += Math.max(0, playView.state.score.away - previousScore.away);
    summaries.set(playView.quarter, summary);
    previousScore = playView.state.score;
  }

  return [...summaries.values()].sort((left, right) => left.quarter - right.quarter);
}

function toAbsoluteYardLine(fieldPosition: FieldPosition) {
  return fieldPosition.side === "home" ? fieldPosition.yardLine : 100 - fieldPosition.yardLine;
}

function offensiveProgress(offense: TeamSide, fieldPosition: FieldPosition) {
  const absolute = toAbsoluteYardLine(fieldPosition);
  return offense === "home" ? absolute : 100 - absolute;
}

function formatFieldPosition(fieldPosition: FieldPosition) {
  return `${fieldPosition.side === "home" ? "own" : "opp"} ${fieldPosition.yardLine}`;
}

function elapsedMarker(quarter: number, clockSeconds: number) {
  const quarterLengthSeconds = 15 * 60;
  return (quarter - 1) * quarterLengthSeconds + (quarterLengthSeconds - clockSeconds);
}

function inferDriveResult(
  item: RebuildTimelineItem,
  nextNormalPlay?: RebuildTimelineItem
): GameDayDriveSummary["result"] | undefined {
  const { play, finalState, baseResult, summary } = item.result;

  if (baseResult.metadata.scoringTeam) {
    if (play.playType === "field_goal") {
      return "field_goal";
    }

    return "touchdown";
  }

  if (play.playType === "punt") {
    return "punt";
  }

  if (play.playType === "field_goal") {
    return "missed_field_goal";
  }

  if (baseResult.metadata.possessionChanged) {
    return "turnover";
  }

  if (nextNormalPlay && nextNormalPlay.result.play.possession !== play.possession) {
    return "downs";
  }

  if (summary.toLowerCase().includes("end of half")) {
    return "end_of_half";
  }

  return undefined;
}

export function buildDriveSummaries(timeline: RebuildTimelineItem[]) {
  const normalPlays = timeline.filter(
    (item) =>
      item.result.play.playType !== "kickoff" &&
      item.result.play.playType !== "extra_point" &&
      item.result.play.playType !== "two_point_try"
  );

  const drives: GameDayDriveSummary[] = [];
  let activeDrive:
    | {
        side: TeamSide;
        startSpot: FieldPosition;
        startClockSeconds: number;
        startQuarter: number;
        plays: RebuildTimelineItem[];
      }
    | null = null;

  const flushDrive = (result: GameDayDriveSummary["result"]) => {
    if (!activeDrive || activeDrive.plays.length === 0) {
      activeDrive = null;
      return;
    }

    const lastPlay = activeDrive.plays[activeDrive.plays.length - 1];
    const endSpot = lastPlay.result.finalState.ballOn;

    drives.push({
      id: `${activeDrive.plays[0].result.play.id}-${lastPlay.result.play.id}`,
      side: activeDrive.side,
      quarter: activeDrive.startQuarter,
      startClockSeconds: activeDrive.startClockSeconds,
      endClockSeconds: lastPlay.result.finalState.clockSeconds,
      startFieldPosition: formatFieldPosition(activeDrive.startSpot),
      endFieldPosition: formatFieldPosition(endSpot),
      result,
      playCount: activeDrive.plays.length,
      yardsGained:
        offensiveProgress(activeDrive.side, endSpot) -
        offensiveProgress(activeDrive.side, activeDrive.startSpot),
      timeConsumedSeconds: Math.max(
        0,
        elapsedMarker(lastPlay.result.finalState.quarter, lastPlay.result.finalState.clockSeconds) -
          elapsedMarker(activeDrive.startQuarter, activeDrive.startClockSeconds)
      )
    });

    activeDrive = null;
  };

  for (let index = 0; index < normalPlays.length; index += 1) {
    const item = normalPlays[index];
    const nextPlay = normalPlays[index + 1];
    const play = item.result.play;

    if (!activeDrive || activeDrive.side !== play.possession) {
      if (activeDrive) {
        flushDrive("downs");
      }

      activeDrive = {
        side: play.possession,
        startSpot: item.result.baseResult.metadata.previousSpot,
        startClockSeconds: play.clockSeconds,
        startQuarter: play.quarter,
        plays: []
      };
    }

    activeDrive.plays.push(item);

    const result = inferDriveResult(item, nextPlay);
    if (result) {
      flushDrive(result);
    }
  }

  if (activeDrive) {
    flushDrive("in_progress");
  }

  return drives.reverse();
}

export function buildPossessionSummary(drives: GameDayDriveSummary[]) {
  return drives.slice(0, 6).map(
    (drive): GameDayPossessionSummary => ({
      id: drive.id,
      side: drive.side,
      startSequence: drive.id.split("-")[0] ?? drive.id,
      endSequence: drive.id.split("-")[1] ?? drive.id,
      playCount: drive.playCount,
      result: drive.result
    })
  );
}

export function buildTeamStats(
  homeTeam: string,
  awayTeam: string,
  rawStats: GameDaySnapshot["rawStats"]
) {
  return [
    { side: "away" as const, label: awayTeam, totals: rawStats.teamTotals.away },
    { side: "home" as const, label: homeTeam, totals: rawStats.teamTotals.home }
  ] satisfies GameDayTeamStatLine[];
}

export function buildPlayerStats(
  rosters: Record<"home" | "away", GameDayRosterEntry[]>,
  rawStats: GameDaySnapshot["rawStats"]
) {
  const rosterIndex = new Map<string, GameDayRosterEntry>();

  for (const entry of [...rosters.home, ...rosters.away]) {
    rosterIndex.set(entry.id, entry);
  }

  return Object.entries(rawStats.playerTotals)
    .map(([gameRosterEntryId, totals]): GameDayPlayerStatLine => {
      const rosterEntry = rosterIndex.get(gameRosterEntryId);

      return {
        gameRosterEntryId,
        side: rosterEntry?.side ?? "home",
        jerseyNumber: rosterEntry?.jerseyNumber,
        displayName: rosterEntry?.displayName ?? gameRosterEntryId,
        position: rosterEntry?.position,
        totals
      };
    })
    .sort((left, right) => {
      if (left.side !== right.side) {
        return left.side.localeCompare(right.side);
      }

      return byJersey(left, right);
    });
}

export function buildGameDaySnapshot(params: {
  gameId: string;
  revision: number;
  status: string;
  lastRebuiltAt?: string | null;
  homeTeam: string;
  awayTeam: string;
  rosters: Record<"home" | "away", GameDayRosterEntry[]>;
  projection: GameProjection;
  playReviews?: GameDaySnapshot["playReviews"];
}): GameDaySnapshot {
  const playViews = buildPlayViews(params.projection.timeline);
  const scoringSummary = buildScoringSummary(playViews).reverse();
  const driveSummaries = buildDriveSummaries(params.projection.timeline);
  const turnoverTracker = [...playViews]
    .filter(
      (item) =>
        item.play.playType === "turnover" ||
        (item.play.playType === "sack" &&
          "fumbleLost" in item.play.payload &&
          Boolean(item.play.payload.fumbleLost))
    )
    .reverse();
  const penaltyTracker = [...playViews]
    .filter((item) => item.play.penalties.length > 0 || item.play.playType === "penalty")
    .reverse();
  const lastTurnoverPlay =
    turnoverTracker.find(
      (item) =>
        item.play.playType === "turnover" ||
        item.play.penalties.some((penalty) => penalty.timing === "post_possession") ||
        (item.play.playType === "sack" &&
          "fumbleLost" in item.play.payload &&
          Boolean(item.play.payload.fumbleLost))
    ) ?? null;
  const lastPenaltyPlay = penaltyTracker[0] ?? null;

  return {
    gameId: params.gameId,
    revision: params.revision,
    status: params.status,
    lastRebuiltAt: params.lastRebuiltAt ?? null,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    currentState: params.projection.currentState,
    recentPlays: playViews.slice(-12).reverse(),
    scoringSummary,
    quarterSummary: buildQuarterSummary(playViews),
    driveSummaries,
    lastScoringPlay: scoringSummary[0] ?? null,
    lastTurnoverPlay,
    lastPenaltyPlay,
    possessionSummary: buildPossessionSummary(driveSummaries),
    turnoverTracker,
    penaltyTracker,
    fullPlayLog: [...playViews].reverse(),
    playReviews: params.playReviews ?? [],
    rosters: {
      home: [...params.rosters.home].sort(byJersey),
      away: [...params.rosters.away].sort(byJersey)
    },
    teamStats: buildTeamStats(params.homeTeam, params.awayTeam, params.projection.stats),
    playerStats: buildPlayerStats(params.rosters, params.projection.stats),
    rawStats: params.projection.stats
  };
}
