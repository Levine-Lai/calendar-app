const test = require("node:test");
const assert = require("node:assert/strict");
const { sendNotificationsBestEffort } = require("../update-static-news");

test("FCM failure does not fail the news data update", async () => {
  const succeeded = await sendNotificationsBestEffort(
    [{ id: "article-1" }],
    async () => {
      throw new Error("simulated FCM failure");
    },
    () => {}
  );
  assert.equal(succeeded, false);
});
