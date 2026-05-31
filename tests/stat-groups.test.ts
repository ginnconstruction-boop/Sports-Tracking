import assert from "node:assert/strict";
import test from "node:test";
import { getStatGroup, splitTotalsByGroup } from "@/lib/domain/stat-groups";

test("getStatGroup classifies core offense, defense, and special teams keys", () => {
  assert.equal(getStatGroup("passing_yards"), "offense");
  assert.equal(getStatGroup("solo_tackle"), "defense");
  assert.equal(getStatGroup("field_goal_attempt"), "special_teams");
});

test("splitTotalsByGroup separates mixed player totals into football groups", () => {
  const grouped = splitTotalsByGroup({
    passing_yards: 180,
    passing_touchdown: 2,
    solo_tackle: 5,
    pass_breakup: 1,
    kickoff: 1,
    kick_yards: 65,
    penalty_count: 0
  });

  assert.deepEqual(grouped.offense, [
    ["passing_yards", 180],
    ["passing_touchdown", 2]
  ]);
  assert.deepEqual(grouped.defense, [
    ["solo_tackle", 5],
    ["pass_breakup", 1]
  ]);
  assert.deepEqual(grouped.special_teams, [
    ["kickoff", 1],
    ["kick_yards", 65]
  ]);
  assert.deepEqual(grouped.other, []);
});
