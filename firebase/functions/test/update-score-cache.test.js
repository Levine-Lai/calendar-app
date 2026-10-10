const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreDates, fetchLeagueDate } = require("../update-score-cache");

test("score cache covers Beijing yesterday, today and tomorrow", () => {
  assert.deepEqual(
    scoreDates(new Date("2026-10-10T08:00:00Z")),
    ["20261009", "20261010", "20261011"]
  );
});

test("score updater falls back from ESPN site API to its independent CDN", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.startsWith("https://site.api.espn.com/")) return { ok: false, status: 503, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: { sbData: { events: [{ id: "nba-cdn-event" }] } } })
    };
  };
  const events = await fetchLeagueDate({ sport: "basketball", league: "nba" }, "20261010", fetchImpl);
  assert.deepEqual(events, [{ id: "nba-cdn-event" }]);
  assert.equal(requested.length, 4);
  assert.equal(requested.filter((url) => url.startsWith("https://site.api.espn.com/")).length, 3);
  assert.match(requested[3], /^https:\/\/cdn\.espn\.com\/core\/nba\/scoreboard/);
});
