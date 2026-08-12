const { XMLParser } = require("fast-xml-parser");
const { load } = require("cheerio");
const {
  normalizeArticleParagraphs,
  stableNewsId
} = require("./news-core");

const TEAM_ID = "arsenal";
const TEAM_NAME = "阿森纳";
const OFFICIAL_SITEMAP_URL = "https://www.arsenal.com/sitemaps/articles/1/sitemap.xml";
const GUARDIAN_RSS_URL = "https://www.theguardian.com/football/arsenal/rss";
const MAX_ITEMS = 20;

function asArray(value) {
  return Array.isArray(value) ? value : (value == null ? [] : [value]);
}

function textValue(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return String(value["#text"] || value.__cdata || "");
  return "";
}

function boundedText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stripHtml(value) {
  const source = String(value || "");
  if (!source) return "";
  return boundedText(load(`<main>${source}</main>`)("main").text(), 900);
}

function hostMatches(hostname, allowedHost) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function normalizeArsenalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostMatches(host, "arsenal.com") || !url.pathname.startsWith("/news/")) return "";
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeGuardianUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostMatches(host, "theguardian.com") || !url.pathname.startsWith("/football/")) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(cmp|utm_|ref)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return "";
  }
}

function normalizeArsenalImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostMatches(host, "assets.arsenal.com")) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeGuardianImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostMatches(host, "guim.co.uk")) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeIsoDate(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function parseOfficialSitemap(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const payload = parser.parse(String(xml || ""));
  const seen = new Set();
  return asArray(payload?.urlset?.url)
    .map((entry) => ({
      url: normalizeArsenalUrl(textValue(entry?.loc)),
      modifiedAt: normalizeIsoDate(textValue(entry?.lastmod))
    }))
    .filter((entry) => entry.url && entry.modifiedAt && !seen.has(entry.url) && seen.add(entry.url))
    .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt))
    .slice(0, 24);
}

function findNewsArticleSchema($) {
  let result = null;
  $("script[type='application/ld+json']").each((_, element) => {
    if (result) return;
    try {
      const parsed = JSON.parse($(element).text());
      const candidates = asArray(parsed?.["@graph"]).concat(asArray(parsed));
      result = candidates.find((value) => {
        const types = asArray(value?.["@type"]);
        return types.includes("NewsArticle") || types.includes("Article");
      }) || null;
    } catch {
      // Ignore unrelated or malformed structured-data blocks.
    }
  });
  return result;
}

function firstSchemaImage(schema) {
  const image = asArray(schema?.image)[0];
  return typeof image === "string" ? image : image?.url;
}

function schemaAuthor(schema) {
  const author = asArray(schema?.author)[0];
  return typeof author === "string" ? author : author?.name;
}

