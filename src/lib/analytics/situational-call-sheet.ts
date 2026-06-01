import type { RebuildTimelineItem } from "@/lib/domain/game-state";
import type { TeamSide } from "@/lib/domain/play-log";
import type { SituationalDistanceBucket, SituationalFieldZone } from "@/lib/domain/reports";

type Down = 1 | 2 | 3 | 4;

type BucketTotals = {
  plays: number;
  runs: number;
  passes: number;
  other: number;
  yards: number;
  successfulPlays: number;
};

export type DownDistanceCallLine = {
  down: Down;
  distanceBucket: SituationalDistanceBucket;
  plays: number;
  runs: number;
  passes: number;
  other: number;
  runRate: number;
  passRate: number;
  successRate: number;
  yardsPerPlay: number;
};

export type FieldZoneCallLine = {
  fieldZone: SituationalFieldZone;
  plays: number;
  runs: number;
  passes: number;
  other: number;
  runRate: number;
  passRate: number;
  successRate: number;
  yardsPerPlay: number;
};

export type SituationalCallSheet = {
  byDownDistance: DownDistanceCallLine[];
  byFieldZone: FieldZoneCallLine[];
};

export type MoneyDownCallLine = {
  down: 3 | 4;
  attempts: number;
  conversions: number;
  conversionRate: number;
  runCalls: number;
  scrambleCalls: number;
  passCalls: number;
  sackCalls: number;
  otherCalls: number;
  yardsPerPlay: number;
};

const DOWNS: Down[] = [1, 2, 3, 4];
const DISTANCE_BUCKETS: SituationalDistanceBucket[] = [
  "short_1_3",
  "medium_4_6",
  "long_7_10",
  "very_long_11_plus"
];
const FIELD_ZONES: SituationalFieldZone[] = ["backed_up", "midfield", "fringe", "red_zone", "goal_to_go"];

