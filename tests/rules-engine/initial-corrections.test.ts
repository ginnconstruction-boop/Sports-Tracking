import assert from "node:assert/strict";
import test from "node:test";
import { rebuildFromPlayLog } from "@/lib/engine/rebuild";
import { play, position } from "./helpers";

test("initial situation correction at sequence 0 applies even without plays", () => {
  const projection = rebuildFromPlayLog([], {
    corrections: [
      {
        id: "c0",
        gameId: "test-game",
        kind: "situation",
        appliesAfterSequence: "0",
        possession: "away",
        ballOn: position("away", 40),
        down: 2,
        distance: 7,
        quarter: 2,
        reasonCategory: "official_correction",
        reasonNote: "pre-snap fix",
        createdByUserId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  });

  assert.equal(projection.currentState.quarter, 2);
  assert.equal(projection.currentState.possession, "away");
  assert.equal(projection.currentState.down, 2);
  assert.equal(projection.currentState.distance, 7);
  assert.deepEqual(projection.currentState.ballOn, position("away", 40));
});

test("first play is rebuilt from the corrected initial situation state", () => {
  const projection = rebuildFromPlayLog(
    [
      play({
        sequence: "101",
        quarter: 2,
        clockSeconds: 890,
        possession: "away",
        playType: "run",
        payload: {
          kind: "run",
          ballCarrierNumber: "2",
          runKind: "designed",
          yards: 3
        }
      })
    ],
    {
      corrections: [
        {
          id: "c0",
          gameId: "test-game",
          kind: "situation",
          appliesAfterSequence: "0",
          possession: "away",
          ballOn: position("away", 40),
          down: 2,
          distance: 7,
          quarter: 2,
          reasonCategory: "official_correction",
          reasonNote: "pre-snap fix",
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    }
  );

  assert.equal(projection.currentState.quarter, 2);
  assert.equal(projection.currentState.possession, "away");
  assert.equal(projection.currentState.down, 3);
  assert.equal(projection.currentState.distance, 4);
  assert.deepEqual(projection.currentState.ballOn, position("away", 43));
});
