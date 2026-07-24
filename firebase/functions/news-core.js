const crypto = require("node:crypto");
const { XMLParser } = require("fast-xml-parser");
const { load } = require("cheerio");

const TEAM_ID = "toronto-blue-jays";
const TEAM_NAME = "多伦多蓝鸟";
const NEWS_TOPIC = "toronto_blue_jays_news_en";
const RSS_URL = "https://www.mlb.com/bluejays/feeds/news/rss.xml";

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
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
  return boundedText(String(value || "").replace(/<[^>]*>/g, " "), 900);
}

function normalizeMlbUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(hostname === "mlb.com" || hostname.endsWith(".mlb.com"))) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeMlbImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    const trustedHost = hostname === "mlbstatic.com"
      || hostname.endsWith(".mlbstatic.com")
      || hostname === "mlb.com"
      || hostname.endsWith(".mlb.com");
    if (url.protocol !== "https:" || !trustedHost) return "";
    url.pathname = url.pathname.replace(/\/t_w\d{2,4}\//i, "/t_w640/");
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function toMlbAmpUrl(value) {
  const normalized = normalizeMlbUrl(value);
  if (!normalized) return "";
  const pathname = new URL(normalized).pathname;
  const rawSlug = pathname.split("/").filter(Boolean).at(-1) || "";
  const slug = rawSlug.replace(/\.html$/i, "");
  if (!/^[a-z0-9-]{1,180}$/i.test(slug)) return "";
  return `https://www.mlb.com/amp/news/${slug}.html`;
}

function normalizeArticleParagraphs(value) {
  const rawParagraphs = Array.isArray(value) ? value : [];
  const paragraphs = [];
  let totalLength = 0;
  for (const raw of rawParagraphs) {
    const paragraph = boundedText(raw, 5000);
    if (!paragraph || paragraph === "This browser does not support the video element.") continue;
    if (totalLength + paragraph.length > 40_000 || paragraphs.length >= 120) break;
    totalLength += paragraph.length;
    paragraphs.push(paragraph);
  }
  return paragraphs;
}

function extractMlbArticleParagraphs(html) {
  const source = String(html || "");
  if (!source || Buffer.byteLength(source, "utf8") > 768 * 1024) return [];
  const $ = load(source);
  const article = $("article").first();
  if (!article.length) return [];
  const paragraphs = [];
  article.children().each((_, element) => {
    const tagName = String(element.tagName || "").toLowerCase();
    if (["p", "h2", "h3", "blockquote"].includes(tagName)) {
      paragraphs.push($(element).text());
      return;
    }
    if (tagName === "ul" || tagName === "ol") {
      $(element).children("li").each((__, item) => paragraphs.push($(item).text()));
    }
  });
  const normalized = normalizeArticleParagraphs(paragraphs);
  if (normalized.length) return normalized;
  const description = boundedText($("meta[name='description']").attr("content"), 1200);
  return description ? [description] : [];
}

function extractMlbArticleImage(html) {
  const source = String(html || "");
  if (!source || Buffer.byteLength(source, "utf8") > 768 * 1024) return "";
  const $ = load(source);
  return normalizeMlbImageUrl(
    $("meta[property='og:image']").attr("content")
      || $("meta[name='twitter:image']").attr("content")
      || $("amp-img[src*='img.mlbstatic.com/mlb-images']").first().attr("src")
      || $("article img").first().attr("src")
  );
}

function stableNewsId(url) {
  return crypto.createHash("sha256").update(url).digest("hex");
}

function normalizeIsoDate(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function parseBlueJaysFeed(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
    trimValues: true
  });
  const payload = parser.parse(String(xml || ""));
  const rawItems = asArray(payload?.rss?.channel?.item);
  const seen = new Set();
  const items = [];

  rawItems.forEach((raw) => {
    const url = normalizeMlbUrl(textValue(raw?.link) || textValue(raw?.guid));
    const titleEn = boundedText(textValue(raw?.title), 240);
    const publishedTimestamp = Date.parse(textValue(raw?.pubDate));
    if (!url || !titleEn || !Number.isFinite(publishedTimestamp) || seen.has(url)) return;
    seen.add(url);
    items.push({
      id: stableNewsId(url),
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      titleEn,
      summaryEn: stripHtml(textValue(raw?.description)),
      author: boundedText(textValue(raw?.author) || textValue(raw?.["dc:creator"]), 80),
      publishedAt: new Date(publishedTimestamp),
      url,
      source: "MLB.com"
    });
  });

  return items.sort((left, right) => right.publishedAt - left.publishedAt).slice(0, 20);
}

function publicNewsItem(data) {
  const publishedAt = data.publishedAt?.toDate?.() || data.publishedAt;
  return {
    id: boundedText(data.id, 160),
    teamId: TEAM_ID,
    teamName: TEAM_NAME,
    titleEn: boundedText(data.titleEn, 240),
    summaryEn: boundedText(data.summaryEn, 900),
    bodyEn: normalizeArticleParagraphs(data.bodyEn),
    titleZh: boundedText(data.titleZh, 240),
    summaryZh: boundedText(data.summaryZh, 900),
    bodyZh: normalizeArticleParagraphs(data.bodyZh),
    imageUrl: normalizeMlbImageUrl(data.imageUrl),
    translationSourceHash: boundedText(data.translationSourceHash, 64),
    translationModel: boundedText(data.translationModel, 80),
    translatedAt: normalizeIsoDate(data.translatedAt),
    author: boundedText(data.author, 80),
    publishedAt: new Date(publishedAt).toISOString(),
    url: normalizeMlbUrl(data.url),
    source: "MLB.com"
  };
}

function buildStaticNewsUpdate(previousPayload, feedItems, updatedAt = new Date()) {
  const previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : [];
  const items = feedItems
    .map(publicNewsItem)
    .filter((item) => item.id && item.url && item.titleEn && item.publishedAt)
    .slice(0, 20);
  const changed = JSON.stringify(items) !== JSON.stringify(previousItems);
  const previousIds = new Set(previousItems.map((item) => item?.id).filter(Boolean));
  const newItems = previousItems.length
    ? items.filter((item) => !previousIds.has(item.id))
    : [];
  return {
    changed,
    newItems,
    payload: changed
      ? {
          teamId: TEAM_ID,
          teamName: TEAM_NAME,
          updatedAt: new Date(updatedAt).toISOString(),
          items
        }
      : previousPayload
  };
}

module.exports = {
  TEAM_ID,
  TEAM_NAME,
  NEWS_TOPIC,
  RSS_URL,
  normalizeMlbUrl,
  normalizeMlbImageUrl,
  toMlbAmpUrl,
  normalizeArticleParagraphs,
  extractMlbArticleParagraphs,
  extractMlbArticleImage,
  stableNewsId,
  parseBlueJaysFeed,
  publicNewsItem,
  buildStaticNewsUpdate
};
