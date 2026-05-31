import assert from "node:assert/strict";
import test from "node:test";
import { rebuildFromPlayLog } from "../../src/lib/engine/rebuild";
import { buildGameDaySnapshot } from "../../src/lib/game-day/snapshot";
import { buildCanonicalGameReportDocument } from "../../src/lib/reports/document";
import { ruleEngineScenarios } from "./fixtures";
import { playerIds } from "./helpers";

const goldenScenarioNames = [
  "Inside run for 6 on 1st down",
  "Completion converts 3rd-and-9",
  "Passing touchdown moves game to try phase",
  "Good extra point moves game to kickoff phase",
  "Kickoff touchback places ball at receiving 25",
  "Post-possession foul after interception return backs up the new offense",
  "Touchdown plus post-score foul moves try spot back",
  "Good extra point plus post-score foul moves kickoff spot back",
  "Intentional grounding applies loss of down"
];

test("golden game fixture: projection and situational summary stay stable", () => {
  const playLog = goldenScenarioNames.map((name) => {
    const scenario = ruleEngineScenarios.find((item) => item.name === name);
    assert.ok(scenario, `Missing scenario: ${name}`);
    return scenario.inputPlay;
  });

  const projection = rebuildFromPlayLog(playLog);
  const snapshot = buildGameDaySnapshot({
    gameId: "golden-game",
    revision: playLog.length,
    status: "in_progress",
    lastRebuiltAt: "2026-05-30T00:00:00.000Z",
    homeTeam: "Home",
    awayTeam: "Away",
    rosters: {
      home: [
        { id: playerIds.hqb18, side: "home", jerseyNumber: "18", displayName: "Home QB" },
        { id: playerIds.hrb34, side: "home", jerseyNumber: "34", displayName: "Home RB" },
        { id: playerIds.hwr5, side: "home", jerseyNumber: "5", displayName: "Home WR" },
        { id: playerIds.hk3, side: "home", jerseyNumber: "3", displayName: "Home K" }
      ],
      away: [
        { id: playerIds.alb52, side: "away", jerseyNumber: "52", displayName: "Away LB" },
        { id: playerIds.adb7, side: "away", jerseyNumber: "7", displayName: "Away DB" },
        { id: playerIds.aret2, side: "away", jerseyNumber: "2", displayName: "Away RET" }
      ]
    },
    projection,
    playReviews: []
  });

  const report = buildCanonicalGameReportDocument({
    gameId: "golden-game",
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

  const actual = {
    playCount: playLog.length,
    currentState: projection.currentState,
    teamTotals: projection.stats.teamTotals,
    playerTotals: projection.stats.playerTotals,
    situationalSummary: report.situational.summary,
    situationalDownDistance: report.situational.byDownDistance,
    situationalPlayFamily: report.situational.byPlayFamily,
    driveSummaries: snapshot.driveSummaries.map((drive) => ({
      side: drive.side,
      quarter: drive.quarter,
      playCount: drive.playCount,
      yardsGained: drive.yardsGained,
      result: drive.result
    }))
  };

  const expected = {
    playCount: 9,
    currentState: {
      quarter: 4,
      clockSeconds: 77,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: {
        side: "home",
        yardLine: 10
      },
      score: {
        home: 14,
        away: 0
      },
      sequenceApplied: "404"
    },
    teamTotals: {
      home: {
        rushing_attempt: 2,
        rushing_yards: 10,
        passing_attempt: 2,
        passing_completion: 2,
        passing_yards: 30,
        passing_touchdown: 1,
        team_points: 14,
        extra_point_attempt: 2,
        extra_point_made: 2,
        kickoff: 1,
        kick_yards: 65,
        rushing_touchdown: 1,
        total_offense_yards: 40,
        first_down: 1,
        first_down_pass: 1,
        turnover_lost: 1,
        penalty_count: 3,
        penalty_yards: 40
      },
      away: {
        solo_tackle: 1,
        interception: 1,
        return_yards: 20,
        turnover_gained: 1,
        penalty_count: 1,
        penalty_yards: 15
      }
    },
    playerTotals: {
      "home-rb34": {
        rushing_attempt: 2,
        rushing_yards: 10,
        rushing_touchdown: 1
      },
      "away-lb52": {
        solo_tackle: 1
      },
      "home-qb18": {
        passing_attempt: 2,
        passing_completion: 2,
        passing_yards: 30,
        passing_touchdown: 1
      },
      "home-wr5": {
        receiving_target: 2,
        receiving_reception: 2,
        receiving_yards: 30,
        receiving_touchdown: 1
      },
      "home-k3": {
        extra_point_attempt: 2,
        extra_point_made: 2,
        kickoff: 1,
        kick_yards: 65
      },
      "away-db7": {
        interception: 1
      },
      "away-ret2": {
        return_yards: 20
      }
    },
    situationalSummary: {
      totalSituationalPlays: 9,
      explosivePlayRate: 33.3,
      overallSuccessRate: 77.8,
      runRate: 22.2,
      passRate: 22.2
    },
    situationalDownDistance: [
      {
        key: "short_1_3",
        plays: 1,
        runs: 0,
        passes: 0,
        yards: 0,
        firstDowns: 1,
        touchdowns: 1,
        turnovers: 0,
        explosivePlays: 1,
        successfulPlays: 1,
        successRate: 100,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: 0
      },
      {
        key: "medium_4_6",
        plays: 1,
        runs: 0,
        passes: 1,
        yards: 12,
        firstDowns: 1,
        touchdowns: 0,
        turnovers: 0,
        explosivePlays: 0,
        successfulPlays: 1,
        successRate: 100,
        runRate: 0,
        passRate: 100,
        yardsPerPlay: 12
      },
      {
        key: "long_7_10",
        plays: 6,
        runs: 2,
        passes: 1,
        yards: 48,
        firstDowns: 2,
        touchdowns: 2,
        turnovers: 2,
        explosivePlays: 1,
        successfulPlays: 4,
        successRate: 66.7,
        runRate: 33.3,
        passRate: 16.7,
        yardsPerPlay: 8
      },
      {
        key: "very_long_11_plus",
        plays: 1,
        runs: 0,
        passes: 0,
        yards: 0,
        firstDowns: 1,
        touchdowns: 1,
        turnovers: 0,
        explosivePlays: 1,
        successfulPlays: 1,
        successRate: 100,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: 0
      }
    ],
    situationalPlayFamily: [
      {
        key: "run",
        plays: 2,
        runs: 2,
        passes: 0,
        yards: 10,
        firstDowns: 1,
        touchdowns: 1,
        turnovers: 0,
        explosivePlays: 0,
        successfulPlays: 2,
        successRate: 100,
        runRate: 100,
        passRate: 0,
        yardsPerPlay: 5
      },
      {
        key: "pass",
        plays: 2,
        runs: 0,
        passes: 2,
        yards: 30,
        firstDowns: 2,
        touchdowns: 1,
        turnovers: 0,
        explosivePlays: 1,
        successfulPlays: 2,
        successRate: 100,
        runRate: 0,
        passRate: 100,
        yardsPerPlay: 15
      },
      {
        key: "special_teams",
        plays: 3,
        runs: 0,
        passes: 0,
        yards: 40,
        firstDowns: 2,
        touchdowns: 2,
        turnovers: 1,
        explosivePlays: 2,
        successfulPlays: 3,
        successRate: 100,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: 13.33
      },
      {
        key: "turnover",
        plays: 1,
        runs: 0,
        passes: 0,
        yards: -20,
        firstDowns: 0,
        touchdowns: 0,
        turnovers: 1,
        explosivePlays: 0,
        successfulPlays: 0,
        successRate: 0,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: -20
      },
      {
        key: "penalty",
        plays: 1,
        runs: 0,
        passes: 0,
        yards: 0,
        firstDowns: 0,
        touchdowns: 0,
        turnovers: 0,
        explosivePlays: 0,
        successfulPlays: 0,
        successRate: 0,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: 0
      },
      {
        key: "other",
        plays: 0,
        runs: 0,
        passes: 0,
        yards: 0,
        firstDowns: 0,
        touchdowns: 0,
        turnovers: 0,
        explosivePlays: 0,
        successfulPlays: 0,
        successRate: 0,
        runRate: 0,
        passRate: 0,
        yardsPerPlay: 0
      }
    ],
    driveSummaries: [
      {
        side: "home",
        quarter: 4,
        playCount: 1,
        yardsGained: -10,
        result: "in_progress"
      },
      {
        side: "home",
        quarter: 4,
        playCount: 1,
        yardsGained: 12,
        result: "touchdown"
      },
      {
        side: "home",
        quarter: 4,
        playCount: 1,
        yardsGained: -5,
        result: "turnover"
      },
      {
        side: "home",
        quarter: 1,
        playCount: 3,
        yardsGained: 62,
        result: "touchdown"
      }
    ]
  };

  assert.deepEqual(actual, expected);
});
