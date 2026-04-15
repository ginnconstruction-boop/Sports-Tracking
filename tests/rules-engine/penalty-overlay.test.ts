import assert from "node:assert/strict";
import test from "node:test";
import { applyBasePlay, applyPenaltyOverlay } from "../../src/lib/engine/rebuild";
import { ruleEngineScenarios } from "./fixtures";
import { assertState, creditKey } from "./helpers";

for (const scenario of ruleEngineScenarios.filter((item) => item.inputPlay.penalties.length > 0)) {
  test(`penalty overlay: ${scenario.name}`, () => {
    const baseResult = applyBasePlay(scenario.startingState, scenario.inputPlay);
    const overlay = applyPenaltyOverlay(
      scenario.startingState,
      baseResult,
      scenario.inputPlay.penalties,
      scenario.inputPlay
    );

    assertState(overlay.finalState, scenario.expectedFinalState);
    assert.deepEqual(
      overlay.statCredits.map(creditKey).sort(),
      [...scenario.expectedStatCredits].sort()
    );
  });
}
