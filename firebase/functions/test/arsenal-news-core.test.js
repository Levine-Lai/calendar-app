const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseOfficialSitemap,
  parseOfficialArticle,
  parseGuardianFeed,
  parseGuardianArticle,
  mergeArsenalSources,
  buildArsenalStaticNewsUpdate
} = require("../arsenal-news-core");

const officialItem = {
  id: "official",
  teamId: "arsenal",
  teamName: "阿森纳",
  titleEn: "Official Arsenal update",
  summaryEn: "Official summary.",
  bodyEn: ["Official summary."],
  imageUrl: "https://assets.arsenal.com/prod/images/xl_landscape/story.webp",
  author: "Arsenal FC",
  publishedAt: "2026-08-10T08:00:00.000Z",
  url: "https://www.arsenal.com/news/official-update-a123",
  source: "Arsenal.com"
};

const guardianItem = {
  id: "guardian",
  teamId: "arsenal",
  teamName: "阿森纳",
  titleEn: "Guardian Arsenal report",
  summaryEn: "Guardian summary.",
  bodyEn: ["Guardian complete paragraph one.", "Guardian complete paragraph two."],
  imageUrl: "https://media.guim.co.uk/example/story.jpg",
  author: "Reporter",
  publishedAt: "2026-08-10T07:00:00.000Z",
  url: "https://www.theguardian.com/football/2026/aug/10/arsenal-report",
  source: "The Guardian"
};

test("official Arsenal sitemap keeps recent news URLs only", () => {
  const items = parseOfficialSitemap(`<?xml version="1.0"?><urlset>
    <url><loc>https://www.arsenal.com/news/new-story-a123</loc><lastmod>2026-08-10T08:00:00Z</lastmod></url>
    <url><loc>https://www.arsenal.com/gallery/not-news-a456</loc><lastmod>2026-08-10T09:00:00Z</lastmod></url>
    <url><loc>https://example.com/news/untrusted</loc><lastmod>2026-08-10T10:00:00Z</lastmod></url>
  </urlset>`);
  assert.deepEqual(items, [{
    url: "https://www.arsenal.com/news/new-story-a123",
    modifiedAt: "2026-08-10T08:00:00.000Z"
  }]);
});

test("official Arsenal article parser requires free structured metadata", () => {
  const item = parseOfficialArticle(`<!doctype html><html><head>
    <meta name="author" content="Stephen Wright">
    <link rel="canonical" href="https://www.arsenal.com/news/story-a123">
    <script type="application/ld+json">${JSON.stringify({
      "@type": "NewsArticle",
      headline: "Arsenal story",
      description: "A concise official summary.",
      datePublished: "2026-08-10T08:00:00Z",
      image: ["https://assets.arsenal.com/prod/images/xl_landscape/story.webp"],
      isAccessibleForFree: true
    })}</script>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          article: {
            articleBody: [
              { type: "HEADER", title: "Arsenal story" },
              { type: "TEXT", innerText: "The complete first paragraph." },
              { type: "TEXT", html: "<p>The <strong>complete second paragraph</strong>.</p>" }
            ]
          }
        }
      }
    })}</script>
  </head></html>`);
  assert.equal(item.titleEn, "Arsenal story");
  assert.equal(item.source, "Arsenal.com");
  assert.equal(item.author, "Stephen Wright");
  assert.deepEqual(item.bodyEn, ["The complete first paragraph.", "The complete second paragraph."]);
});

test("Guardian article parser replaces the RSS excerpt with complete body paragraphs", () => {
  const feedItem = {
    ...guardianItem,
    bodyEn: ["RSS excerpt."]
  };
  const item = parseGuardianArticle(`<!doctype html><html><head>
    <link rel="canonical" href="${feedItem.url}">
  </head><body><main id="maincontent"><article><div data-gu-name="body">
    <p>Complete Guardian paragraph one.</p>
    <p>Complete Guardian paragraph two.</p>
  </div></article></main></body></html>`, feedItem);
  assert.deepEqual(item.bodyEn, ["Complete Guardian paragraph one.", "Complete Guardian paragraph two."]);
});

test("Guardian Arsenal RSS produces free-source cards with images", () => {
  const items = parseGuardianFeed(`<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>
    <title>Arsenal report</title>
    <link>https://www.theguardian.com/football/2026/aug/10/arsenal-report?CMP=rss</link>
    <description><![CDATA[<p>A free report about Arsenal.</p>]]></description>
    <dc:creator>Guardian Reporter</dc:creator>
    <pubDate>Mon, 10 Aug 2026 07:00:00 GMT</pubDate>
    <media:content url="https://media.guim.co.uk/example/story.jpg" />
  </item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "The Guardian");
  assert.equal(items[0].summaryEn, "A free report about Arsenal.");
  assert.doesNotMatch(items[0].url, /CMP/);
});

test("dual-source merge retains cached source when one provider is unavailable", () => {
  const merged = mergeArsenalSources([], [guardianItem], [officialItem], {
    official: false,
    guardian: true
  });
  assert.deepEqual(merged.map((item) => item.source).sort(), ["Arsenal.com", "The Guardian"]);
});

test("dual-source merge hides Guardian RSS excerpts until the article body is available", () => {
  const excerptOnly = {
    ...guardianItem,
    bodyEn: ["Guardian summary."]
  };
  const merged = mergeArsenalSources([officialItem], [excerptOnly], [], {
    official: true,
    guardian: true
  });
  assert.deepEqual(merged.map((item) => item.source), ["Arsenal.com"]);
});

test("Arsenal static payload advertises both server-cache sources", () => {
  const update = buildArsenalStaticNewsUpdate(null, [officialItem, guardianItem], new Date("2026-08-10T10:00:00Z"));
  assert.equal(update.changed, true);
  assert.deepEqual(update.payload.sources, ["Arsenal.com", "The Guardian"]);
  assert.equal(update.payload.items.length, 2);
});