function rate(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function toLine(totals: BucketTotals) {
  return {
    plays: totals.plays,
    runs: totals.runs,
    passes: totals.passes,
    other: totals.other,
    runRate: rate(totals.runs, totals.plays),
    passRate: rate(totals.passes, totals.plays),
    successRate: rate(totals.successfulPlays, totals.plays),
    yardsPerPlay: totals.plays === 0 ? 0 : Number((totals.yards / totals.plays).toFixed(2))
  };
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

function isLegalPlay(item: RebuildTimelineItem) {
  const accepted = item.result.play.penalties.filter((penalty) => penalty.result === "accepted");
  const hasNoPlay = accepted.some((penalty) => penalty.noPlay);
  const hasOffsetting = item.result.play.penalties.some((penalty) => penalty.result === "offsetting");
  return !hasNoPlay && !hasOffsetting;
}

function playFamily(item: RebuildTimelineItem): "run" | "pass" | "other" {
  const playType = item.result.play.playType;
  if (playType === "run") return "run";
  if (playType === "pass" || playType === "sack") return "pass";
  return "other";
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

function isConversion(item: RebuildTimelineItem) {
  if (item.result.baseResult.metadata.scoringTeam === item.result.play.possession) {
    return true;
  }
  if (item.result.baseResult.firstDownAchieved) {
    return true;
  }
  return item.result.play.penalties.some((penalty) => penalty.result === "accepted" && penalty.automaticFirstDown);
}

function emptyTotals(): BucketTotals {
  return {
    plays: 0,
    runs: 0,
    passes: 0,
    other: 0,
    yards: 0,
    successfulPlays: 0
  };
}

export function buildMoneyDownCallTendency(timeline: RebuildTimelineItem[]): MoneyDownCallLine[] {
  const base = new Map<3 | 4, Omit<MoneyDownCallLine, "down" | "conversionRate" | "yardsPerPlay"> & { yards: number }>([
    [3, { attempts: 0, conversions: 0, runCalls: 0, scrambleCalls: 0, passCalls: 0, sackCalls: 0, otherCalls: 0, yards: 0 }],
    [4, { attempts: 0, conversions: 0, runCalls: 0, scrambleCalls: 0, passCalls: 0, sackCalls: 0, otherCalls: 0, yards: 0 }]
  ]);

  for (const item of timeline) {
    if (!isLegalPlay(item)) {
      continue;
    }
    const down = item.result.baseResult.metadata.downBeforePlay;
    if (down !== 3 && down !== 4) {
      continue;
    }

    const row = base.get(down);
    if (!row) continue;

    row.attempts += 1;
    row.yards += netYardsForPlay(item);
    if (isConversion(item)) {
      row.conversions += 1;
    }

    if (item.result.play.playType === "run") {
      const runKind = (item.result.play.payload as { runKind?: string }).runKind;
      if (runKind === "scramble") {
        row.scrambleCalls += 1;
      } else {
        row.runCalls += 1;
      }
      continue;
    }

    if (item.result.play.playType === "pass") {
      row.passCalls += 1;
      continue;
    }

    if (item.result.play.playType === "sack") {
      row.sackCalls += 1;
      continue;
    }

    row.otherCalls += 1;
  }

  return ([3, 4] as const).map((down) => {
    const row = base.get(down)!;
    return {
      down,
      attempts: row.attempts,
      conversions: row.conversions,
      conversionRate: rate(row.conversions, row.attempts),
      runCalls: row.runCalls,
      scrambleCalls: row.scrambleCalls,
      passCalls: row.passCalls,
      sackCalls: row.sackCalls,
      otherCalls: row.otherCalls,
      yardsPerPlay: row.attempts === 0 ? 0 : Number((row.yards / row.attempts).toFixed(2))
    };
  });
}

export function buildSituationalCallSheet(timeline: RebuildTimelineItem[]): SituationalCallSheet {
  const downDistanceTotals = new Map<string, BucketTotals>();
  const fieldZoneTotals = new Map<SituationalFieldZone, BucketTotals>();

  for (const down of DOWNS) {
    for (const bucket of DISTANCE_BUCKETS) {
      downDistanceTotals.set(`${down}:${bucket}`, emptyTotals());
    }
  }
  for (const zone of FIELD_ZONES) {
    fieldZoneTotals.set(zone, emptyTotals());
  }

  for (const item of timeline) {
    if (!isLegalPlay(item)) {
      continue;
    }

    const down = item.result.baseResult.metadata.downBeforePlay;
    if (!DOWNS.includes(down)) {
      continue;
    }

    const bucket = distanceBucket(item.result.baseResult.metadata.distanceBeforePlay);
    const zone = fieldZone(item);
    const family = playFamily(item);
    const yards = netYardsForPlay(item);
    const successful = isSuccessful(item, yards);
    const downDistanceKey = `${down}:${bucket}`;
    const downDistance = downDistanceTotals.get(downDistanceKey);
    const field = fieldZoneTotals.get(zone);

    if (!downDistance || !field) {
      continue;
    }

    downDistance.plays += 1;
    downDistance.yards += yards;
    downDistance.successfulPlays += successful ? 1 : 0;
    if (family === "run") downDistance.runs += 1;
    else if (family === "pass") downDistance.passes += 1;
    else downDistance.other += 1;

    field.plays += 1;
    field.yards += yards;
    field.successfulPlays += successful ? 1 : 0;
    if (family === "run") field.runs += 1;
    else if (family === "pass") field.passes += 1;
    else field.other += 1;
  }

  return {
    byDownDistance: DOWNS.flatMap((down) =>
      DISTANCE_BUCKETS.map((bucket) => ({
        down,
        distanceBucket: bucket,
        ...toLine(downDistanceTotals.get(`${down}:${bucket}`) ?? emptyTotals())
      }))
    ),
    byFieldZone: FIELD_ZONES.map((zone) => ({
      fieldZone: zone,
      ...toLine(fieldZoneTotals.get(zone) ?? emptyTotals())
    }))
  };
}
