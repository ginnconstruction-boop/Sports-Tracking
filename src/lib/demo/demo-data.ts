import type { GameProjection } from "@/lib/domain/game-state";
import type { PlayRecord } from "@/lib/domain/play-log";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";

export const demoPlayLog: PlayRecord[] = [
  {
    id: "play-1",
    gameId: "demo",
    sequence: "1",
    quarter: 1,
    clockSeconds: 12 * 60,
    possession: "home",
    playType: "kickoff",
    summary: "Opening kickoff returned to the home 27.",
    payload: {
      kind: "kickoff",
      startBall: { side: "home", yardLine: 35 },
      kickDistance: 60,
      returnYards: 22,
      result: "returned"
    },
    participants: [],
    penalties: []
  },
  {
    id: "play-2",
    gameId: "demo",
    sequence: "2",
    quarter: 1,
    clockSeconds: 11 * 60 + 41,
    possession: "home",
    playType: "run",
    summary: "#18 hands to #34 for 6 yards, tackled by #52 and #7.",
    payload: {
      kind: "run",
      startBall: { side: "home", yardLine: 27 },
      ballCarrierNumber: "34",
      runKind: "designed",
      yards: 6
    },
    participants: [
      { role: "ball_carrier", side: "home", creditUnits: 1 },
      { role: "assist_tackle", side: "away", creditUnits: 1 },
      { role: "assist_tackle", side: "away", creditUnits: 1 }
    ],
    penalties: []
  },
  {
    id: "play-3",
    gameId: "demo",
    sequence: "3",
    quarter: 1,
    clockSeconds: 11 * 60 + 7,
    possession: "home",
    playType: "pass",
    summary: "#18 completes to #11 for 18 yards and a first down.",
    payload: {
      kind: "pass",
      passerNumber: "18",
      targetNumber: "11",
      result: "complete",
      yards: 18,
      firstDown: true
    },
    participants: [
      { role: "passer", side: "home", creditUnits: 1 },
      { role: "target", side: "home", creditUnits: 1 }
    ],
    penalties: []
  },
  {
    id: "play-4",
    gameId: "demo",
    sequence: "4",
    quarter: 1,
    clockSeconds: 10 * 60 + 18,
    possession: "home",
    playType: "penalty",
    summary: "Holding on the offense, 10 yards from the spot, replay first down.",
    payload: {
      kind: "penalty",
      liveBall: true,
      note: "Holding on offense"
    },
    participants: [],
    penalties: [
      {
        penalizedSide: "home",
        code: "holding",
        yards: 10,
        result: "accepted",
        enforcementType: "spot",
        timing: "live_ball",
        replayDown: true
      }
    ]
  },
  {
    id: "play-5",
    gameId: "demo",
    sequence: "5",
    quarter: 1,
    clockSeconds: 9 * 60 + 54,
    possession: "home",
    playType: "pass",
    summary: "#18 finds #5 for 28 yards and a touchdown.",
    payload: {
      kind: "pass",
      passerNumber: "18",
      targetNumber: "5",
      result: "complete",
      yards: 28,
      touchdown: true
    },
    participants: [
      { role: "passer", side: "home", creditUnits: 1 },
      { role: "target", side: "home", creditUnits: 1 }
    ],
    penalties: []
  }
];

export function getDemoGame(): GameProjection & {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
} {
  return {
    gameId: "demo",
    homeTeam: "North Creek",
    awayTeam: "Central Heights",
    ...rebuildFromPlayLog(demoPlayLog)
  };
}
