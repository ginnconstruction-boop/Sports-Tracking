import assert from "node:assert/strict";
import test from "node:test";
import { mergeOutboxMutations, type OutboxMutation } from "../src/lib/offline/outbox";

function mutation(overrides: Partial<OutboxMutation> & Pick<OutboxMutation, "id" | "gameId" | "kind" | "payload" | "expectedRevision" | "queuedAt">): OutboxMutation {
  return overrides;
}

test("mergeOutboxMutations folds an edit into an unsynced append", () => {
  const existing = [
    mutation({
      id: "append-1",
      gameId: "game-1",
      kind: "append_play",
      payload: {
        playId: "local-play-1",
        play: { id: "local-play-1" },
        body: { summary: "before" }
      },
      expectedRevision: 1,
      queuedAt: "2026-04-14T12:00:00.000Z"
    })
  ];

  const merged = mergeOutboxMutations(
    existing,
    mutation({
      id: "edit-1",
      gameId: "game-1",
      kind: "edit_play",
      payload: {
        playId: "local-play-1",
        play: { id: "local-play-1" },
        body: { summary: "after" }
      },
      expectedRevision: 1,
      queuedAt: "2026-04-14T12:01:00.000Z"
    })
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.kind, "append_play");
  assert.deepEqual(merged[0]?.payload.body, { summary: "after" });
});

test("mergeOutboxMutations removes a local append when the same local play is deleted before sync", () => {
  const existing = [
    mutation({
      id: "append-1",
      gameId: "game-1",
      kind: "append_play",
      payload: {
        playId: "local-play-1",
        play: { id: "local-play-1" },
        body: {}
      },
      expectedRevision: 1,
      queuedAt: "2026-04-14T12:00:00.000Z"
    })
  ];

  const merged = mergeOutboxMutations(
    existing,
    mutation({
      id: "delete-1",
      gameId: "game-1",
      kind: "delete_play",
      payload: {
        playId: "local-play-1"
      },
      expectedRevision: 1,
      queuedAt: "2026-04-14T12:02:00.000Z"
    })
  );

  assert.deepEqual(merged, []);
});

test("mergeOutboxMutations keeps only the latest remote edit for a play", () => {
  const existing = [
    mutation({
      id: "edit-1",
      gameId: "game-1",
      kind: "edit_play",
      payload: {
        playId: "play-9",
        play: { id: "play-9" },
        body: { summary: "version-1" }
      },
      expectedRevision: 7,
      queuedAt: "2026-04-14T12:00:00.000Z"
    })
  ];

  const merged = mergeOutboxMutations(
    existing,
    mutation({
      id: "edit-2",
      gameId: "game-1",
      kind: "edit_play",
      payload: {
        playId: "play-9",
        play: { id: "play-9" },
        body: { summary: "version-2" }
      },
      expectedRevision: 7,
      queuedAt: "2026-04-14T12:03:00.000Z"
    })
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, "edit-2");
  assert.deepEqual(merged[0]?.payload.body, { summary: "version-2" });
});
