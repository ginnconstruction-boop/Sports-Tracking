import assert from "node:assert/strict";
import test from "node:test";
import { createPlayEventInputSchema } from "@/lib/contracts/play-log";

function basePenalty() {
  return {
    penalizedSide: "home" as const,
    code: "false_start",
    yards: 5,
    result: "accepted" as const,
    enforcementType: "previous_spot" as const,
    timing: "dead_ball" as const,
    replayDown: true,
    noPlay: true
  };
}

test("play-log contract allows dead-ball no-play penalties on penalty-only plays", () => {
  const parsed = createPlayEventInputSchema.safeParse({
    sequence: "358",
    quarter: 3,
    clock: "1:56",
    possession: "home",
    playType: "penalty",
    payload: {
      kind: "penalty",
      liveBall: false,
      note: "false start"
    },
    participants: [],
    penalties: [basePenalty()]
  });

  assert.equal(parsed.success, true);
});

test("play-log contract rejects no-play penalties on non-penalty plays", () => {
  const parsed = createPlayEventInputSchema.safeParse({
    sequence: "101",
    quarter: 1,
    clock: "11:48",
    possession: "home",
    playType: "run",
    payload: {
      kind: "run",
      ballCarrierNumber: "34",
      runKind: "designed",
      yards: 4
    },
    participants: [],
    penalties: [basePenalty()]
  });

  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some((issue) => issue.message === "No-play penalties are only allowed on penalty-only plays.")
  );
});

test("play-log contract rejects dead-ball replay-down penalties on non-penalty plays", () => {
  const parsed = createPlayEventInputSchema.safeParse({
    sequence: "105",
    quarter: 1,
    clock: "9:13",
    possession: "home",
    playType: "pass",
    payload: {
      kind: "pass",
      passerNumber: "18",
      targetNumber: "5",
      result: "incomplete",
      yards: 0
    },
    participants: [],
    penalties: [
      {
        penalizedSide: "away" as const,
        code: "offside",
        yards: 5,
        result: "accepted" as const,
        enforcementType: "previous_spot" as const,
        timing: "dead_ball" as const,
        replayDown: true
      }
    ]
  });

  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(
      (issue) => issue.message === "Replay down can only be dead-ball on penalty-only plays."
    )
  );
});

test("play-log contract keeps live-ball replay-down penalties valid on non-penalty plays", () => {
  const parsed = createPlayEventInputSchema.safeParse({
    sequence: "354",
    quarter: 3,
    clock: "4:01",
    possession: "home",
    playType: "run",
    payload: {
      kind: "run",
      ballCarrierNumber: "34",
      runKind: "designed",
      yards: 8
    },
    participants: [],
    penalties: [
      {
        penalizedSide: "home" as const,
        code: "holding",
        yards: 10,
        result: "accepted" as const,
        enforcementType: "previous_spot" as const,
        timing: "live_ball" as const,
        replayDown: true
      }
    ]
  });

  assert.equal(parsed.success, true);
});
