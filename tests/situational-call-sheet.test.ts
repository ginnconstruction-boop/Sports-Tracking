import assert from "node:assert/strict";
import test from "node:test";
import type { RebuildTimelineItem } from "@/lib/domain/game-state";
import { buildMoneyDownCallTendency, buildSituationalCallSheet } from "@/lib/analytics/situational-call-sheet";

function makeTimelineItem(input: {
  sequence: string;
  possession: "home" | "away";
  downBeforePlay: 1 | 2 | 3 | 4;
  distanceBeforePlay: number;
  playType: "run" | "pass" | "sack" | "kickoff";
  runKind?: "designed" | "scramble";
  previousSpot: { side: "home" | "away"; yardLine: number };
  endSpot: { side: "home" | "away"; yardLine: number };
  clockSeconds?: number;
  scoringTeam?: "home" | "away";
  firstDownAchieved?: boolean;
  noPlayAcceptedPenalty?: boolean;
}) {
  return {
    sequence: input.sequence,
    result: {
      play: {
        id: `play-${input.sequence}`,
        gameId: "game-1",
        sequence: input.sequence,
        quarter: 1,
        clockSeconds: input.clockSeconds ?? 600,
        possession: input.possession,
        playType: input.playType,
        summary: null,
        payload:
          input.playType === "run"
            ? { kind: "run", runKind: input.runKind ?? "designed", ballCarrierNumber: "34", yards: 0 }
            : input.playType === "pass"
              ? { kind: "pass", passerNumber: "12", result: "incomplete", yards: 0 }
              : input.playType === "sack"
                ? { kind: "sack", quarterbackNumber: "12", yardsLost: 0 }
                : { kind: input.playType },
        participants: [],
        penalties: input.noPlayAcceptedPenalty
          ? [
              {
                penalizedSide: input.possession,
                code: "FS",
                yards: 5,
                result: "accepted",
                enforcementType: "previous_spot",
                timing: "dead_ball",
                noPlay: true
              }
            ]
          : []
      },
      baseResult: {
        playId: `play-${input.sequence}`,
        sequence: input.sequence,
        summary: "",
        nextState: {
          quarter: 1,
          clockSeconds: input.clockSeconds ?? 600,
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
        clockSeconds: input.clockSeconds ?? 600,
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

test("buildSituationalCallSheet tracks run/pass tendencies by down+distance and field zone", () => {
  const timeline: RebuildTimelineItem[] = [
    makeTimelineItem({
      sequence: "1",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 2,
      playType: "run",
      previousSpot: { side: "home", yardLine: 35 },
      endSpot: { side: "home", yardLine: 40 }
    }),
    makeTimelineItem({
      sequence: "2",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 2,
      playType: "pass",
      previousSpot: { side: "home", yardLine: 40 },
      endSpot: { side: "home", yardLine: 38 }
    }),
    makeTimelineItem({
      sequence: "3",
      possession: "away",
      downBeforePlay: 1,
      distanceBeforePlay: 10,
      playType: "pass",
      previousSpot: { side: "home", yardLine: 15 },
      endSpot: { side: "home", yardLine: 5 },
      scoringTeam: "away"
    }),
    makeTimelineItem({
      sequence: "4",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 2,
      playType: "run",
      previousSpot: { side: "home", yardLine: 45 },
      endSpot: { side: "home", yardLine: 46 },
      noPlayAcceptedPenalty: true
    })
  ];

  const callSheet = buildSituationalCallSheet(timeline);

  const thirdAndShort = callSheet.byDownDistance.find(
    (item) => item.down === 3 && item.distanceBucket === "short_1_3"
  );
  assert.ok(thirdAndShort);
  assert.equal(thirdAndShort.plays, 2);
  assert.equal(thirdAndShort.runs, 1);
  assert.equal(thirdAndShort.passes, 1);
  assert.equal(thirdAndShort.runRate, 50);
  assert.equal(thirdAndShort.passRate, 50);

  const redZone = callSheet.byFieldZone.find((item) => item.fieldZone === "red_zone");
  assert.ok(redZone);
  assert.equal(redZone.plays, 1);
  assert.equal(redZone.passes, 1);
  assert.equal(redZone.successRate, 100);
});

test("buildMoneyDownCallTendency reports 3rd and 4th down call mix with conversion rates", () => {
  const timeline: RebuildTimelineItem[] = [
    makeTimelineItem({
      sequence: "1",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 4,
      playType: "run",
      firstDownAchieved: true,
      previousSpot: { side: "home", yardLine: 40 },
      endSpot: { side: "home", yardLine: 44 }
    }),
    makeTimelineItem({
      sequence: "2",
      possession: "home",
      downBeforePlay: 3,
      distanceBeforePlay: 8,
      playType: "run",
      runKind: "scramble",
      previousSpot: { side: "home", yardLine: 44 },
      endSpot: { side: "home", yardLine: 43 }
    }),
    makeTimelineItem({
      sequence: "3",
      possession: "home",
      downBeforePlay: 4,
      distanceBeforePlay: 2,
      playType: "pass",
      firstDownAchieved: true,
      previousSpot: { side: "home", yardLine: 43 },
      endSpot: { side: "home", yardLine: 46 }
    }),
    makeTimelineItem({
      sequence: "4",
      possession: "home",
      downBeforePlay: 4,
      distanceBeforePlay: 9,
      playType: "sack",
      previousSpot: { side: "home", yardLine: 46 },
      endSpot: { side: "home", yardLine: 39 }
    })
  ];

  const [thirdDown, fourthDown] = buildMoneyDownCallTendency(timeline);
  assert.ok(thirdDown);
  assert.ok(fourthDown);

  assert.equal(thirdDown.attempts, 2);
  assert.equal(thirdDown.runCalls, 1);
  assert.equal(thirdDown.scrambleCalls, 1);
  assert.equal(thirdDown.conversions, 1);
  assert.equal(thirdDown.conversionRate, 50);

  assert.equal(fourthDown.attempts, 2);
  assert.equal(fourthDown.passCalls, 1);
  assert.equal(fourthDown.sackCalls, 1);
  assert.equal(fourthDown.conversions, 1);
  assert.equal(fourthDown.conversionRate, 50);
});
