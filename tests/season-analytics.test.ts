import assert from "node:assert/strict";
import test from "node:test";
import { buildSeasonAnalyticsDocument } from "@/lib/analytics/season";
import type { GameReportDocument } from "@/lib/domain/reports";

function report(overrides: Partial<GameReportDocument>): GameReportDocument {
  return {
    kind: "game_report",
    generatedAt: new Date().toISOString(),
    gameId: overrides.gameId ?? "game-1",
    reportType: "game_report",
    context: {
      status: "final",
      homeTeam: "Home",
      awayTeam: "Away",
      venueLabel: "Field"
    },
    branding: null,
    currentState: {
      quarter: 4,
      clockSeconds: 0,
      phase: "normal",
      possession: "home",
      down: 1,
      distance: 10,
      ballOn: { side: "home", yardLine: 35 },
      score: { home: 28, away: 14 },
      sequenceApplied: "10"
    },
    scoringSummary: [],
    recentTimeline: [],
    fullTimeline: [],
    penaltyTracker: [],
    turnoverTracker: [],
    quarterSummary: [],
    driveSummaries: [],
    teamStats: [],
    playerStats: [],
    highlights: {},
    halftimeSummary: {
      score: { home: 14, away: 7 },
      note: "half"
    },
    finalSummary: {
      score: { home: 28, away: 14 },
      note: "done",
      totalPlays: 60,
      totalDrives: 8
    },
    stats: {
      teamTotals: { home: {}, away: {} },
      playerTotals: {}
    },
    ...overrides
  };
}

test("buildSeasonAnalyticsDocument aggregates season summary, opponent history, and situational stats", () => {
    const fullTimeline = [
      {
        sequence: "1",
        result: {
          summary: "3rd down completion for 12 yards",
          play: { possession: "home", payload: { yards: 12 } },
          finalState: {
            down: 1
          },
          baseResult: {
            metadata: {
              downBeforePlay: 3,
              previousSpot: { side: "away", yardLine: 18 }
            }
          }
        }
      },
      {
        sequence: "2",
        result: {
          summary: "Touchdown pass",
          play: { possession: "home", payload: { yards: 22 } },
          finalState: {
            down: 1
          },
          baseResult: {
            metadata: {
              downBeforePlay: 1,
              previousSpot: { side: "away", yardLine: 12 },
              scoringTeam: "home"
            }
          }
        }
      }
    ] as GameReportDocument["fullTimeline"];

    const analytics = buildSeasonAnalyticsDocument({
      organizationId: "org-1",
      teamId: "team-1",
      seasonId: "season-1",
      seasonLabel: "2026 Varsity",
      reports: [
        {
          gameId: "game-1",
          opponentId: "opp-1",
          opponentLabel: "Ridgeview",
          primarySide: "home",
          report: report({
            gameId: "game-1",
            currentState: {
              quarter: 4,
              clockSeconds: 0,
              phase: "normal",
              possession: "home",
              down: 1,
              distance: 10,
              ballOn: { side: "home", yardLine: 35 },
              score: { home: 28, away: 14 },
              sequenceApplied: "10"
            },
            finalSummary: {
              score: { home: 28, away: 14 },
              note: "final",
              totalPlays: 60,
              totalDrives: 8
            },
            stats: {
              teamTotals: {
                home: {
                  first_down: 2,
                  third_down_attempt: 1,
                  third_down_conversion: 1,
                  red_zone_trip: 2,
                  red_zone_score: 1,
                  rushing_yards: 104,
                  passing_yards: 220
                },
                away: {}
              },
              playerTotals: {}
            },
            fullTimeline,
            driveSummaries: [
              {
                id: "drive-1",
                side: "home",
                quarter: 1,
                startClockSeconds: 720,
                endClockSeconds: 610,
                startFieldPosition: "own 25",
                endFieldPosition: "away 12",
                result: "touchdown",
                playCount: 8,
                yardsGained: 63,
                timeConsumedSeconds: 110
              }
            ],
            playerStats: [
              {
                gameRosterEntryId: "player-1",
                side: "home",
                jerseyNumber: "18",
                displayName: "Evan Reed",
                totals: {
                  passing_yards: 220,
                  passing_touchdown: 2
                }
              },
              {
                gameRosterEntryId: "player-2",
                side: "home",
                jerseyNumber: "34",
                displayName: "Marcus Cole",
                totals: {
                  rushing_yards: 104
                }
              },
              {
                gameRosterEntryId: "player-3",
                side: "home",
                jerseyNumber: "52",
                displayName: "Jon Price",
                totals: {
                  solo_tackle: 8,
                  interception: 1
                }
              }
            ],
            turnoverTracker: [
              {
                playId: "turn-1",
                sequence: "9",
                playType: "turnover",
                summary: "Interception",
                quarter: 4,
                clockSeconds: 22,
                state: {
                  quarter: 4,
                  clockSeconds: 22,
                  phase: "normal",
                  possession: "away",
                  down: 1,
                  distance: 10,
                  ballOn: { side: "home", yardLine: 25 },
                  score: { home: 28, away: 14 },
                  sequenceApplied: "9"
                },
                play: {
                  id: "turn-1",
                  gameId: "game-1",
                  sequence: "9",
                  quarter: 4,
                  clockSeconds: 22,
                  possession: "home",
                  playType: "turnover",
                  payload: { kind: "turnover", turnoverKind: "interception_return", returnYards: 4 },
                  participants: [],
                  penalties: []
                }
              }
            ]
          })
        }
      ]
    });

    assert.equal(analytics.summary.wins, 1);
    assert.equal(analytics.summary.pointsFor, 28);
    assert.equal(analytics.situational.thirdDownAttempts, 1);
    assert.equal(analytics.situational.thirdDownConversions, 1);
    assert.equal(analytics.situational.thirdDownRate, 100);
    assert.equal(analytics.situational.fourthDownAttempts, 0);
    assert.equal(analytics.situational.redZoneTrips, 2);
    assert.equal(analytics.situational.redZoneScores, 1);
    assert.equal(analytics.situational.redZoneRate, 50);
    assert.equal(analytics.situational.explosivePlays, 1);
    assert.equal(analytics.situational.averageStartingYardLine, 25);
    assert.equal(analytics.situational.averageDriveYards, 63);
    assert.equal(analytics.opponentHistory[0]?.opponentLabel, "Ridgeview");
    assert.equal(analytics.opponentBreakdowns[0]?.averageMargin, 14);
    assert.equal(analytics.opponentBreakdowns[0]?.thirdDownRate, 100);
    assert.equal(analytics.performance.bestScoringGame?.opponentLabel, "Ridgeview");
    assert.equal(analytics.performance.cleanestGame?.value, 0);
    assert.equal(analytics.playerLeaders[0]?.leaders[0]?.label, "#18 Evan Reed");
    assert.equal(analytics.playerTrends[0]?.players[0]?.points[0]?.value, 220);
});
