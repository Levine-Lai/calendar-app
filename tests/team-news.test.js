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
    bodyEn: [" First paragraph. ", "This browser does not support the video element.", "Second paragraph."],
    titleZh: "蓝鸟新闻",
    summaryZh: "中文摘要",
    bodyZh: [" 第一段。 ", "第二段。"]
  });
  assert.deepEqual(item.bodyEn, ["First paragraph.", "Second paragraph."]);
  assert.equal(item.titleZh, "蓝鸟新闻");
  assert.deepEqual(item.bodyZh, ["第一段。", "第二段。"]);
});

test("team news language pages select matching titles, summaries and bodies", () => {
  const item = {
    titleEn: "Blue Jays update",
    summaryEn: "English summary.",
    bodyEn: ["English body."],
    titleZh: "蓝鸟动态",
    summaryZh: "中文摘要。",
    bodyZh: ["中文正文。"]
  };
  assert.deepEqual(TeamNews.localizeNewsItem(item, "zh"), {
    language: "zh",
    title: "蓝鸟动态",
    summary: "中文摘要。",
    body: ["中文正文。"]
  });
  assert.deepEqual(TeamNews.localizeNewsItem(item, "en"), {
    language: "en",
    title: "Blue Jays update",
    summary: "English summary.",
    body: ["English body."]
  });
});

test("Chinese news page falls back to English for untranslated articles", () => {
  const localized = TeamNews.localizeNewsItem({
    titleEn: "Untranslated story",
    summaryEn: "English only.",
    bodyEn: ["Original paragraph."]
  }, "zh");
  assert.equal(localized.title, "Untranslated story");
  assert.equal(localized.summary, "English only.");
  assert.deepEqual(localized.body, ["Original paragraph."]);
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

test("freshest news payload wins even when a stale CDN responds first", () => {
  const stale = {
    updatedAt: "2026-07-17T01:00:00Z",
    items: [{
      id: "old",
      titleEn: "Old story",
      publishedAt: "2026-07-16T19:00:00Z",
      url: "https://www.mlb.com/bluejays/news/old"
    }]
  };
  const fresh = {
    updatedAt: "2026-07-17T14:00:00Z",
    items: [{
      id: "fresh",
      titleEn: "Fresh story",
      publishedAt: "2026-07-17T13:00:00Z",
      url: "https://www.mlb.com/bluejays/news/fresh"
    }]
  };
  assert.equal(TeamNews.selectFreshestNewsPayload([stale, fresh]).items[0].id, "fresh");
});

test("live MLB feed keeps static bilingual content when payloads are merged", () => {
  const live = {
    updatedAt: "2026-07-17T14:00:00Z",
    items: [{
      id: "article",
      titleEn: "Live title",
      publishedAt: "2026-07-17T13:00:00Z",
      url: "https://www.mlb.com/bluejays/news/article"
    }]
  };
  const staticPayload = {
    updatedAt: "2026-07-17T13:30:00Z",
    items: [{
      id: "article",
      titleEn: "Live title",
      bodyEn: ["Full article paragraph."],
      titleZh: "蓝鸟最新消息",
      summaryZh: "中文摘要",
      bodyZh: ["完整文章段落。"],
      publishedAt: "2026-07-17T13:00:00Z",
      url: "https://www.mlb.com/bluejays/news/article"
    }]
  };
  const merged = TeamNews.mergeNewsPayloads(live, [staticPayload]).items[0];
  assert.deepEqual(merged.bodyEn, ["Full article paragraph."]);
  assert.equal(merged.titleZh, "蓝鸟最新消息");
  assert.deepEqual(merged.bodyZh, ["完整文章段落。"]);
});
