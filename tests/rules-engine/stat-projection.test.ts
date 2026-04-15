import assert from "node:assert/strict";
import test from "node:test";
import { finalizePlay, rebuildFromPlayLog } from "../../src/lib/engine/rebuild";
import { ruleEngineScenarios } from "./fixtures";
import { creditKey, playerIds } from "./helpers";

for (const scenario of ruleEngineScenarios) {
  test(`stat credits: ${scenario.name}`, () => {
    const result = finalizePlay(scenario.startingState, scenario.inputPlay);
    assert.deepEqual(
      result.statCredits.map(creditKey).sort(),
      [...scenario.expectedStatCredits].sort()
    );
  });
}

test("stat projection aggregates team and player totals from play log", () => {
  const projection = rebuildFromPlayLog(
    ruleEngineScenarios
      .filter((scenario) =>
        [
          "Inside run for 6 on 1st down",
          "Passing touchdown moves game to try phase",
          "Good extra point moves game to kickoff phase"
        ].includes(scenario.name)
      )
      .map((scenario) => scenario.inputPlay)
  );

  assert.equal(projection.stats.teamTotals.home.rushing_attempt, 1);
  assert.equal(projection.stats.teamTotals.home.rushing_yards, 6);
  assert.equal(projection.stats.teamTotals.home.passing_touchdown, 1);
  assert.equal(projection.stats.teamTotals.home.team_points, 7);
  assert.equal(projection.stats.playerTotals[playerIds.hrb34]?.rushing_yards, 6);
  assert.equal(projection.stats.playerTotals[playerIds.hqb18]?.passing_touchdown, 1);
  assert.equal(projection.stats.playerTotals[playerIds.hwr5]?.receiving_touchdown, 1);
  assert.equal(projection.stats.playerTotals[playerIds.hk3]?.extra_point_made, 1);
});

test("no-play and offsetting penalties do not leak credits into projection", () => {
  const projection = rebuildFromPlayLog(
    ruleEngineScenarios
      .filter((scenario) =>
        [
          "Offsetting penalties on change-of-possession play nullify the turnover",
          "False start is a no-play dead-ball foul"
        ].includes(scenario.name)
      )
      .map((scenario) => scenario.inputPlay)
  );

  assert.deepEqual(projection.stats.teamTotals.home, {});
  assert.deepEqual(projection.stats.teamTotals.away, {});
});
