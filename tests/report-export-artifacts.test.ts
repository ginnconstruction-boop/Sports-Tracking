import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { serializeGameReport } from "@/lib/reports/export-artifacts";
import type { GameReportDocument } from "@/lib/domain/reports";

const sampleReport: GameReportDocument = {
  kind: "game_report",
  generatedAt: "2026-04-14T12:00:00.000Z",
  gameId: "game-1",
  reportType: "game_report",
  context: {
    status: "final",
    homeTeam: "North Creek",
    awayTeam: "West Ridge",
    kickoffAt: "2026-09-05T19:00:00.000Z",
    arrivalAt: "2026-09-05T17:15:00.000Z",
    reportAt: "2026-09-05T17:45:00.000Z",
    venueLabel: "North Creek Stadium",
    weatherConditions: "Clear",
    fieldConditions: "Dry"
  },
  branding: null,
  currentState: {
    quarter: 4,
    clockSeconds: 0,
    phase: "normal",
    possession: "away",
    down: 1,
    distance: 10,
    ballOn: { side: "away", yardLine: 25 },
    score: { home: 28, away: 21 },
    sequenceApplied: "120"
  },
  scoringSummary: [],
  recentTimeline: [],
  penaltyTracker: [],
  turnoverTracker: [],
  fullTimeline: [
    {
      sequence: "120",
      result: {
        play: {
          id: "play-1",
          gameId: "game-1",
          sequence: "120",
          quarter: 4,
          clockSeconds: 45,
          possession: "home",
          playType: "run",
          summary: "Game-clinching run",
          payload: { kind: "run", ballCarrierNumber: "34", runKind: "designed", yards: 6, firstDown: true },
          participants: [],
          penalties: []
        },
        summary: "Game-clinching run",
        baseResult: {
          playId: "play-1",
          sequence: "120",
          summary: "Game-clinching run",
          nextState: {
            quarter: 4,
            clockSeconds: 45,
            phase: "normal",
            possession: "home",
            down: 1,
            distance: 10,
            ballOn: { side: "away", yardLine: 39 },
            score: { home: 28, away: 21 },
            sequenceApplied: "120"
          },
          touchdown: false,
          turnover: false,
          firstDownAchieved: true,
          statCredits: [],
          metadata: {
            previousSpot: { side: "away", yardLine: 45 },
            endSpot: { side: "away", yardLine: 39 },
            downBeforePlay: 3,
            distanceBeforePlay: 4,
            possessionBeforePlay: "home"
            ,
            phaseBeforePlay: "normal",
            nextPhase: "normal",
            possessionChanged: false
          }
        },
        finalState: {
          quarter: 4,
          clockSeconds: 45,
          phase: "normal",
          possession: "home",
          down: 1,
          distance: 10,
          ballOn: { side: "away", yardLine: 39 },
          score: { home: 28, away: 21 },
          sequenceApplied: "120"
        },
        appliedPenalties: [],
        statCredits: []
      }
    }
  ],
  quarterSummary: [{ quarter: 4, playCount: 18, homePoints: 7, awayPoints: 0 }],
  driveSummaries: [
    {
      id: "drive-4",
      side: "home",
      quarter: 4,
      startClockSeconds: 255,
      endClockSeconds: 45,
      startFieldPosition: "own 35",
      endFieldPosition: "opp 39",
      playCount: 8,
      yardsGained: 26,
      timeConsumedSeconds: 210,
      result: "end_of_half"
    }
  ],
  teamStats: [{ side: "home", label: "North Creek", totals: { rushing_yards: 182 } }],
  playerStats: [{ gameRosterEntryId: "gr-1", displayName: "Jordan Smith", jerseyNumber: "34", side: "home", totals: { rushing_yards: 96 } }],
  highlights: {
    lastScoringSummary: "Q4 touchdown run",
    lastTurnoverSummary: null,
    lastPenaltySummary: null
  },
  halftimeSummary: {
    score: { home: 14, away: 14 },
    note: "Even game at halftime."
  },
  finalSummary: {
    score: { home: 28, away: 21 },
    note: "North Creek closes the game on the ground.",
    totalPlays: 120,
    totalDrives: 12
  },
  stats: {
    teamTotals: {
      home: { rushing_yards: 182 },
      away: { passing_yards: 201 }
    },
    playerTotals: {
      "gr-1": { rushing_yards: 96 }
    }
  }
};

test("serializeGameReport produces a readable CSV artifact", async () => {
  const artifact = await serializeGameReport(sampleReport, "csv");
  assert.equal(artifact.format, "csv");
  assert.equal(artifact.contentType, "text/csv");
  assert.match(String(artifact.body), /North Creek Stadium/);
});

test("serializeGameReport produces a multi-sheet XLSX artifact", async () => {
  const artifact = await serializeGameReport(sampleReport, "xlsx");
  const workbook = XLSX.read(Buffer.from(artifact.body), { type: "buffer" });
  assert.ok(workbook.SheetNames.includes("Summary"));
  assert.ok(workbook.SheetNames.includes("Timeline"));
});

test("serializeGameReport produces a PDF artifact", async () => {
  const artifact = await serializeGameReport(sampleReport, "pdf");
  const bytes = Buffer.from(artifact.body);
  assert.equal(artifact.contentType, "application/pdf");
  assert.ok(bytes.byteLength > 500);
  assert.equal(bytes.subarray(0, 4).toString("utf8"), "%PDF");
});
