import assert from "node:assert/strict";
import test from "node:test";
import { buildGameDaySnapshot } from "../src/lib/game-day/snapshot";
import { rebuildFromPlayLog } from "../src/lib/engine/rebuild";
import { ruleEngineScenarios } from "./rules-engine/fixtures";

const readModelPlayLog = ruleEngineScenarios
  .filter((scenario) =>
    [
      "Passing touchdown moves game to try phase",
      "Good extra point moves game to kickoff phase",
      "Kickoff touchback places ball at receiving 25",
      "Post-possession foul after interception return backs up the new offense"
    ].includes(scenario.name)
  )
  .map((scenario) => scenario.inputPlay);

test("game day snapshot exposes last score, last turnover, last penalty, and possession chain", () => {
  const projection = rebuildFromPlayLog(readModelPlayLog);
  const snapshot = buildGameDaySnapshot({
    gameId: "test-game",
    revision: readModelPlayLog.length,
    status: "in_progress",
    lastRebuiltAt: new Date().toISOString(),
    homeTeam: "North Creek",
    awayTeam: "Ridgeview",
    rosters: {
      home: [],
      away: []
    },
    projection
  });

  assert.equal(snapshot.lastScoringPlay?.playType, "extra_point");
  assert.equal(snapshot.lastTurnoverPlay?.playType, "turnover");
  assert.ok(snapshot.lastPenaltyPlay);
  assert.ok(snapshot.possessionSummary.length > 0);
  assert.equal(snapshot.possessionSummary[0]?.result, "turnover");
});
