const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { main } = require("../wait-for-published-news");

test("notification readiness waits for the exact GitHub-published cache", async () => {
  const payload = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "public", "news", "blue-jays.json"),
    "utf8"
  ));
  const calls = [];
  const result = await main(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => payload };
  });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url.href || String(calls[0].url), /published_check=/);
  assert.equal(calls[0].options.cache, "no-store");
});
