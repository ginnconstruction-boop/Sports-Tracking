import assert from "node:assert/strict";
import test from "node:test";
import type { RebuildTimelineItem } from "@/lib/domain/game-state";
import { buildTendencyBreakdown } from "@/lib/analytics/tendency-breakdown";

function makeTimelineItem(input: {
  sequence: string;
  possession: "home" | "away";
  downBeforePlay: 1 | 2 | 3 | 4;
  distanceBeforePlay: number;
  clockSeconds: number;
  playType: "run" | "pass" | "sack" | "spike" | "kickoff" | "punt" | "field_goal" | "extra_point" | "two_point_try" | "turnover" | "penalty";
  previousSpot: { side: "home" | "away"; yardLine: number };
  endSpot: { side: "home" | "away"; yardLine: number };
  firstDownAchieved?: boolean;
  scoringTeam?: "home" | "away";
}) {
  return {
    sequence: input.sequence,
    result: {
      play: {
        id: `play-${input.sequence}`,
        gameId: "game-1",
        sequence: input.sequence,
        quarter: 1,
        clockSeconds: input.clockSeconds,
        possession: input.possession,
        playType: input.playType,
        summary: null,
        payload: { kind: input.playType },
        participants: [],
        penalties: []
      },
      baseResult: {
        playId: `play-${input.sequence}`,
        sequence: input.sequence,
        summary: "",
        nextState: {
          quarter: 1,
          clockSeconds: input.clockSeconds,
          phase: "normal",
          possession: input.possession,
          down: 1,
          distance: 10,
          ballOn: input.endSpot,
          score: { home: 0, away: 0 },
          sequenceApplied: input.sequence
        },
        touchdown: false,
        turnover: false,
        firstDownAchieved: input.firstDownAchieved ?? false,
        statCredits: [],
        metadata: {
          previousSpot: input.previousSpot,
          endSpot: input.endSpot,
          downBeforePlay: input.downBeforePlay,
          distanceBeforePlay: input.distanceBeforePlay,
          possessionBeforePlay: input.possession,
          phaseBeforePlay: "normal",
          nextPhase: "normal",
          scoringTeam: input.scoringTeam,
          possessionChanged: false
        }
      },
      finalState: {
        quarter: 1,
        clockSeconds: input.clockSeconds,
        phase: "normal",
        possession: input.possession,
        down: 1,
        distance: 10,
        ballOn: input.endSpot,
        score: { home: 0, away: 0 },
        sequenceApplied: input.sequence
      },
      summary: "",
      appliedPenalties: [],
      statCredits: []
    }
  } as unknown as RebuildTimelineItem;
}

test("buildTendencyBreakdown splits primary offense and defense situational contexts", () => {
  const timeline: RebuildTimelineItem[] = [
    makeTimelineItem({
      sequence: "1",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 6,
      clockSeconds: 410,
      playType: "pass",
      previousSpot: { side: "home", yardLine: 30 },
      endSpot: { side: "home", yardLine: 39 },
      firstDownAchieved: true
    }),
    makeTimelineItem({
      sequence: "2",
      possession: "home",
      downBeforePlay: 1,
      distanceBeforePlay: 10,
      clockSeconds: 108,
      playType: "run",
      previousSpot: { side: "away", yardLine: 18 },
      endSpot: { side: "away", yardLine: 10 },
      scoringTeam: "home"
    }),
    makeTimelineItem({
      sequence: "3",
      possession: "away",
      downBeforePlay: 3,
      distanceBeforePlay: 5,
      clockSeconds: 97,
      playType: "run",
      previousSpot: { side: "away", yardLine: 12 },
      endSpot: { side: "away", yardLine: 8 },
      firstDownAchieved: false
    }),
    makeTimelineItem({
      sequence: "4",
      possession: "away",
      downBeforePlay: 2,
      distanceBeforePlay: 8,
      clockSeconds: 88,
      playType: "pass",
      previousSpot: { side: "home", yardLine: 16 },
      endSpot: { side: "home", yardLine: 12 },
      firstDownAchieved: true
    })
  ];

  const tendency = buildTendencyBreakdown(timeline, "home");

  const homeThirdDown = tendency.offense.find((line) => line.key === "third_down");
  assert.ok(homeThirdDown);
  assert.equal(homeThirdDown.plays, 1);
  assert.equal(homeThirdDown.passes, 1);
  assert.equal(homeThirdDown.conversions, 1);
  assert.equal(homeThirdDown.conversionRate, 100);

  const homeRedZone = tendency.offense.find((line) => line.key === "red_zone");
  assert.ok(homeRedZone);
  assert.equal(homeRedZone.plays, 1);
  assert.equal(homeRedZone.runs, 1);
  assert.equal(homeRedZone.successRate, 100);

  const homeTwoMinute = tendency.offense.find((line) => line.key === "two_minute");
  assert.ok(homeTwoMinute);
  assert.equal(homeTwoMinute.plays, 1);

  const awayBackedUp = tendency.defense.find((line) => line.key === "backed_up");
  assert.ok(awayBackedUp);
  assert.equal(awayBackedUp.plays, 1);
  assert.equal(awayBackedUp.runs, 1);

  const awayTwoMinute = tendency.defense.find((line) => line.key === "two_minute");
  assert.ok(awayTwoMinute);
  assert.equal(awayTwoMinute.plays, 2);
  assert.equal(awayTwoMinute.runRate, 50);
  assert.equal(awayTwoMinute.passRate, 50);
});
