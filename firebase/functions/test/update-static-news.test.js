const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sendNotificationsBestEffort,
  buildFcmRequest,
  validateFcmBestEffort,
  parseServiceAccount
} = require("../update-static-news");

const validServiceAccount = {
  project_id: "sports-calendar-test",
  client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n"
};

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

test("FCM HTTP v1 request uses a high-priority data message and validate_only", () => {
  const request = buildFcmRequest({
    id: "article-1",
    titleEn: "Blue Jays story",
    summaryEn: "Story summary",
    url: "https://www.mlb.com/bluejays/news/article-1"
  }, true);
  assert.equal(request.validate_only, true);
  assert.equal(request.message.notification, undefined);
  assert.equal(request.message.android.priority, "high");
  assert.equal(request.message.data.title, "Blue Jays story");
  assert.equal(request.message.data.body, "Story summary");
  assert.equal(request.message.data.newsId, "article-1");
});

test("FCM validation failure is reported without failing the workflow", async () => {
  const succeeded = await validateFcmBestEffort(async () => {
    throw new Error("simulated validation failure");
  });
  assert.equal(succeeded, false);
});

test("service account secret accepts JSON, quoted JSON and Base64 JSON", () => {
  const json = JSON.stringify(validServiceAccount);
  assert.deepEqual(parseServiceAccount(json), validServiceAccount);
  assert.deepEqual(parseServiceAccount(JSON.stringify(json)), validServiceAccount);
  assert.deepEqual(parseServiceAccount(Buffer.from(json).toString("base64")), validServiceAccount);
});

test("service account secret identifies google-services.json", () => {
  assert.throws(
    () => parseServiceAccount(JSON.stringify({ project_info: {}, client: [] })),
    /google-services\.json/
  );
});
