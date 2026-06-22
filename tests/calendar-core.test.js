const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../public/calendar-core.js");

const lakers = {
  id: "13",
  league: "nba",
  leagueName: "NBA",
  name: "Los Angeles Lakers",
  abbreviation: "LAL"
};
const celtics = {
  id: "2",
  league: "nba",
  leagueName: "NBA",
  name: "Boston Celtics",
  abbreviation: "BOS"
};

test("shared games retain every followed team", () => {
  const base = { id: "nba-1", league: "nba", title: "LAL @ BOS" };
  const first = core.attachTeamToEvent(base, lakers);
  const second = core.attachTeamToEvent(base, celtics);
  const merged = core.mergeEventRecords(first, second);

  assert.deepEqual(merged.importedTeams.map((team) => team.key), ["nba:13", "nba:2"]);
});

test("detaching one team preserves a shared game", () => {
  const shared = core.mergeEventRecords(
    core.attachTeamToEvent({ id: "nba-1", league: "nba" }, lakers),
    core.attachTeamToEvent({ id: "nba-1", league: "nba" }, celtics)
  );
  const remaining = core.detachTeamFromEvent(shared, "nba:13");

  assert.ok(remaining);
  assert.deepEqual(remaining.importedTeams.map((team) => team.key), ["nba:2"]);
  assert.equal(core.detachTeamFromEvent(remaining, "nba:2"), null);
});

test("string false is not treated as completed", () => {
  assert.equal(core.parseBoolean("false"), false);
  assert.equal(core.parseBoolean("1"), true);
});

test("month grid covers all 42 visible days", () => {
  const range = core.getMonthGridRange(new Date(2026, 5, 21));
  assert.equal(range.start.getFullYear(), 2026);
  assert.equal(range.start.getMonth(), 4);
  assert.equal(range.start.getDate(), 31);
  assert.equal(range.end.getMonth(), 6);
  assert.equal(range.end.getDate(), 11);
});

test("ICS TZID values convert to UTC", () => {
  assert.equal(
    core.parseIcsDate("20260621T200000", "America/New_York"),
    "2026-06-22T00:00:00.000Z"
  );
});

test("image URLs are safe for the Android HTTPS WebView", () => {
  assert.equal(core.normalizeImageUrl("http://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
  assert.equal(core.normalizeImageUrl("//cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
  assert.equal(core.normalizeImageUrl("public/assets/leagues/nba.png"), "public/assets/leagues/nba.png");
  assert.equal(core.normalizeImageUrl("javascript:alert(1)", "fallback.png"), "fallback.png");
});
