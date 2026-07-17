const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendNotificationsBestEffort,
  buildFcmRequest,
  validateFcmBestEffort
} = require("../update-static-news");

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

test("FCM HTTP v1 request uses REST field names and validate_only", () => {
  const request = buildFcmRequest({
    id: "article-1",
    titleEn: "Blue Jays story",
    summaryEn: "Story summary",
    url: "https://www.mlb.com/bluejays/news/article-1"
  }, true);
  assert.equal(request.validate_only, true);
  assert.equal(request.message.android.notification.channel_id, "team_news");
  assert.equal(request.message.android.notification.click_action, "OPEN_TEAM_NEWS");
  assert.equal("channelId" in request.message.android.notification, false);
  assert.equal("clickAction" in request.message.android.notification, false);
});

test("FCM validation failure is reported without failing the workflow", async () => {
  const succeeded = await validateFcmBestEffort(async () => {
    throw new Error("simulated validation failure");
  });
  assert.equal(succeeded, false);
});
