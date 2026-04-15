import test from "node:test";
import assert from "node:assert/strict";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { buildDriveSummaries } from "@/lib/game-day/snapshot";
import { participant, play, playerIds } from "./helpers";

test("drive summaries group a touchdown drive and the following opponent drive", () => {
  const playLog = [
    play({
      sequence: "101",
      quarter: 1,
      clockSeconds: 708,
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 6 },
      participants: [
        participant(playerIds.hrb34, "ball_carrier", "home"),
        participant(playerIds.alb52, "solo_tackle", "away")
      ]
    }),
    play({
      sequence: "102",
      quarter: 1,
      clockSeconds: 695,
      possession: "home",
      playType: "pass",
      payload: { kind: "pass", passerNumber: "18", targetNumber: "5", result: "complete", yards: 69, touchdown: true },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    }),
    play({
      sequence: "103",
      quarter: 1,
      clockSeconds: 695,
      possession: "home",
      playType: "extra_point",
      payload: { kind: "extra_point", kickerNumber: "3", result: "good" },
      participants: [participant(playerIds.hk3, "kicker", "home")]
    }),
    play({
      sequence: "104",
      quarter: 1,
      clockSeconds: 695,
      possession: "home",
      playType: "kickoff",
      payload: { kind: "kickoff", kickerNumber: "3", kickDistance: 60, returnYards: 20, result: "returned" },
      participants: [
        participant(playerIds.hk3, "kicker", "home"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    play({
      sequence: "105",
      quarter: 1,
      clockSeconds: 680,
      possession: "away",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "2", runKind: "designed", yards: 5 },
      participants: [
        participant(playerIds.aret2, "ball_carrier", "away"),
        participant(playerIds.alb52, "assist_tackle", "home")
      ]
    })
  ];

  const projection = rebuildFromPlayLog(playLog);
  const drives = buildDriveSummaries(projection.timeline);

  assert.equal(drives.length, 2);
  assert.equal(drives[1]?.side, "home");
  assert.equal(drives[1]?.result, "touchdown");
  assert.equal(drives[1]?.playCount, 2);
  assert.equal(drives[0]?.side, "away");
  assert.equal(drives[0]?.result, "in_progress");
});

test("drive summaries recognize punts and turnovers as end-of-drive outcomes", () => {
  const puntProjection = rebuildFromPlayLog([
    play({
      sequence: "201",
      quarter: 2,
      clockSeconds: 500,
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 2 },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
    }),
    play({
      sequence: "202",
      quarter: 2,
      clockSeconds: 489,
      possession: "home",
      playType: "punt",
      payload: { kind: "punt", punterNumber: "7", puntDistance: 40, result: "fair_catch" },
      participants: [participant(playerIds.hp7, "punter", "home")]
    })
  ]);

  const turnoverProjection = rebuildFromPlayLog([
    play({
      sequence: "301",
      quarter: 3,
      clockSeconds: 360,
      possession: "home",
      playType: "pass",
      payload: { kind: "pass", passerNumber: "18", targetNumber: "5", result: "complete", yards: 8 },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    }),
    play({
      sequence: "302",
      quarter: 3,
      clockSeconds: 349,
      possession: "home",
      playType: "turnover",
      payload: {
        kind: "turnover",
        turnoverKind: "interception_return",
        returnerNumber: "2",
        returnYards: 20
      },
      participants: [
        participant(playerIds.adb7, "interceptor", "away"),
        participant(playerIds.aret2, "returner", "away")
      ]
    })
  ]);

  const puntDrives = buildDriveSummaries(puntProjection.timeline);
  const turnoverDrives = buildDriveSummaries(turnoverProjection.timeline);

  assert.equal(puntDrives[0]?.result, "punt");
  assert.equal(turnoverDrives[0]?.result, "turnover");
});
