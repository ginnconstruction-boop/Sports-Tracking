import test from "node:test";
import assert from "node:assert/strict";
import { parseRosterCsv } from "@/lib/import/roster-csv";

test("parseRosterCsv maps the template columns into roster entries", () => {
  const csv = `firstName,lastName,preferredName,jerseyNumber,grade,position,offenseRole,defenseRole,specialTeamsRole
Jordan,Smith,Jordan,18,11,QB,true,false,true`;

  const result = parseRosterCsv(csv);

  assert.equal(result.errors.length, 0);
  assert.equal(result.players.length, 1);
  assert.deepEqual(result.players[0], {
    firstName: "Jordan",
    lastName: "Smith",
    preferredName: "Jordan",
    jerseyNumber: "18",
    grade: "11",
    position: "QB",
    offenseRole: true,
    defenseRole: false,
    specialTeamsRole: true
  });
});

test("parseRosterCsv returns row-level errors for missing required fields", () => {
  const csv = `firstName,lastName,jerseyNumber,offenseRole,defenseRole,specialTeamsRole
,Smith,,true,false,false`;

  const result = parseRosterCsv(csv);

  assert.equal(result.players.length, 0);
  assert.ok(result.errors.some((error) => error.row === 2 && error.field === "firstName"));
  assert.ok(result.errors.some((error) => error.row === 2 && error.field === "jerseyNumber"));
});

test("parseRosterCsv supports explicit header mapping overrides", () => {
  const csv = `First,Last,#,Grade,Offense
Jordan,Smith,18,11,yes`;

  const result = parseRosterCsv(csv, {
    columnMapping: {
      First: "firstName",
      Last: "lastName",
      "#": "jerseyNumber",
      Grade: "grade",
      Offense: "offenseRole"
    }
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.players[0]?.firstName, "Jordan");
  assert.equal(result.players[0]?.jerseyNumber, "18");
  assert.equal(result.players[0]?.offenseRole, true);
});
