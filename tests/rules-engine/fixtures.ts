import type { DerivedGameState } from "../../src/lib/domain/game-state";
import type { PlayRecord } from "../../src/lib/domain/play-log";
import type { ExpectedCredit } from "./helpers";
import {
  participant,
  penalty,
  play,
  playerCredit,
  playerIds,
  position,
  state,
  teamCredit
} from "./helpers";

export type RuleEngineScenario = {
  name: string;
  startingState: DerivedGameState;
  inputPlay: PlayRecord;
  expectedFinalState: DerivedGameState;
  expectedStatCredits: ExpectedCredit[];
};

export const ruleEngineScenarios: RuleEngineScenario[] = [
  {
    name: "Inside run for 6 on 1st down",
    startingState: state({
      quarter: 1,
      clockSeconds: 720,
      phase: "normal",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 25),
      score: { home: 0, away: 0 },
      sequenceApplied: "100"
    }),
    inputPlay: play({
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
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 708,
      phase: "normal",
      possession: "home",
      down: 2,
      distance: 4,
      ballOn: position("home", 31),
      score: { home: 0, away: 0 },
      sequenceApplied: "101"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 6),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 6),
      playerCredit("away", playerIds.alb52, "solo_tackle", 1)
    ]
  },
  {
    name: "Run stopped for 3-yard loss",
    startingState: state({
      quarter: 1,
      clockSeconds: 688,
      phase: "normal",
      possession: "home",
      down: 2,
      distance: 8,
      ballOn: position("home", 32),
      score: { home: 0, away: 0 },
      sequenceApplied: "101"
    }),
    inputPlay: play({
      sequence: "102",
      quarter: 1,
      clockSeconds: 676,
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: -3 },
      participants: [
        participant(playerIds.hrb34, "ball_carrier", "home"),
        participant(playerIds.alb52, "solo_tackle", "away"),
        participant(playerIds.alb52, "tfl_credit", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 676,
      phase: "normal",
      possession: "home",
      down: 3,
      distance: 11,
      ballOn: position("home", 29),
      score: { home: 0, away: 0 },
      sequenceApplied: "102"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", -3),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", -3),
      playerCredit("away", playerIds.alb52, "solo_tackle", 1),
      playerCredit("away", playerIds.alb52, "tfl", 1)
    ]
  },
  {
    name: "Run gains first down across midfield",
    startingState: state({
      quarter: 1,
      clockSeconds: 640,
      possession: "home",
      down: 2,
      distance: 7,
      ballOn: position("home", 42),
      score: { home: 0, away: 0 },
      sequenceApplied: "102"
    }),
    inputPlay: play({
      sequence: "103",
      quarter: 1,
      clockSeconds: 628,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 9,
        firstDown: true
      },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 628,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("away", 49),
      score: { home: 0, away: 0 },
      sequenceApplied: "103"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 9),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 9)
    ]
  },
  {
    name: "Run fumble lost changes possession at the end spot",
    startingState: state({
      quarter: 1,
      clockSeconds: 622,
      possession: "home",
      down: 2,
      distance: 6,
      ballOn: position("home", 40),
      score: { home: 0, away: 0 },
      sequenceApplied: "103a"
    }),
    inputPlay: play({
      sequence: "103b",
      quarter: 1,
      clockSeconds: 614,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 5,
        fumble: true,
        fumbleLost: true
      },
      participants: [
        participant(playerIds.hrb34, "ball_carrier", "home"),
        participant(playerIds.alb52, "forced_fumble", "away"),
        participant(playerIds.adb7, "fumble_recovery", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 614,
      phase: "normal",
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("home", 45),
      score: { home: 0, away: 0 },
      sequenceApplied: "103b"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 5),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 5),
      playerCredit("away", playerIds.alb52, "forced_fumble", 1),
      playerCredit("away", playerIds.adb7, "fumble_recovery", 1)
    ]
  },
  {
    name: "QB scramble converts 3rd-and-4",
    startingState: state({
      quarter: 1,
      clockSeconds: 600,
      possession: "home",
      down: 3,
      distance: 4,
      ballOn: position("home", 45),
      score: { home: 0, away: 0 },
      sequenceApplied: "103"
    }),
    inputPlay: play({
      sequence: "104",
      quarter: 1,
      clockSeconds: 589,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "18",
        runKind: "scramble",
        yards: 6,
        firstDown: true
      },
      participants: [participant(playerIds.hqb18, "ball_carrier", "home")]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 589,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("away", 49),
      score: { home: 0, away: 0 },
      sequenceApplied: "104"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 6),
      playerCredit("home", playerIds.hqb18, "rushing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "rushing_yards", 6)
    ]
  },
  {
    name: "Incomplete pass on 2nd down",
    startingState: state({
      quarter: 1,
      clockSeconds: 560,
      possession: "home",
      down: 2,
      distance: 7,
      ballOn: position("home", 33),
      score: { home: 0, away: 0 },
      sequenceApplied: "104"
    }),
    inputPlay: play({
      sequence: "105",
      quarter: 1,
      clockSeconds: 553,
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
        participant(playerIds.hwr5, "target", "home"),
        participant(playerIds.adb7, "pass_breakup", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 553,
      possession: "home",
      down: 3,
      distance: 7,
      ballOn: position("home", 33),
      score: { home: 0, away: 0 },
      sequenceApplied: "105"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1),
      playerCredit("away", playerIds.adb7, "pass_breakup", 1)
    ]
  },
  {
    name: "Short completion leaves 3rd-and-2",
    startingState: state({
      quarter: 1,
      clockSeconds: 530,
      possession: "home",
      down: 2,
      distance: 10,
      ballOn: position("home", 30),
      score: { home: 0, away: 0 },
      sequenceApplied: "105"
    }),
    inputPlay: play({
      sequence: "106",
      quarter: 1,
      clockSeconds: 519,
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "complete",
        yards: 8
      },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home"),
        participant(playerIds.alb52, "solo_tackle", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 519,
      possession: "home",
      down: 3,
      distance: 2,
      ballOn: position("home", 38),
      score: { home: 0, away: 0 },
      sequenceApplied: "106"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      teamCredit("home", "passing_completion", 1),
      teamCredit("home", "passing_yards", 8),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_completion", 1),
      playerCredit("home", playerIds.hqb18, "passing_yards", 8),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1),
      playerCredit("home", playerIds.hwr5, "receiving_reception", 1),
      playerCredit("home", playerIds.hwr5, "receiving_yards", 8),
      playerCredit("away", playerIds.alb52, "solo_tackle", 1)
    ]
  },
  {
    name: "Completion converts 3rd-and-9",
    startingState: state({
      quarter: 1,
      clockSeconds: 500,
      possession: "home",
      down: 3,
      distance: 9,
      ballOn: position("home", 37),
      score: { home: 0, away: 0 },
      sequenceApplied: "106"
    }),
    inputPlay: play({
      sequence: "107",
      quarter: 1,
      clockSeconds: 489,
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "complete",
        yards: 12,
        firstDown: true
      },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 489,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 49),
      score: { home: 0, away: 0 },
      sequenceApplied: "107"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      teamCredit("home", "passing_completion", 1),
      teamCredit("home", "passing_yards", 12),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_completion", 1),
      playerCredit("home", playerIds.hqb18, "passing_yards", 12),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1),
      playerCredit("home", playerIds.hwr5, "receiving_reception", 1),
      playerCredit("home", playerIds.hwr5, "receiving_yards", 12)
    ]
  },
  {
    name: "Pass interception carries return yards into the next spot",
    startingState: state({
      quarter: 1,
      clockSeconds: 472,
      possession: "home",
      down: 2,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 0, away: 0 },
      sequenceApplied: "107a"
    }),
    inputPlay: play({
      sequence: "107b",
      quarter: 1,
      clockSeconds: 465,
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "interception",
        yards: 0,
        returnYards: 18
      },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home"),
        participant(playerIds.adb7, "interceptor", "away"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 465,
      phase: "normal",
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("home", 17),
      score: { home: 0, away: 0 },
      sequenceApplied: "107b"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      teamCredit("home", "interception_thrown", 1),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "interception_thrown", 1),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1),
      playerCredit("away", playerIds.adb7, "interception", 1),
      playerCredit("away", playerIds.aret2, "return_yards", 18)
    ]
  },
  {
    name: "Sack creates 4th-and-long",
    startingState: state({
      quarter: 1,
      clockSeconds: 460,
      possession: "home",
      down: 3,
      distance: 6,
      ballOn: position("home", 40),
      score: { home: 0, away: 0 },
      sequenceApplied: "107"
    }),
    inputPlay: play({
      sequence: "108",
      quarter: 1,
      clockSeconds: 451,
      possession: "home",
      playType: "sack",
      payload: { kind: "sack", quarterbackNumber: "18", yardsLost: 7 },
      participants: [
        participant(playerIds.alb52, "sack_credit", "away"),
        participant(playerIds.alb52, "solo_tackle", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 451,
      possession: "home",
      down: 4,
      distance: 13,
      ballOn: position("home", 33),
      score: { home: 0, away: 0 },
      sequenceApplied: "108"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      playerCredit("away", playerIds.alb52, "sack", 1),
      playerCredit("away", playerIds.alb52, "solo_tackle", 1)
    ]
  },
  {
    name: "Sack-fumble lost changes possession",
    startingState: state({
      quarter: 1,
      clockSeconds: 430,
      possession: "home",
      down: 2,
      distance: 8,
      ballOn: position("home", 45),
      score: { home: 0, away: 0 },
      sequenceApplied: "108"
    }),
    inputPlay: play({
      sequence: "109",
      quarter: 1,
      clockSeconds: 419,
      possession: "home",
      playType: "sack",
      payload: {
        kind: "sack",
        quarterbackNumber: "18",
        yardsLost: 6,
        fumble: true,
        fumbleLost: true
      },
      participants: [
        participant(playerIds.alb52, "sack_credit", "away"),
        participant(playerIds.alb52, "forced_fumble", "away"),
        participant(playerIds.adb7, "fumble_recovery", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 419,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("home", 39),
      score: { home: 0, away: 0 },
      sequenceApplied: "109"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      playerCredit("away", playerIds.alb52, "sack", 1),
      playerCredit("away", playerIds.alb52, "forced_fumble", 1),
      playerCredit("away", playerIds.adb7, "fumble_recovery", 1)
    ]
  },
  {
    name: "Rushing touchdown moves game to try phase",
    startingState: state({
      quarter: 1,
      clockSeconds: 180,
      possession: "home",
      down: 1,
      distance: 4,
      ballOn: position("away", 4),
      score: { home: 0, away: 0 },
      sequenceApplied: "109"
    }),
    inputPlay: play({
      sequence: "110",
      quarter: 1,
      clockSeconds: 171,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 4,
        touchdown: true
      },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
    }),
    expectedFinalState: state({
      quarter: 1,
      clockSeconds: 171,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 6, away: 0 },
      sequenceApplied: "110"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 4),
      teamCredit("home", "rushing_touchdown", 1),
      teamCredit("home", "team_points", 6),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 4),
      playerCredit("home", playerIds.hrb34, "rushing_touchdown", 1)
    ]
  },
  {
    name: "Passing touchdown moves game to try phase",
    startingState: state({
      quarter: 2,
      clockSeconds: 612,
      possession: "home",
      down: 2,
      distance: 10,
      ballOn: position("away", 18),
      score: { home: 6, away: 7 },
      sequenceApplied: "200"
    }),
    inputPlay: play({
      sequence: "201",
      quarter: 2,
      clockSeconds: 603,
      possession: "home",
      playType: "pass",
      payload: {
        kind: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "complete",
        yards: 18,
        touchdown: true
      },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 603,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 12, away: 7 },
      sequenceApplied: "201"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      teamCredit("home", "passing_completion", 1),
      teamCredit("home", "passing_yards", 18),
      teamCredit("home", "passing_touchdown", 1),
      teamCredit("home", "team_points", 6),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_completion", 1),
      playerCredit("home", playerIds.hqb18, "passing_yards", 18),
      playerCredit("home", playerIds.hqb18, "passing_touchdown", 1),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1),
      playerCredit("home", playerIds.hwr5, "receiving_reception", 1),
      playerCredit("home", playerIds.hwr5, "receiving_yards", 18),
      playerCredit("home", playerIds.hwr5, "receiving_touchdown", 1)
    ]
  },
  {
    name: "Good extra point moves game to kickoff phase",
    startingState: state({
      quarter: 2,
      clockSeconds: 603,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 12, away: 7 },
      sequenceApplied: "201"
    }),
    inputPlay: play({
      sequence: "202",
      quarter: 2,
      clockSeconds: 603,
      possession: "home",
      playType: "extra_point",
      payload: { kind: "extra_point", kickerNumber: "3", result: "good" },
      participants: [participant(playerIds.hk3, "kicker", "home")]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 603,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 13, away: 7 },
      sequenceApplied: "202"
    }),
    expectedStatCredits: [
      teamCredit("home", "extra_point_attempt", 1),
      teamCredit("home", "extra_point_made", 1),
      teamCredit("home", "team_points", 1),
      playerCredit("home", playerIds.hk3, "extra_point_attempt", 1),
      playerCredit("home", playerIds.hk3, "extra_point_made", 1)
    ]
  },
  {
    name: "Blocked extra point still moves to kickoff",
    startingState: state({
      quarter: 2,
      clockSeconds: 603,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 6, away: 0 },
      sequenceApplied: "110"
    }),
    inputPlay: play({
      sequence: "111",
      quarter: 2,
      clockSeconds: 603,
      possession: "home",
      playType: "extra_point",
      payload: { kind: "extra_point", kickerNumber: "3", result: "blocked" },
      participants: [
        participant(playerIds.hk3, "kicker", "home"),
        participant(playerIds.alb52, "block_credit", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 603,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 6, away: 0 },
      sequenceApplied: "111"
    }),
    expectedStatCredits: [
      teamCredit("home", "extra_point_attempt", 1),
      playerCredit("home", playerIds.hk3, "extra_point_attempt", 1)
    ]
  },
  {
    name: "Good two-point try moves to kickoff",
    startingState: state({
      quarter: 2,
      clockSeconds: 450,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 20, away: 14 },
      sequenceApplied: "250"
    }),
    inputPlay: play({
      sequence: "251",
      quarter: 2,
      clockSeconds: 450,
      possession: "home",
      playType: "two_point_try",
      payload: { kind: "two_point_try", playStyle: "run", ballCarrierNumber: "34", result: "good" },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 450,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 22, away: 14 },
      sequenceApplied: "251"
    }),
    expectedStatCredits: [
      teamCredit("home", "two_point_attempt", 1),
      teamCredit("home", "two_point_made", 1),
      teamCredit("home", "team_points", 2)
    ]
  },
  {
    name: "Failed two-point try still moves to kickoff",
    startingState: state({
      quarter: 2,
      clockSeconds: 450,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 20, away: 14 },
      sequenceApplied: "250"
    }),
    inputPlay: play({
      sequence: "252",
      quarter: 2,
      clockSeconds: 450,
      possession: "home",
      playType: "two_point_try",
      payload: {
        kind: "two_point_try",
        playStyle: "pass",
        passerNumber: "18",
        targetNumber: "5",
        result: "failed"
      },
      participants: [
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.hwr5, "target", "home")
      ]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 450,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 20, away: 14 },
      sequenceApplied: "252"
    }),
    expectedStatCredits: [teamCredit("home", "two_point_attempt", 1)]
  },
  {
    name: "Good field goal adds 3 and moves to kickoff",
    startingState: state({
      quarter: 2,
      clockSeconds: 120,
      possession: "home",
      down: 4,
      distance: 7,
      ballOn: position("away", 22),
      score: { home: 10, away: 10 },
      sequenceApplied: "260"
    }),
    inputPlay: play({
      sequence: "261",
      quarter: 2,
      clockSeconds: 115,
      possession: "home",
      playType: "field_goal",
      payload: { kind: "field_goal", kickerNumber: "3", kickDistance: 39, result: "good" },
      participants: [participant(playerIds.hk3, "kicker", "home")]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 115,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 13, away: 10 },
      sequenceApplied: "261"
    }),
    expectedStatCredits: [
      teamCredit("home", "field_goal_attempt", 1),
      teamCredit("home", "field_goal_made", 1),
      teamCredit("home", "team_points", 3),
      playerCredit("home", playerIds.hk3, "field_goal_attempt", 1),
      playerCredit("home", playerIds.hk3, "field_goal_made", 1)
    ]
  },
  {
    name: "Missed field goal gives defense the ball at the spot",
    startingState: state({
      quarter: 2,
      clockSeconds: 90,
      possession: "home",
      down: 4,
      distance: 9,
      ballOn: position("away", 28),
      score: { home: 13, away: 10 },
      sequenceApplied: "261"
    }),
    inputPlay: play({
      sequence: "262",
      quarter: 2,
      clockSeconds: 84,
      possession: "home",
      playType: "field_goal",
      payload: { kind: "field_goal", kickerNumber: "3", kickDistance: 45, result: "no_good" },
      participants: [participant(playerIds.hk3, "kicker", "home")]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 84,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("away", 28),
      score: { home: 13, away: 10 },
      sequenceApplied: "262"
    }),
    expectedStatCredits: [
      teamCredit("home", "field_goal_attempt", 1),
      playerCredit("home", playerIds.hk3, "field_goal_attempt", 1)
    ]
  },
  {
    name: "Punt with fair catch flips field",
    startingState: state({
      quarter: 3,
      clockSeconds: 720,
      possession: "home",
      down: 4,
      distance: 12,
      ballOn: position("home", 30),
      score: { home: 13, away: 10 },
      sequenceApplied: "300"
    }),
    inputPlay: play({
      sequence: "301",
      quarter: 3,
      clockSeconds: 711,
      possession: "home",
      playType: "punt",
      payload: { kind: "punt", punterNumber: "7", puntDistance: 40, result: "fair_catch" },
      participants: [participant(playerIds.hp7, "punter", "home")]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 711,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("away", 30),
      score: { home: 13, away: 10 },
      sequenceApplied: "301"
    }),
    expectedStatCredits: [
      teamCredit("home", "punt", 1),
      teamCredit("home", "punt_yards", 40),
      playerCredit("home", playerIds.hp7, "punt", 1),
      playerCredit("home", playerIds.hp7, "punt_yards", 40)
    ]
  },
  {
    name: "Punt with 10-yard return",
    startingState: state({
      quarter: 3,
      clockSeconds: 690,
      possession: "home",
      down: 4,
      distance: 8,
      ballOn: position("home", 20),
      score: { home: 13, away: 10 },
      sequenceApplied: "301"
    }),
    inputPlay: play({
      sequence: "302",
      quarter: 3,
      clockSeconds: 679,
      possession: "home",
      playType: "punt",
      payload: {
        kind: "punt",
        punterNumber: "7",
        puntDistance: 45,
        returnYards: 10,
        result: "returned"
      },
      participants: [
        participant(playerIds.hp7, "punter", "home"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 679,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("away", 45),
      score: { home: 13, away: 10 },
      sequenceApplied: "302"
    }),
    expectedStatCredits: [
      teamCredit("home", "punt", 1),
      teamCredit("home", "punt_yards", 45),
      playerCredit("home", playerIds.hp7, "punt", 1),
      playerCredit("home", playerIds.hp7, "punt_yards", 45),
      playerCredit("away", playerIds.aret2, "return_yards", 10)
    ]
  },
  {
    name: "Kickoff return starts opponent drive",
    startingState: state({
      quarter: 3,
      clockSeconds: 679,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 13, away: 10 },
      sequenceApplied: "302"
    }),
    inputPlay: play({
      sequence: "303",
      quarter: 3,
      clockSeconds: 679,
      possession: "home",
      playType: "kickoff",
      payload: {
        kind: "kickoff",
        kickerNumber: "3",
        kickDistance: 60,
        returnYards: 20,
        result: "returned"
      },
      participants: [
        participant(playerIds.hk3, "kicker", "home"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 679,
      phase: "normal",
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("away", 25),
      score: { home: 13, away: 10 },
      sequenceApplied: "303"
    }),
    expectedStatCredits: [
      teamCredit("home", "kickoff", 1),
      teamCredit("home", "kick_yards", 60),
      playerCredit("home", playerIds.hk3, "kickoff", 1),
      playerCredit("home", playerIds.hk3, "kick_yards", 60),
      playerCredit("away", playerIds.aret2, "return_yards", 20)
    ]
  },
  {
    name: "Kickoff touchback places ball at receiving 25",
    startingState: state({
      quarter: 3,
      clockSeconds: 400,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 20, away: 17 },
      sequenceApplied: "350"
    }),
    inputPlay: play({
      sequence: "351",
      quarter: 3,
      clockSeconds: 400,
      possession: "home",
      playType: "kickoff",
      payload: { kind: "kickoff", kickerNumber: "3", kickDistance: 65, result: "touchback" },
      participants: [participant(playerIds.hk3, "kicker", "home")]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 400,
      phase: "normal",
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("away", 25),
      score: { home: 20, away: 17 },
      sequenceApplied: "351"
    }),
    expectedStatCredits: [
      teamCredit("home", "kickoff", 1),
      teamCredit("home", "kick_yards", 65),
      playerCredit("home", playerIds.hk3, "kickoff", 1),
      playerCredit("home", playerIds.hk3, "kick_yards", 65)
    ]
  },
  {
    name: "Interception return changes possession without score",
    startingState: state({
      quarter: 3,
      clockSeconds: 360,
      possession: "home",
      down: 2,
      distance: 7,
      ballOn: position("home", 40),
      score: { home: 20, away: 17 },
      sequenceApplied: "351"
    }),
    inputPlay: play({
      sequence: "352",
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
        participant(playerIds.hqb18, "passer", "home"),
        participant(playerIds.adb7, "interceptor", "away"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 349,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("home", 20),
      score: { home: 20, away: 17 },
      sequenceApplied: "352"
    }),
    expectedStatCredits: [
      playerCredit("away", playerIds.adb7, "interception", 1),
      playerCredit("away", playerIds.aret2, "return_yards", 20)
    ]
  },
  {
    name: "Turnover return touchdown moves to try phase for defense",
    startingState: state({
      quarter: 3,
      clockSeconds: 300,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 20),
      score: { home: 20, away: 17 },
      sequenceApplied: "352"
    }),
    inputPlay: play({
      sequence: "353",
      quarter: 3,
      clockSeconds: 289,
      possession: "home",
      playType: "turnover",
      payload: {
        kind: "turnover",
        turnoverKind: "fumble_return",
        returnerNumber: "2",
        returnYards: 20,
        touchdown: true
      },
      participants: [
        participant(playerIds.alb52, "forced_fumble", "away"),
        participant(playerIds.adb7, "fumble_recovery", "away"),
        participant(playerIds.aret2, "returner", "away")
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 289,
      phase: "try",
      possession: "away",
      down: 1,
      distance: 3,
      ballOn: position("home", 3),
      score: { home: 20, away: 23 },
      sequenceApplied: "353"
    }),
    expectedStatCredits: [
      teamCredit("away", "team_points", 6),
      playerCredit("away", playerIds.aret2, "return_yards", 20),
      playerCredit("away", playerIds.aret2, "return_touchdown", 1),
      playerCredit("away", playerIds.alb52, "forced_fumble", 1),
      playerCredit("away", playerIds.adb7, "fumble_recovery", 1)
    ]
  },
  {
    name: "Accepted offensive holding from previous spot with replay down",
    startingState: state({
      quarter: 3,
      clockSeconds: 250,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 25),
      score: { home: 20, away: 23 },
      sequenceApplied: "353"
    }),
    inputPlay: play({
      sequence: "354",
      quarter: 3,
      clockSeconds: 241,
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 8 },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")],
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "holding",
          yards: 10,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "live_ball",
          replayDown: true
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 241,
      possession: "home",
      down: 1,
      distance: 20,
      ballOn: position("home", 15),
      score: { home: 20, away: 23 },
      sequenceApplied: "354"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 8),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 8)
    ]
  },
  {
    name: "Accepted offensive holding after a first-down gain restores the original line to gain",
    startingState: state({
      quarter: 3,
      clockSeconds: 236,
      possession: "home",
      down: 3,
      distance: 5,
      ballOn: position("home", 20),
      score: { home: 20, away: 23 },
      sequenceApplied: "354a"
    }),
    inputPlay: play({
      sequence: "354b",
      quarter: 3,
      clockSeconds: 228,
      possession: "home",
      playType: "run",
      payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 8, firstDown: true },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")],
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "holding",
          yards: 10,
          result: "accepted",
          enforcementType: "spot",
          timing: "live_ball",
          foulSpot: position("home", 24)
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 228,
      phase: "normal",
      possession: "home",
      down: 4,
      distance: 11,
      ballOn: position("home", 14),
      score: { home: 20, away: 23 },
      sequenceApplied: "354b"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 8),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 8)
    ]
  },
  {
    name: "Roughing passer gives automatic first down",
    startingState: state({
      quarter: 3,
      clockSeconds: 220,
      possession: "home",
      down: 3,
      distance: 12,
      ballOn: position("home", 33),
      score: { home: 20, away: 23 },
      sequenceApplied: "354"
    }),
    inputPlay: play({
      sequence: "355",
      quarter: 3,
      clockSeconds: 212,
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
        penalty({
          penalizedSide: "away",
          code: "roughing_passer",
          yards: 15,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "dead_ball",
          automaticFirstDown: true
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 212,
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 48),
      score: { home: 20, away: 23 },
      sequenceApplied: "355"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1)
    ]
  },
  {
    name: "Declined defensive offside leaves incomplete pass unchanged",
    startingState: state({
      quarter: 3,
      clockSeconds: 180,
      possession: "home",
      down: 2,
      distance: 7,
      ballOn: position("home", 41),
      score: { home: 20, away: 23 },
      sequenceApplied: "355"
    }),
    inputPlay: play({
      sequence: "356",
      quarter: 3,
      clockSeconds: 173,
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
        penalty({
          penalizedSide: "away",
          code: "offside",
          yards: 5,
          result: "declined",
          enforcementType: "previous_spot",
          timing: "dead_ball"
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 173,
      possession: "home",
      down: 3,
      distance: 7,
      ballOn: position("home", 41),
      score: { home: 20, away: 23 },
      sequenceApplied: "356"
    }),
    expectedStatCredits: [
      teamCredit("home", "passing_attempt", 1),
      playerCredit("home", playerIds.hqb18, "passing_attempt", 1),
      playerCredit("home", playerIds.hwr5, "receiving_target", 1)
    ]
  },
  {
    name: "Offsetting penalties on change-of-possession play nullify the turnover",
    startingState: state({
      quarter: 3,
      clockSeconds: 150,
      possession: "home",
      down: 2,
      distance: 6,
      ballOn: position("home", 45),
      score: { home: 20, away: 23 },
      sequenceApplied: "356"
    }),
    inputPlay: play({
      sequence: "357",
      quarter: 3,
      clockSeconds: 141,
      possession: "home",
      playType: "turnover",
      payload: {
        kind: "turnover",
        turnoverKind: "interception_return",
        returnerNumber: "2",
        returnYards: 15
      },
      participants: [
        participant(playerIds.adb7, "interceptor", "away"),
        participant(playerIds.aret2, "returner", "away")
      ],
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "illegal_block",
          yards: 10,
          result: "offsetting",
          enforcementType: "previous_spot",
          timing: "live_ball"
        }),
        penalty({
          penalizedSide: "away",
          code: "roughing_passer",
          yards: 15,
          result: "offsetting",
          enforcementType: "previous_spot",
          timing: "live_ball"
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 141,
      possession: "home",
      down: 2,
      distance: 6,
      ballOn: position("home", 45),
      score: { home: 20, away: 23 },
      sequenceApplied: "357"
    }),
    expectedStatCredits: []
  },
  {
    name: "False start is a no-play dead-ball foul",
    startingState: state({
      quarter: 3,
      clockSeconds: 120,
      possession: "home",
      down: 2,
      distance: 6,
      ballOn: position("home", 44),
      score: { home: 20, away: 23 },
      sequenceApplied: "357"
    }),
    inputPlay: play({
      sequence: "358",
      quarter: 3,
      clockSeconds: 116,
      possession: "home",
      playType: "penalty",
      payload: { kind: "penalty", liveBall: false, note: "false start" },
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "false_start",
          yards: 5,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "dead_ball",
          replayDown: true,
          noPlay: true
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 116,
      possession: "home",
      down: 2,
      distance: 11,
      ballOn: position("home", 39),
      score: { home: 20, away: 23 },
      sequenceApplied: "358"
    }),
    expectedStatCredits: []
  },
  {
    name: "Defensive offside is replay down with 5 free yards",
    startingState: state({
      quarter: 3,
      clockSeconds: 100,
      possession: "home",
      down: 3,
      distance: 7,
      ballOn: position("home", 38),
      score: { home: 20, away: 23 },
      sequenceApplied: "358"
    }),
    inputPlay: play({
      sequence: "359",
      quarter: 3,
      clockSeconds: 97,
      possession: "home",
      playType: "penalty",
      payload: { kind: "penalty", liveBall: false, note: "offside" },
      penalties: [
        penalty({
          penalizedSide: "away",
          code: "offside",
          yards: 5,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "dead_ball",
          replayDown: true
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 3,
      clockSeconds: 97,
      possession: "home",
      down: 3,
      distance: 2,
      ballOn: position("home", 43),
      score: { home: 20, away: 23 },
      sequenceApplied: "359"
    }),
    expectedStatCredits: []
  },
  {
    name: "Post-possession foul after interception return backs up the new offense",
    startingState: state({
      quarter: 4,
      clockSeconds: 720,
      possession: "home",
      down: 2,
      distance: 7,
      ballOn: position("home", 40),
      score: { home: 20, away: 23 },
      sequenceApplied: "400"
    }),
    inputPlay: play({
      sequence: "401",
      quarter: 4,
      clockSeconds: 709,
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
      ],
      penalties: [
        penalty({
          penalizedSide: "away",
          code: "unsportsmanlike",
          yards: 15,
          result: "accepted",
          enforcementType: "succeeding_spot",
          timing: "post_possession"
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 4,
      clockSeconds: 709,
      possession: "away",
      down: 1,
      distance: 10,
      ballOn: position("home", 35),
      score: { home: 20, away: 23 },
      sequenceApplied: "401"
    }),
    expectedStatCredits: [
      playerCredit("away", playerIds.adb7, "interception", 1),
      playerCredit("away", playerIds.aret2, "return_yards", 20)
    ]
  },
  {
    name: "Touchdown plus post-score foul moves try spot back",
    startingState: state({
      quarter: 4,
      clockSeconds: 512,
      possession: "home",
      down: 1,
      distance: 4,
      ballOn: position("away", 4),
      score: { home: 20, away: 23 },
      sequenceApplied: "401"
    }),
    inputPlay: play({
      sequence: "402",
      quarter: 4,
      clockSeconds: 505,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 4,
        touchdown: true
      },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")],
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "unsportsmanlike",
          yards: 15,
          result: "accepted",
          enforcementType: "succeeding_spot",
          timing: "post_score"
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 4,
      clockSeconds: 505,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 18,
      ballOn: position("away", 18),
      score: { home: 26, away: 23 },
      sequenceApplied: "402"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 4),
      teamCredit("home", "rushing_touchdown", 1),
      teamCredit("home", "team_points", 6),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 4),
      playerCredit("home", playerIds.hrb34, "rushing_touchdown", 1)
    ]
  },
  {
    name: "Good extra point plus post-score foul moves kickoff spot back",
    startingState: state({
      quarter: 4,
      clockSeconds: 505,
      phase: "try",
      possession: "home",
      down: 1,
      distance: 3,
      ballOn: position("away", 3),
      score: { home: 26, away: 23 },
      sequenceApplied: "402"
    }),
    inputPlay: play({
      sequence: "403",
      quarter: 4,
      clockSeconds: 505,
      possession: "home",
      playType: "extra_point",
      payload: { kind: "extra_point", kickerNumber: "3", result: "good" },
      participants: [participant(playerIds.hk3, "kicker", "home")],
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "unsportsmanlike",
          yards: 15,
          result: "accepted",
          enforcementType: "succeeding_spot",
          timing: "post_score"
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 4,
      clockSeconds: 505,
      phase: "kickoff",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: position("home", 20),
      score: { home: 27, away: 23 },
      sequenceApplied: "403"
    }),
    expectedStatCredits: [
      teamCredit("home", "extra_point_attempt", 1),
      teamCredit("home", "extra_point_made", 1),
      teamCredit("home", "team_points", 1),
      playerCredit("home", playerIds.hk3, "extra_point_attempt", 1),
      playerCredit("home", playerIds.hk3, "extra_point_made", 1)
    ]
  },
  {
    name: "First play of Q2 respects incoming quarter and clock",
    startingState: state({
      quarter: 1,
      clockSeconds: 5,
      possession: "home",
      down: 2,
      distance: 4,
      ballOn: position("away", 44),
      score: { home: 7, away: 3 },
      sequenceApplied: "150"
    }),
    inputPlay: play({
      sequence: "200",
      quarter: 2,
      clockSeconds: 900,
      possession: "home",
      playType: "run",
      payload: {
        kind: "run",
        ballCarrierNumber: "34",
        runKind: "designed",
        yards: 3
      },
      participants: [participant(playerIds.hrb34, "ball_carrier", "home")]
    }),
    expectedFinalState: state({
      quarter: 2,
      clockSeconds: 900,
      possession: "home",
      down: 3,
      distance: 1,
      ballOn: position("away", 41),
      score: { home: 7, away: 3 },
      sequenceApplied: "200"
    }),
    expectedStatCredits: [
      teamCredit("home", "rushing_attempt", 1),
      teamCredit("home", "rushing_yards", 3),
      playerCredit("home", playerIds.hrb34, "rushing_attempt", 1),
      playerCredit("home", playerIds.hrb34, "rushing_yards", 3)
    ]
  },
  {
    name: "Intentional grounding applies loss of down",
    startingState: state({
      quarter: 4,
      clockSeconds: 82,
      possession: "home",
      down: 3,
      distance: 8,
      ballOn: position("home", 30),
      score: { home: 27, away: 23 },
      sequenceApplied: "403"
    }),
    inputPlay: play({
      sequence: "404",
      quarter: 4,
      clockSeconds: 77,
      possession: "home",
      playType: "penalty",
      payload: { kind: "penalty", liveBall: true, note: "intentional grounding" },
      penalties: [
        penalty({
          penalizedSide: "home",
          code: "intentional_grounding",
          yards: 10,
          result: "accepted",
          enforcementType: "previous_spot",
          timing: "live_ball",
          lossOfDown: true
        })
      ]
    }),
    expectedFinalState: state({
      quarter: 4,
      clockSeconds: 77,
      possession: "home",
      down: 4,
      distance: 18,
      ballOn: position("home", 20),
      score: { home: 27, away: 23 },
      sequenceApplied: "404"
    }),
    expectedStatCredits: []
  }
];
