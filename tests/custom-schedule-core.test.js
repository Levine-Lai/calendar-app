const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../public/custom-schedule-core.js");

test("natural language custom schedule recognizes a home fixture", () => {
  const draft = core.parseScheduleDescription(
    "阿森纳在 8 月 26 号晚上 8 点主场打赫罗纳",
    { referenceDate: new Date(2026, 7, 5) }
  );
  assert.deepEqual(draft.missing, []);
  assert.equal(draft.date, "2026-08-26");
  assert.equal(draft.time, "20:00");
  assert.equal(draft.homeTeam, "阿森纳");
  assert.equal(draft.awayTeam, "赫罗纳");
  assert.equal(draft.orientation, "explicit-home");
});

test("natural language custom schedule swaps teams for an away fixture", () => {
  const draft = core.parseScheduleDescription(
    "阿森纳 9 月 1 日上午 10 点客场挑战赫罗纳",
    { referenceDate: new Date(2026, 7, 5) }
  );
  assert.deepEqual(draft.missing, []);
  assert.equal(draft.homeTeam, "赫罗纳");
  assert.equal(draft.awayTeam, "阿森纳");
  assert.equal(draft.time, "10:00");
});

test("custom schedule asks for omitted details instead of inventing them", () => {
  const draft = core.parseScheduleDescription(
    "8 月 26 日阿森纳主场打赫罗纳",
    { referenceDate: new Date(2026, 7, 5) }
  );
  assert.deepEqual(draft.missing, ["开赛时间"]);
  assert.equal(core.isCompleteScheduleDraft(draft), false);
});

test("complete custom schedule becomes a local non-managed event", () => {
  const event = core.createCustomEvent({
    rawText: "阿森纳在 8 月 26 号晚上 8 点主场打赫罗纳",
    date: "2026-08-26",
    time: "20:00",
    homeTeam: "阿森纳",
    awayTeam: "赫罗纳",
    missing: []
  }, { id: "custom-test" });
  assert.equal(event.id, "custom-test");
  assert.equal(event.custom, true);
  assert.equal(event.managedImport, false);
  assert.equal(event.homeTeam, "阿森纳");
  assert.equal(event.awayTeam, "赫罗纳");
  assert.equal(event.status, "Scheduled");
});
