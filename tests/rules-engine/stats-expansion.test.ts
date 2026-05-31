import assert from "node:assert/strict";
import test from "node:test";
import { finalizePlay, rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { creditKey, participant, play, playerCredit, playerIds, position, state } from "./helpers";

test("participant creditShare applies weighted player credit for shared sacks", () => {
  const result = finalizePlay(
    state({
      possession: "home",
      down: 2,
      distance: 8,
      ballOn: position("home", 40),
      sequenceApplied: "500"
    }),
    play({
      sequence: "501",
      quarter: 4,
      clockSeconds: 70,
      possession: "home",
      playType: "sack",
      payload: {
        kind: "sack",
        quarterbackNumber: "18",
        yardsLost: 6
      },
      participants: [
        participant(playerIds.alb52, "sack_credit", "away", 1, 0.5),
        participant(playerIds.adb7, "sack_credit", "away", 1, 0.5)
      ]
    })
  );

  const sackCredits = result.statCredits
    .filter((credit) => credit.stat === "sack" && credit.scope === "player")
    .map(creditKey)
    .sort();

  assert.deepEqual(
    sackCredits,
    [
      playerCredit("away", playerIds.adb7, "sack", 0.5),
      playerCredit("away", playerIds.alb52, "sack", 0.5)
    ].sort()
  );
});

test("team stats track first-down type and total offense from rushing conversion", () => {
  const projection = rebuildFromPlayLog(
    [
      play({
        sequence: "601",
        quarter: 1,
        clockSeconds: 700,
        possession: "home",
        playType: "run",
        payload: {
          kind: "run",
          ballCarrierNumber: "34",
          runKind: "designed",
          yards: 6,
          firstDown: true
        },
        participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
      })
    ],
    {
      seedState: state({
        down: 2,
        distance: 5,
        ballOn: position("home", 30),
        sequenceApplied: "600"
      })
    }
  );

  assert.equal(projection.stats.teamTotals.home.first_down, 1);
  assert.equal(projection.stats.teamTotals.home.first_down_rush, 1);
  assert.equal(projection.stats.teamTotals.home.total_offense_yards, 6);
});

test("team stats track first-down-by-penalty plus penalty totals", () => {
  const projection = rebuildFromPlayLog(
    [
      play({
        sequence: "701",
        quarter: 2,
        clockSeconds: 420,
        possession: "home",
        playType: "pass",
        payload: {
          kind: "pass",
          passerNumber: "18",
          targetNumber: "5",
          result: "incomplete",
          yards: 0
        },
        participants: [
          participant(playerIds.hqb18, "passer", "home"),
          participant(playerIds.hwr5, "target", "home")
        ],
        penalties: [
          {
            penalizedSide: "away",
            code: "roughing_passer",
            yards: 15,
            result: "accepted",
            enforcementType: "previous_spot",
            timing: "dead_ball",
            automaticFirstDown: true,
            lossOfDown: false,
            replayDown: false,
            noPlay: false
          }
        ]
      })
    ],
    {
      seedState: state({
        down: 3,
        distance: 12,
        ballOn: position("home", 33),
        sequenceApplied: "700"
      })
    }
  );

  assert.equal(projection.stats.teamTotals.home.first_down, 1);
  assert.equal(projection.stats.teamTotals.home.first_down_penalty, 1);
  assert.equal(projection.stats.teamTotals.away.penalty_count, 1);
  assert.equal(projection.stats.teamTotals.away.penalty_yards, 15);
});

test("team stats track fourth-down attempts and conversions", () => {
  const projection = rebuildFromPlayLog(
    [
      play({
        sequence: "801",
        quarter: 3,
        clockSeconds: 355,
        possession: "home",
        playType: "run",
        payload: {
          kind: "run",
          ballCarrierNumber: "34",
          runKind: "designed",
          yards: 3,
          firstDown: true
        },
        participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
      })
    ],
    {
      seedState: state({
        down: 4,
        distance: 2,
        ballOn: position("home", 45),
        sequenceApplied: "800"
      })
    }
  );

  assert.equal(projection.stats.teamTotals.home.fourth_down_attempt, 1);
  assert.equal(projection.stats.teamTotals.home.fourth_down_conversion, 1);
});
