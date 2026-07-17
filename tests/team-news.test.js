const test = require("node:test");
const assert = require("node:assert/strict");

const TeamNews = require("../public/team-news-core");

test("team news accepts only HTTPS MLB article links", () => {
  assert.equal(TeamNews.normalizeMlbUrl("http://www.mlb.com/bluejays/news/test"), "");
  assert.equal(TeamNews.normalizeMlbUrl("https://example.com/news/test"), "");
  assert.equal(
    TeamNews.normalizeMlbUrl("https://www.mlb.com/bluejays/news/test"),
    "https://www.mlb.com/bluejays/news/test"
  );
});

test("team news payload is sorted and deduplicated", () => {
  const payload = TeamNews.normalizeNewsPayload({
    updatedAt: "2026-07-16T08:00:00Z",
    items: [
      {
        id: "older",
        titleEn: "Older story",
        publishedAt: "2026-07-15T08:00:00Z",
        url: "https://www.mlb.com/bluejays/news/older"
      },
      {
        id: "newer",
        titleEn: "Latest story",
        summaryEn: "An English summary.",
        publishedAt: "2026-07-16T07:00:00Z",
        url: "https://www.mlb.com/bluejays/news/newer"
      },
      {
        id: "newer",
        titleEn: "Duplicate story",
        publishedAt: "2026-07-16T07:00:00Z",
        url: "https://www.mlb.com/bluejays/news/newer"
      }
    ]
  });

  assert.deepEqual(payload.items.map((item) => item.id), ["newer", "older"]);
  assert.equal(payload.items[0].teamName, "多伦多蓝鸟");
});

test("team news keeps bounded preloaded article paragraphs", () => {
  const item = TeamNews.normalizeNewsItem({
    id: "body-test",
    titleEn: "Blue Jays story",
    publishedAt: "2026-07-17T00:00:00Z",
    url: "https://www.mlb.com/bluejays/news/body-test",
    bodyEn: [" First paragraph. ", "This browser does not support the video element.", "Second paragraph."]
  });
  assert.deepEqual(item.bodyEn, ["First paragraph.", "Second paragraph."]);
});

test("team news API request uses a bounded Toronto query", async () => {
  let requestedUrl = "";
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        updatedAt: "2026-07-16T08:00:00Z",
        items: [{
          id: "article-1",
          titleEn: "Blue Jays news",
          publishedAt: "2026-07-16T07:00:00Z",
          url: "https://www.mlb.com/bluejays/news/article-1"
        }]
      })
    };
  };

  const payload = await TeamNews.fetchNews("https://example.cloudfunctions.net/blueJaysNewsApi", { fetchImpl });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("team"), "toronto-blue-jays");
  assert.equal(url.searchParams.get("limit"), "30");
  assert.equal(payload.items.length, 1);
});
