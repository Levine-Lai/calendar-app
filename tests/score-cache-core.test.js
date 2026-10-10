const test = require("node:test");
const assert = require("node:assert/strict");
const ScoreCacheCore = require("../public/score-cache-core");

const nbaEvent = {
  id: "401810000",
  date: "2026-10-10T23:30:00Z",
  competitions: [{
    status: { type: { state: "pre", completed: false, shortDetail: "10/11 - 07:30" } },
    competitors: [
      { homeAway: "away", score: "101", team: { displayName: "Toronto Raptors", logo: "https://example.com/tor.png" } },
      { homeAway: "home", score: "99", team: { displayName: "Los Angeles Lakers", logo: "https://example.com/lal.png" } }
    ]
  }]
};

test("NBA is included in the published score fallback leagues", () => {
  assert.deepEqual(
    ScoreCacheCore.ESPN_LEAGUES.find((league) => league.id === "nba"),
    { id: "nba", sport: "basketball", league: "nba" }
  );
});

test("score cache normalizes NBA events and preserves teams and scores", () => {
  const payload = ScoreCacheCore.buildPayload({ nba: [nbaEvent] }, new Date("2026-10-10T12:00:00Z"));
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].league, "nba");
  assert.equal(payload.items[0].awayTeam, "Toronto Raptors");
  assert.equal(payload.items[0].homeScore, "99");
});

test("published fallback accepts fresh cache and rejects stale cache", () => {
  const payload = ScoreCacheCore.buildPayload({ nba: [nbaEvent] }, new Date("2026-10-10T12:00:00Z"));
  const rangeStart = new Date("2026-10-10T00:00:00Z");
  const rangeEnd = new Date("2026-10-12T00:00:00Z");
  assert.equal(ScoreCacheCore.selectItems(payload, "nba", rangeStart, rangeEnd, 7200000, Date.parse("2026-10-10T13:00:00Z")).length, 1);
  assert.equal(ScoreCacheCore.selectItems(payload, "nba", rangeStart, rangeEnd, 7200000, Date.parse("2026-10-10T15:00:01Z")).length, 0);
});