function parseNextData($) {
  const source = $("#__NEXT_DATA__").text();
  if (!source || source.length > 900_000) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function textFromHtmlFragment(value) {
  const source = String(value || "");
  return source ? load(`<main>${source}</main>`)("main").text() : "";
}

function extractOfficialArticleParagraphs($) {
  const nextArticle = parseNextData($)?.props?.pageProps?.article;
  const blocks = asArray(nextArticle?.articleBody);
  const structuredParagraphs = blocks
    .filter((block) => block?.type === "TEXT")
    .map((block) => block.innerText || textFromHtmlFragment(block.html))
    .filter(Boolean);
  const normalizedStructured = normalizeArticleParagraphs(structuredParagraphs);
  if (normalizedStructured.length) return normalizedStructured;

  const selectors = [
    "main [class*='Page_page_normal_content'] [class*='Text_text'] p",
    "main [class*='Text_text'] p",
    "main article p"
  ];
  for (const selector of selectors) {
    const paragraphs = $(selector).map((_, element) => $(element).text()).get();
    const normalized = normalizeArticleParagraphs(paragraphs);
    if (normalized.length) return normalized;
  }
  return [];
}

function parseOfficialArticle(html, sitemapEntry = {}) {
  const source = String(html || "");
  if (!source || Buffer.byteLength(source, "utf8") > 1024 * 1024) return null;
  const $ = load(source);
  const schema = findNewsArticleSchema($) || {};
  if (schema.isAccessibleForFree === false || schema.isAccessibleForFree === "false") return null;
  const url = normalizeArsenalUrl(
    schema?.mainEntityOfPage?.["@id"]
      || schema?.url
      || $("link[rel='canonical']").attr("href")
      || sitemapEntry.url
  );
  const titleEn = boundedText(schema.headline || $("meta[property='og:title']").attr("content") || $("title").text(), 240);
  const summaryEn = boundedText(schema.description || $("meta[name='description']").attr("content"), 900);
  const publishedAt = normalizeIsoDate(schema.datePublished || sitemapEntry.modifiedAt);
  const imageUrl = normalizeArsenalImageUrl(firstSchemaImage(schema) || $("meta[property='og:image']").attr("content"));
  if (!url || !titleEn || !publishedAt || !imageUrl) return null;
  const articleParagraphs = extractOfficialArticleParagraphs($);
  return {
    id: stableNewsId(url),
    teamId: TEAM_ID,
    teamName: TEAM_NAME,
    titleEn,
    summaryEn,
    bodyEn: articleParagraphs.length ? articleParagraphs : normalizeArticleParagraphs([summaryEn]),
    imageUrl,
    author: boundedText($("meta[name='author']").attr("content") || schemaAuthor(schema) || "Arsenal FC", 80),
    publishedAt,
    url,
    source: "Arsenal.com"
  };
}

function guardianMediaUrl(raw) {
  const candidates = [
    ...asArray(raw?.["media:content"]),
    ...asArray(raw?.["media:thumbnail"])
  ];
  for (const candidate of candidates) {
    const url = normalizeGuardianImageUrl(candidate?.["@_url"] || candidate?.url || textValue(candidate));
    if (url) return url;
  }
  return "";
}

function parseGuardianFeed(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
    trimValues: true
  });
  const payload = parser.parse(String(xml || ""));
  const seen = new Set();
  const items = [];
  asArray(payload?.rss?.channel?.item).forEach((raw) => {
    const url = normalizeGuardianUrl(textValue(raw?.link) || textValue(raw?.guid));
    const titleEn = boundedText(textValue(raw?.title), 240);
    const summaryEn = stripHtml(textValue(raw?.description) || textValue(raw?.["content:encoded"]));
    const publishedAt = normalizeIsoDate(textValue(raw?.pubDate) || textValue(raw?.["dc:date"]));
    const imageUrl = guardianMediaUrl(raw);
    if (!url || !titleEn || !publishedAt || !imageUrl || seen.has(url)) return;
    seen.add(url);
    items.push({
      id: stableNewsId(url),
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      titleEn,
      summaryEn,
      bodyEn: normalizeArticleParagraphs([summaryEn]),
      imageUrl,
      author: boundedText(textValue(raw?.["dc:creator"]) || textValue(raw?.author) || "The Guardian", 80),
      publishedAt,
      url,
      source: "The Guardian"
    });
  });
  return items.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt)).slice(0, 20);
}

function extractGuardianArticleParagraphs($, schema = {}) {
  const selectors = [
    "#maincontent [data-gu-name='body'] p",
    "#maincontent [data-component='ArticleBody'] p",
    "#maincontent article p",
    "article [data-gu-name='body'] p"
  ];
  for (const selector of selectors) {
    const paragraphs = $(selector).map((_, element) => $(element).text()).get();
    const normalized = normalizeArticleParagraphs(paragraphs);
    if (normalized.length) return normalized;
  }
  const schemaBody = typeof schema.articleBody === "string"
    ? schema.articleBody.split(/\n{2,}/)
    : [];
  return normalizeArticleParagraphs(schemaBody);
}

