import type { RebuildTimelineItem } from "@/lib/domain/game-state";
import type { TeamSide } from "@/lib/domain/play-log";
import type {
  GameSituationalBucketLine,
  GameSituationalReport,
  SituationalClockBucket,
  SituationalDistanceBucket,
  SituationalFieldZone,
  SituationalPlayFamily,
  SituationalScoreState
} from "@/lib/domain/reports";

type BucketAccumulator = {
  plays: number;
  runs: number;
  passes: number;
  yards: number;
  firstDowns: number;
  touchdowns: number;
  turnovers: number;
  explosivePlays: number;
  successfulPlays: number;
};

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function toRateLine<TKey extends string>(key: TKey, bucket: BucketAccumulator): GameSituationalBucketLine<TKey> {
  return {
    key,
    ...bucket,
    successRate: percentage(bucket.successfulPlays, bucket.plays),
    runRate: percentage(bucket.runs, bucket.plays),
    passRate: percentage(bucket.passes, bucket.plays),
    yardsPerPlay: bucket.plays === 0 ? 0 : Number((bucket.yards / bucket.plays).toFixed(2))
  };
}

function createBucketMap<T extends string>(keys: readonly T[]) {
  return new Map<T, BucketAccumulator>(
    keys.map((key) => [
      key,
      {
        plays: 0,
        runs: 0,
        passes: 0,
        yards: 0,
        firstDowns: 0,
        touchdowns: 0,
        turnovers: 0,
        explosivePlays: 0,
        successfulPlays: 0
      }
    ])
  );
}

function fieldCoordinate(position: { side: TeamSide; yardLine: number }, offense: TeamSide) {
  return position.side === offense ? position.yardLine : 100 - position.yardLine;
}

function netYardsForPlay(item: RebuildTimelineItem) {
  const offense = item.result.play.possession;
  const before = fieldCoordinate(item.result.baseResult.metadata.previousSpot, offense);
  const after = fieldCoordinate(item.result.baseResult.metadata.endSpot, offense);
  return after - before;
}

function distanceBucket(distance: number): SituationalDistanceBucket {
  if (distance <= 3) return "short_1_3";
  if (distance <= 6) return "medium_4_6";
  if (distance <= 10) return "long_7_10";
  return "very_long_11_plus";
}

function fieldZone(item: RebuildTimelineItem): SituationalFieldZone {
  const offense = item.result.play.possession;
  const coordinate = fieldCoordinate(item.result.baseResult.metadata.previousSpot, offense);
  if (coordinate <= 20) return "backed_up";
  if (coordinate <= 60) return "midfield";
  if (coordinate <= 79) return "fringe";
  if (coordinate <= 89) return "red_zone";
  return "goal_to_go";
}

function clockBucket(clockSeconds: number): SituationalClockBucket {
  if (clockSeconds <= 120) return "two_minute";
  if (clockSeconds <= 300) return "late";
  if (clockSeconds <= 600) return "middle";
  return "opening";
}

function scoreState(beforeScore: Record<TeamSide, number>, offense: TeamSide): SituationalScoreState {
  const diff =
    offense === "home"
      ? beforeScore.home - beforeScore.away
      : beforeScore.away - beforeScore.home;

  if (diff >= 9) return "leading_9_plus";
  if (diff >= 1) return "leading_1_8";
  if (diff === 0) return "tied";
  if (diff <= -9) return "trailing_9_plus";
  return "trailing_1_8";
}

function playFamily(playType: RebuildTimelineItem["result"]["play"]["playType"]): SituationalPlayFamily {
  if (playType === "run") return "run";
  if (playType === "pass" || playType === "sack" || playType === "spike") return "pass";
  if (playType === "turnover") return "turnover";
  if (playType === "penalty") return "penalty";
  if (
    playType === "kickoff" ||
    playType === "punt" ||
    playType === "field_goal" ||
    playType === "extra_point" ||
    playType === "two_point_try"
  ) {
    return "special_teams";
  }
  return "other";
}

function isLegalDownPlay(item: RebuildTimelineItem) {
  const accepted = item.result.play.penalties.filter((penalty) => penalty.result === "accepted");
  const hasNoPlay = accepted.some((penalty) => penalty.noPlay);
  const hasOffsetting = item.result.play.penalties.some((penalty) => penalty.result === "offsetting");
  return !hasNoPlay && !hasOffsetting;
}

function isExplosive(item: RebuildTimelineItem, yards: number, family: SituationalPlayFamily) {
  if (family === "run") return yards >= 12;
  if (family === "pass") return yards >= 16;
  if (item.result.baseResult.metadata.scoringTeam === item.result.play.possession) return true;
  return false;
}

function isSuccessful(item: RebuildTimelineItem, yards: number) {
  if (item.result.baseResult.metadata.scoringTeam === item.result.play.possession) {
    return true;
  }

  const down = item.result.baseResult.metadata.downBeforePlay;
  const distance = Math.max(1, item.result.baseResult.metadata.distanceBeforePlay);

  if (down === 1) return yards >= distance * 0.5;
  if (down === 2) return yards >= distance * 0.7;
  return yards >= distance;
}

