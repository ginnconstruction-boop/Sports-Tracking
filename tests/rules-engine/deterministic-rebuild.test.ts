import assert from "node:assert/strict";
import test from "node:test";
import { rebuildFromPlayLog } from "../../src/lib/engine/rebuild";
import { compareSequence } from "../../src/lib/engine/sequence";
import { ruleEngineScenarios } from "./fixtures";

const deterministicPlayLog = ruleEngineScenarios
  .filter((scenario) =>
    [
      "Inside run for 6 on 1st down",
      "Completion converts 3rd-and-9",
      "Passing touchdown moves game to try phase",
      "Good extra point moves game to kickoff phase",
      "Kickoff touchback places ball at receiving 25",
      "Post-possession foul after interception return backs up the new offense"
    ].includes(scenario.name)
  )
  .map((scenario) => scenario.inputPlay);

test("deterministic rebuild: same play log produces same state and stats", () => {
  const first = rebuildFromPlayLog(deterministicPlayLog);
  const second = rebuildFromPlayLog(deterministicPlayLog);

  assert.deepEqual(second, first);
});

test("deterministic rebuild: sequence sorting normalizes shuffled input", () => {
  const shuffled = [...deterministicPlayLog].sort((left, right) => compareSequence(right.sequence, left.sequence));
  const ordered = rebuildFromPlayLog(deterministicPlayLog);
  const fromShuffled = rebuildFromPlayLog(shuffled);

  assert.deepEqual(fromShuffled, ordered);
});

test("deterministic rebuild: partial rebuild from any sequence matches full rebuild", () => {
  const orderedLog = [...deterministicPlayLog].sort((left, right) => compareSequence(left.sequence, right.sequence));
  const full = rebuildFromPlayLog(orderedLog);
  const fromSequence = orderedLog[3]!.sequence;
  const prefix = orderedLog.filter((play) => compareSequence(play.sequence, fromSequence) < 0);
  const prefixProjection = rebuildFromPlayLog(prefix);
  const partial = rebuildFromPlayLog(orderedLog, {
    fromSequence,
    seedState: prefixProjection.currentState,
    priorTimeline: prefixProjection.timeline
  });

  assert.deepEqual(partial, full);
});