function parseGuardianArticle(html, feedItem = {}) {
  const source = String(html || "");
  if (!source || Buffer.byteLength(source, "utf8") > 3 * 1024 * 1024) return feedItem;
  const $ = load(source);
  const schema = findNewsArticleSchema($) || {};
  const canonicalUrl = normalizeGuardianUrl(
    schema?.mainEntityOfPage?.["@id"]
      || schema?.url
      || $("link[rel='canonical']").attr("href")
      || feedItem.url
  );
  if (!canonicalUrl || (feedItem.url && canonicalUrl !== normalizeGuardianUrl(feedItem.url))) return feedItem;
  const paragraphs = extractGuardianArticleParagraphs($, schema);
  if (!paragraphs.length) return feedItem;
  return {
    ...feedItem,
    bodyEn: paragraphs
  };
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== "object") return null;
  const source = item.source === "The Guardian" ? "The Guardian" : "Arsenal.com";
  const url = source === "The Guardian" ? normalizeGuardianUrl(item.url) : normalizeArsenalUrl(item.url);
  const imageUrl = source === "The Guardian"
    ? normalizeGuardianImageUrl(item.imageUrl)
    : normalizeArsenalImageUrl(item.imageUrl);
  const publishedAt = normalizeIsoDate(item.publishedAt);
  const titleEn = boundedText(item.titleEn, 240);
  if (!url || !imageUrl || !publishedAt || !titleEn) return null;
  return {
    ...item,
    id: stableNewsId(url),
    teamId: TEAM_ID,
    teamName: TEAM_NAME,
    titleEn,
    summaryEn: boundedText(item.summaryEn, 900),
    bodyEn: normalizeArticleParagraphs(item.bodyEn),
    titleZh: boundedText(item.titleZh, 240),
    summaryZh: boundedText(item.summaryZh, 900),
    bodyZh: normalizeArticleParagraphs(item.bodyZh),
    imageUrl,
    author: boundedText(item.author, 80),
    publishedAt,
    url,
    source
  };
}

function hasCompleteGuardianBody(item) {
  if (item?.source !== "The Guardian") return true;
  const paragraphs = normalizeArticleParagraphs(item.bodyEn);
  const containsLegacyExcerptNotice = paragraphs.some((paragraph) => (
    paragraph === "Open the original Guardian article for the complete free report and author context."
  ));
  return paragraphs.length >= 2 && !containsLegacyExcerptNotice;
}

function mergeArsenalSources(officialItems, guardianItems, previousItems = [], availability = {}) {
  const officialAvailable = availability.official !== false;
  const guardianAvailable = availability.guardian !== false;
  const previous = asArray(previousItems).map(normalizeStoredItem).filter(Boolean);
  const official = officialAvailable
    ? asArray(officialItems).map(normalizeStoredItem).filter(Boolean)
    : previous.filter((item) => item.source === "Arsenal.com");
  const guardian = guardianAvailable
    ? asArray(guardianItems).map(normalizeStoredItem).filter(Boolean).filter(hasCompleteGuardianBody)
    : previous.filter((item) => item.source === "The Guardian").filter(hasCompleteGuardianBody);
  const deduped = new Map();
  [...official, ...guardian].forEach((item) => {
    const existing = deduped.get(item.url);
    if (!existing || Date.parse(item.publishedAt) > Date.parse(existing.publishedAt)) deduped.set(item.url, item);
  });
  const sorted = [...deduped.values()].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  const selected = [
    ...sorted.filter((item) => item.source === "Arsenal.com").slice(0, 12),
    ...sorted.filter((item) => item.source === "The Guardian").slice(0, 8)
  ];
  const selectedUrls = new Set(selected.map((item) => item.url));
  for (const item of sorted) {
    if (selected.length >= MAX_ITEMS) break;
    if (selectedUrls.has(item.url)) continue;
    selected.push(item);
    selectedUrls.add(item.url);
  }
  return selected.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt)).slice(0, MAX_ITEMS);
}

function buildArsenalStaticNewsUpdate(previousPayload, items, updatedAt = new Date()) {
  const previousItems = asArray(previousPayload?.items).map(normalizeStoredItem).filter(Boolean);
  const nextItems = asArray(items).map(normalizeStoredItem).filter(Boolean).slice(0, MAX_ITEMS);
  const changed = JSON.stringify(nextItems) !== JSON.stringify(previousItems);
  return {
    changed,
    payload: changed
      ? {
          teamId: TEAM_ID,
          teamName: TEAM_NAME,
          updatedAt: new Date(updatedAt).toISOString(),
          sources: ["Arsenal.com", "The Guardian"],
          items: nextItems
        }
      : previousPayload
  };
}

module.exports = {
  TEAM_ID,
  TEAM_NAME,
  OFFICIAL_SITEMAP_URL,
  GUARDIAN_RSS_URL,
  normalizeArsenalUrl,
  normalizeGuardianUrl,
  normalizeArsenalImageUrl,
  normalizeGuardianImageUrl,
  parseOfficialSitemap,
  parseOfficialArticle,
  parseGuardianFeed,
  parseGuardianArticle,
  mergeArsenalSources,
  buildArsenalStaticNewsUpdate
};
