import type { RebuildTimelineItem } from "@/lib/domain/game-state";
import type { TeamSide } from "@/lib/domain/play-log";

export type TendencyContextKey = "third_down" | "red_zone" | "backed_up" | "two_minute";

export type TendencyLine = {
  key: TendencyContextKey;
  label: string;
  plays: number;
  runs: number;
  passes: number;
  runRate: number;
  passRate: number;
  yardsPerPlay: number;
  successRate: number;
  conversions: number;
  conversionRate: number;
};

export type TendencyBreakdown = {
  offense: TendencyLine[];
  defense: TendencyLine[];
};

type ContextAccumulator = {
  plays: number;
  runs: number;
  passes: number;
  yards: number;
  successful: number;
  conversions: number;
};

type ContextDefinition = {
  key: TendencyContextKey;
  label: string;
  matches: (item: RebuildTimelineItem) => boolean;
};

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

function isRunFamily(playType: RebuildTimelineItem["result"]["play"]["playType"]) {
  return playType === "run";
}

function isPassFamily(playType: RebuildTimelineItem["result"]["play"]["playType"]) {
  return playType === "pass" || playType === "sack" || playType === "spike";
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

function isLegalPlay(item: RebuildTimelineItem) {
  const accepted = item.result.play.penalties.filter((penalty) => penalty.result === "accepted");
  const hasNoPlay = accepted.some((penalty) => penalty.noPlay);
  const hasOffsetting = item.result.play.penalties.some((penalty) => penalty.result === "offsetting");
  return !hasNoPlay && !hasOffsetting;
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
  return (
    item.result.baseResult.metadata.scoringTeam === item.result.play.possession ||
    item.result.baseResult.firstDownAchieved ||
    item.result.play.penalties.some((penalty) => penalty.result === "accepted" && penalty.automaticFirstDown)
  );
}

const contextDefinitions: ContextDefinition[] = [
  {
    key: "third_down",
    label: "3rd down",
    matches: (item) => item.result.baseResult.metadata.downBeforePlay === 3
  },
  {
    key: "red_zone",
    label: "Red zone",
    matches: (item) => fieldCoordinate(item.result.baseResult.metadata.previousSpot, item.result.play.possession) >= 80
  },
  {
    key: "backed_up",
    label: "Backed up",
    matches: (item) => fieldCoordinate(item.result.baseResult.metadata.previousSpot, item.result.play.possession) <= 20
  },
  {
    key: "two_minute",
    label: "Two-minute",
    matches: (item) => item.result.play.clockSeconds <= 120
  }
];

function createAccumulatorMap() {
  return new Map<TendencyContextKey, ContextAccumulator>(
    contextDefinitions.map((context) => [
      context.key,
      { plays: 0, runs: 0, passes: 0, yards: 0, successful: 0, conversions: 0 }
    ])
  );
}

function toLine(
  key: TendencyContextKey,
  label: string,
  accumulator: ContextAccumulator
): TendencyLine {
  return {
    key,
    label,
    plays: accumulator.plays,
    runs: accumulator.runs,
    passes: accumulator.passes,
    runRate: percentage(accumulator.runs, accumulator.plays),
    passRate: percentage(accumulator.passes, accumulator.plays),
    yardsPerPlay: accumulator.plays === 0 ? 0 : Number((accumulator.yards / accumulator.plays).toFixed(2)),
    successRate: percentage(accumulator.successful, accumulator.plays),
    conversions: accumulator.conversions,
    conversionRate: percentage(accumulator.conversions, accumulator.plays)
  };
}

function buildLines(timeline: RebuildTimelineItem[], possessionSide: TeamSide) {
  const buckets = createAccumulatorMap();

  for (const item of timeline) {
    if (!isLegalPlay(item) || item.result.play.possession !== possessionSide) {
      continue;
    }

    const playType = item.result.play.playType;
    const yards = netYardsForPlay(item);
    const successful = isSuccessful(item, yards);
    const conversion = isConversion(item);

    for (const context of contextDefinitions) {
      if (!context.matches(item)) {
        continue;
      }

      const entry = buckets.get(context.key);
      if (!entry) {
        continue;
      }

      entry.plays += 1;
      entry.yards += yards;
      if (isRunFamily(playType)) {
        entry.runs += 1;
      }
      if (isPassFamily(playType)) {
        entry.passes += 1;
      }
      if (successful) {
        entry.successful += 1;
      }
      if (conversion) {
        entry.conversions += 1;
      }
    }
  }

  return contextDefinitions.map((context) => toLine(context.key, context.label, buckets.get(context.key)!));
}

export function buildTendencyBreakdown(
  timeline: RebuildTimelineItem[],
  primarySide: TeamSide
): TendencyBreakdown {
  const opponentSide: TeamSide = primarySide === "home" ? "away" : "home";

  return {
    offense: buildLines(timeline, primarySide),
    defense: buildLines(timeline, opponentSide)
  };
}
