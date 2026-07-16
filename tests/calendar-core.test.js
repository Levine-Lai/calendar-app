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

test("future games are not treated as live", () => {
  const now = new Date("2026-07-09T03:00:00.000Z");
  const futureGame = {
    start: "2026-07-12T23:10:00.000Z",
    status: "7:10 PM",
    statusState: "in",
    completed: false
  };

  assert.equal(core.isLiveStatusText("07:10"), false);
  assert.equal(core.isLiveStatusText("7:10 PM"), false);
  assert.equal(core.isEventLive(futureGame, { now }), false);
});

test("postponed and canceled games are not finished or live", () => {
  const postponed = { status: "Postponed", statusState: "post", completed: false, start: new Date(Date.now() - 3600000).toISOString() };
  const canceled = { status: "比赛取消", statusState: "post", completed: false, start: new Date(Date.now() - 3600000).toISOString() };
  assert.equal(core.classifyEventStatus(postponed), "postponed");
  assert.equal(core.classifyEventStatus(canceled), "canceled");
  assert.equal(core.isEventFinished(postponed), false);
  assert.equal(core.isEventLive(canceled), false);
});

test("ambiguous status fragments are not treated as live", () => {
  assert.equal(core.isLiveStatusText("half postponed"), false);
  assert.equal(core.isLiveStatusText("coach's review"), false);
  assert.equal(core.isLiveStatusText("45'"), true);
});

test("event merge preserves useful fields when provider sends blanks", () => {
  const merged = core.mergeEventRecords(
    { id: "game-1", start: "2026-07-12T10:00:00Z", homeLogo: "https://example.com/home.png", homeScore: "2" },
    { id: "game-1", start: "2026-07-12T10:00:00Z", homeLogo: "", homeScore: "" }
  );
  assert.equal(merged.homeLogo, "https://example.com/home.png");
  assert.equal(merged.homeScore, "2");
});

test("score objects are normalized without rendering object text", () => {
  assert.equal(core.normalizeScoreValue({ displayValue: "5", value: 5 }), "5");
  assert.equal(core.normalizeScoreValue({ value: { total: 3 } }), "3");
  assert.equal(core.normalizeScoreValue({ unexpected: true }), "");
  assert.equal(core.normalizeScoreValue("[object Object]"), "");
  assert.equal(core.isInvalidScoreValue({ unexpected: true }), true);

  const normalized = core.mergeEventRecords(null, {
    id: "mlb-object-score",
    homeScore: { displayValue: "4" },
    awayScore: { value: 2 }
  });
  assert.equal(normalized.homeScore, "4");
  assert.equal(normalized.awayScore, "2");
});

test("imported colors are restricted to hex values", () => {
  assert.equal(core.sanitizeColor("#ABCDEF"), "#abcdef");
  assert.equal(core.sanitizeColor("red;background:url(https://example.com)"), "#c7e6eb");
});