function addToBucket<TKey extends string>(
  map: Map<TKey, BucketAccumulator>,
  key: TKey,
  values: {
    family: SituationalPlayFamily;
    yards: number;
    firstDown: boolean;
    touchdown: boolean;
    turnover: boolean;
    explosive: boolean;
    successful: boolean;
  }
) {
  const bucket = map.get(key);
  if (!bucket) return;

  bucket.plays += 1;
  bucket.yards += values.yards;
  if (values.family === "run") bucket.runs += 1;
  if (values.family === "pass") bucket.passes += 1;
  if (values.firstDown) bucket.firstDowns += 1;
  if (values.touchdown) bucket.touchdowns += 1;
  if (values.turnover) bucket.turnovers += 1;
  if (values.explosive) bucket.explosivePlays += 1;
  if (values.successful) bucket.successfulPlays += 1;
}

const DISTANCE_KEYS = ["short_1_3", "medium_4_6", "long_7_10", "very_long_11_plus"] as const;
const FIELD_ZONE_KEYS = ["backed_up", "midfield", "fringe", "red_zone", "goal_to_go"] as const;
const CLOCK_KEYS = ["opening", "middle", "late", "two_minute"] as const;
const SCORE_STATE_KEYS = [
  "leading_9_plus",
  "leading_1_8",
  "tied",
  "trailing_1_8",
  "trailing_9_plus"
] as const;
const FAMILY_KEYS = ["run", "pass", "special_teams", "turnover", "penalty", "other"] as const;

export function buildGameSituationalReport(timeline: RebuildTimelineItem[]): GameSituationalReport {
  const byDistance = createBucketMap(DISTANCE_KEYS);
  const byFieldZone = createBucketMap(FIELD_ZONE_KEYS);
  const byClock = createBucketMap(CLOCK_KEYS);
  const byScoreState = createBucketMap(SCORE_STATE_KEYS);
  const byFamily = createBucketMap(FAMILY_KEYS);
  let scoreBeforePlay: Record<TeamSide, number> = { home: 0, away: 0 };

  for (const item of timeline) {
    if (!isLegalDownPlay(item)) {
      scoreBeforePlay = item.result.finalState.score;
      continue;
    }

    const family = playFamily(item.result.play.playType);
    const yards = netYardsForPlay(item);
    const isFirstDown =
      item.result.baseResult.metadata.scoringTeam === item.result.play.possession ||
      item.result.baseResult.firstDownAchieved ||
      item.result.play.penalties.some((penalty) => penalty.result === "accepted" && penalty.automaticFirstDown);
    const touchdown = item.result.baseResult.metadata.scoringTeam === item.result.play.possession;
    const turnover = item.result.baseResult.metadata.possessionChanged && item.result.finalState.possession !== item.result.play.possession;
    const explosive = isExplosive(item, yards, family);
    const successful = isSuccessful(item, yards);
    const shared = { family, yards, firstDown: isFirstDown, touchdown, turnover, explosive, successful };

    addToBucket(byDistance, distanceBucket(item.result.baseResult.metadata.distanceBeforePlay), shared);
    addToBucket(byFieldZone, fieldZone(item), shared);
    addToBucket(byClock, clockBucket(item.result.play.clockSeconds), shared);
    addToBucket(byScoreState, scoreState(scoreBeforePlay, item.result.play.possession), shared);
    addToBucket(byFamily, family, shared);

    scoreBeforePlay = item.result.finalState.score;
  }

  const familyTotals = [...byFamily.values()].reduce(
    (acc, item) => {
      acc.plays += item.plays;
      acc.runs += item.runs;
      acc.passes += item.passes;
      acc.explosivePlays += item.explosivePlays;
      acc.successfulPlays += item.successfulPlays;
      return acc;
    },
    { plays: 0, runs: 0, passes: 0, explosivePlays: 0, successfulPlays: 0 }
  );

  return {
    summary: {
      totalSituationalPlays: familyTotals.plays,
      explosivePlayRate: percentage(familyTotals.explosivePlays, familyTotals.plays),
      overallSuccessRate: percentage(familyTotals.successfulPlays, familyTotals.plays),
      runRate: percentage(familyTotals.runs, familyTotals.plays),
      passRate: percentage(familyTotals.passes, familyTotals.plays)
    },
    byDownDistance: DISTANCE_KEYS.map((key) => toRateLine(key, byDistance.get(key)!)),
    byFieldZone: FIELD_ZONE_KEYS.map((key) => toRateLine(key, byFieldZone.get(key)!)),
    byClock: CLOCK_KEYS.map((key) => toRateLine(key, byClock.get(key)!)),
    byScoreState: SCORE_STATE_KEYS.map((key) => toRateLine(key, byScoreState.get(key)!)),
    byPlayFamily: FAMILY_KEYS.map((key) => toRateLine(key, byFamily.get(key)!))
  };
}
