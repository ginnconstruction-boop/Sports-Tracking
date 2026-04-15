import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalGameReportDocument } from "@/lib/reports/document";
import { buildGameDaySnapshot } from "@/lib/game-day/snapshot";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { participant, play, playerIds } from "./rules-engine/helpers";

test("canonical game report stays aligned with the rebuilt play log projection", () => {
  const playLog = [
    play({
      sequence: "1",
      quarter: 1,
      clockSeconds: 710,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 6
      },
      summary: "#34 run for 6",
      participants: [
        participant(playerIds.hrb34, "ball_carrier", "home"),
        participant(playerIds.alb52, "solo_tackle", "away")
      ]
    }),
    play({
      sequence: "2",
      quarter: 1,
      clockSeconds: 699,
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "complete",
        yards: 24,
        touchdown: true
      },
      summary: "#18 to #5 for 24 and a touchdown",
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    })
  ];

  const projection = rebuildFromPlayLog(playLog);
  const snapshot = buildGameDaySnapshot({
    gameId: "game-1",
    revision: 2,
    status: "in_progress",
    lastRebuiltAt: "2026-04-14T12:00:00.000Z",
    homeTeam: "Home",
    awayTeam: "Away",
    rosters: {
      home: [
        { id: playerIds.hqb18, side: "home", jerseyNumber: "18", displayName: "Evan Reed" },
        { id: playerIds.hrb34, side: "home", jerseyNumber: "34", displayName: "Marcus Cole" },
        { id: playerIds.hwr5, side: "home", jerseyNumber: "5", displayName: "Dylan Shaw" }
      ],
      away: [{ id: playerIds.alb52, side: "away", jerseyNumber: "52", displayName: "Jon Price" }]
    },
    projection,
    playReviews: []
  });

  const report = buildCanonicalGameReportDocument({
    gameId: "game-1",
    reportType: "game_report",
    snapshot,
    projection,
    context: {
      status: "in_progress",
      homeTeam: "Home",
      awayTeam: "Away",
      venueLabel: "Main Field"
    },
    branding: null
  });

  assert.deepEqual(report.currentState, projection.currentState);
  assert.deepEqual(report.teamStats, snapshot.teamStats);
  assert.deepEqual(report.playerStats, snapshot.playerStats);
  assert.equal(report.scoringSummary.length, 1);
  assert.equal(report.scoringSummary[0]?.result.play.id, "play-2");
  assert.equal(report.finalSummary.totalPlays, projection.timeline.length);
  assert.equal(report.finalSummary.totalDrives, snapshot.driveSummaries.length);
  assert.deepEqual(report.stats, projection.stats);
});
