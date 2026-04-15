import test from "node:test";
import { finalizePlay } from "../../src/lib/engine/rebuild";
import { ruleEngineScenarios } from "./fixtures";
import { assertState } from "./helpers";

for (const scenario of ruleEngineScenarios) {
  test(`reducer state: ${scenario.name}`, () => {
    const result = finalizePlay(scenario.startingState, scenario.inputPlay);
    assertState(result.finalState, scenario.expectedFinalState);
  });
}
