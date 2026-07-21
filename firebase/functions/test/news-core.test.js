const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TEAM_ID,
  NEWS_TOPIC,
  normalizeMlbUrl,
  toMlbAmpUrl,
  extractMlbArticleParagraphs,
  parseBlueJaysFeed,
  publicNewsItem,
  buildStaticNewsUpdate
} = require("../news-core");

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Jays add a reliever]]></title>
    <link>https://www.mlb.com/bluejays/news/jays-add-reliever</link>
    <description><![CDATA[<p>Toronto strengthened its bullpen.</p>]]></description>
    <pubDate>Thu, 16 Jul 2026 04:30:00 GMT</pubDate>
    <author>MLB.com</author>
  </item>
</channel></rss>`;

test("Blue Jays feed produces bounded MLB news", () => {
  const items = parseBlueJaysFeed(sampleFeed);
  assert.equal(items.length, 1);
  assert.equal(items[0].teamId, TEAM_ID);
  assert.equal(items[0].titleEn, "Jays add a reliever");
  assert.equal(items[0].summaryEn, "Toronto strengthened its bullpen.");
  assert.match(items[0].id, /^[a-f0-9]{64}$/);
});

test("only HTTPS MLB article links are accepted", () => {
  assert.equal(normalizeMlbUrl("http://www.mlb.com/news/test"), "");
  assert.equal(normalizeMlbUrl("https://example.com/news/test"), "");
  assert.equal(normalizeMlbUrl("https://www.mlb.com/bluejays/news/test"), "https://www.mlb.com/bluejays/news/test");
});

test("official MLB links map to readable AMP article URLs", () => {
  assert.equal(
    toMlbAmpUrl("https://www.mlb.com/bluejays/news/jays-add-reliever"),
    "https://www.mlb.com/amp/news/jays-add-reliever.html"
  );
  assert.equal(toMlbAmpUrl("https://example.com/news/jays-add-reliever"), "");
});

test("AMP article parser keeps bounded direct paragraphs", () => {
  const paragraphs = extractMlbArticleParagraphs(`
    <html><head><meta name="description" content="Fallback"></head><body>
      <article><p>First paragraph.</p><div><p>Nested advertisement.</p></div><h2>Section</h2>
      <ul><li>Item one</li></ul><p>This browser does not support the video element.</p></article>
    </body></html>
  `);
  assert.deepEqual(paragraphs, ["First paragraph.", "Section", "Item one"]);
});

test("public news keeps bilingual content", () => {
  const item = publicNewsItem({
    id: "article-1",
    titleEn: "Jays add a reliever",
    summaryEn: "Toronto strengthened its bullpen.",
    bodyEn: ["Full article paragraph."],
    titleZh: "蓝鸟补强牛棚",
    summaryZh: "多伦多新增一名后援投手。",
    bodyZh: ["完整文章段落。"],
    publishedAt: new Date("2026-07-16T04:30:00Z"),
    url: "https://www.mlb.com/bluejays/news/jays-add-reliever"
  });
  assert.equal(item.titleEn, "Jays add a reliever");
  assert.equal(item.summaryEn, "Toronto strengthened its bullpen.");
  assert.deepEqual(item.bodyEn, ["Full article paragraph."]);
  assert.equal(item.titleZh, "蓝鸟补强牛棚");
  assert.deepEqual(item.bodyZh, ["完整文章段落。"]);
  assert.equal(NEWS_TOPIC, "toronto_blue_jays_news_en");
});

test("first static update seeds without treating old stories as new", () => {
  const feedItems = parseBlueJaysFeed(sampleFeed);
  const update = buildStaticNewsUpdate(null, feedItems, new Date("2026-07-16T05:00:00Z"));
  assert.equal(update.changed, true);
  assert.equal(update.newItems.length, 0);
  assert.equal(update.payload.items.length, 1);
});

test("later static update identifies only unseen stories", () => {
  const existing = buildStaticNewsUpdate(null, parseBlueJaysFeed(sampleFeed)).payload;
  const newerFeed = sampleFeed.replace(
    "</channel>",
    `<item><title>Jays win again</title><link>https://www.mlb.com/bluejays/news/jays-win-again</link><description>Toronto won.</description><pubDate>Thu, 16 Jul 2026 06:30:00 GMT</pubDate></item></channel>`
  );
  const update = buildStaticNewsUpdate(existing, parseBlueJaysFeed(newerFeed));
  assert.equal(update.changed, true);
  assert.deepEqual(update.newItems.map((item) => item.titleEn), ["Jays win again"]);
});
