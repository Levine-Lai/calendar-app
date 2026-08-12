const fs = require("node:fs");
const path = require("node:path");
const {
  OFFICIAL_SITEMAP_URL,
  GUARDIAN_RSS_URL,
  parseOfficialSitemap,
  parseOfficialArticle,
  parseGuardianFeed,
  parseGuardianArticle,
  mergeArsenalSources,
  buildArsenalStaticNewsUpdate
} = require("./arsenal-news-core");
const { enrichTranslations } = require("./update-static-news");

const root = path.resolve(__dirname, "..", "..");
const outputFile = path.join(root, "public", "news", "arsenal.json");
const MAX_RESPONSE_BYTES = 1024 * 1024;

async function fetchText(url, accept, timeoutMs = 20000, fetchImpl = fetch, maxResponseBytes = MAX_RESPONSE_BYTES) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept,
          "user-agent": "SportsCalendarArsenalNews/2.3.1 (+https://github.com/Levine-Lai/calendar-app)"
        },
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
      const declaredLength = Number(response.headers?.get?.("content-length") || 0);
      if (declaredLength > maxResponseBytes) throw new Error("response exceeded the configured size limit");
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > maxResponseBytes) throw new Error("response exceeded the configured size limit");
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("news source request failed");
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchOfficialNews(fetchImpl = fetch) {
  const sitemap = await fetchText(
    OFFICIAL_SITEMAP_URL,
    "application/xml,text/xml",
    20000,
    fetchImpl
  );
  const entries = parseOfficialSitemap(sitemap).slice(0, 14);
  if (!entries.length) throw new Error("Arsenal sitemap did not contain recent free news");
  const articles = await mapWithConcurrency(entries, 3, async (entry) => {
    try {
      const html = await fetchText(entry.url, "text/html,application/xhtml+xml", 20000, fetchImpl);
      return parseOfficialArticle(html, entry);
    } catch (error) {
      process.stderr.write(`Official Arsenal article skipped: ${entry.url} (${error.message})\n`);
      return null;
    }
  });
  const valid = articles.filter(Boolean);
  if (!valid.length) throw new Error("Arsenal article pages did not contain readable metadata");
  return valid;
}

async function fetchGuardianNews(fetchImpl = fetch) {
  const xml = await fetchText(
    GUARDIAN_RSS_URL,
    "application/rss+xml,application/xml,text/xml",
    20000,
    fetchImpl
  );
  const items = parseGuardianFeed(xml);
  if (!items.length) throw new Error("Guardian Arsenal RSS did not contain valid items");
  return mapWithConcurrency(items.slice(0, 8), 2, async (item) => {
    try {
      const html = await fetchText(
        item.url,
        "text/html,application/xhtml+xml",
        20000,
        fetchImpl,
        3 * 1024 * 1024
      );
      return parseGuardianArticle(html, item);
    } catch (error) {
      process.stderr.write(`Guardian article body unavailable: ${item.url} (${error.message})\n`);
      return item;
    }
  });
}

function readPreviousPayload() {
  if (!fs.existsSync(outputFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } catch {
    throw new Error("Existing Arsenal news JSON is invalid");
  }
}

function writePayload(payload) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, outputFile);
}

async function collectSourceResults(fetchImpl = fetch) {
  const [officialResult, guardianResult] = await Promise.allSettled([
    fetchOfficialNews(fetchImpl),
    fetchGuardianNews(fetchImpl)
  ]);
  if (officialResult.status === "rejected") {
    process.stderr.write(`::warning title=Arsenal.com source unavailable::${officialResult.reason.message}\n`);
  }
  if (guardianResult.status === "rejected") {
    process.stderr.write(`::warning title=Guardian RSS source unavailable::${guardianResult.reason.message}\n`);
  }
  if (officialResult.status === "rejected" && guardianResult.status === "rejected") {
    throw new Error("Both Arsenal news sources are unavailable; existing GitHub cache remains unchanged");
  }
  return {
    official: officialResult.status === "fulfilled" ? officialResult.value : [],
    guardian: guardianResult.status === "fulfilled" ? guardianResult.value : [],
    officialAvailable: officialResult.status === "fulfilled",
    guardianAvailable: guardianResult.status === "fulfilled"
  };
}

async function main(options = {}) {
  const previousPayload = readPreviousPayload();
  const sources = await collectSourceResults(options.fetchImpl || fetch);
  const merged = mergeArsenalSources(
    sources.official,
    sources.guardian,
    previousPayload?.items,
    { official: sources.officialAvailable, guardian: sources.guardianAvailable }
  );
  const translated = await enrichTranslations(merged, previousPayload, {
    apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
    fetchImpl: options.fetchImpl,
    context: { teamId: "arsenal" }
  });
  const update = buildArsenalStaticNewsUpdate(previousPayload, translated);
  if (!update.changed) {
    process.stdout.write("Arsenal news is already current.\n");
    return update.payload;
  }
  writePayload(update.payload);
  process.stdout.write(
    `Updated ${path.relative(root, outputFile)} with ${update.payload.items.length} article(s) from Arsenal.com and The Guardian.\n`
  );
  return update.payload;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Arsenal news update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchText,
  fetchOfficialNews,
  fetchGuardianNews,
  collectSourceResults,
  main
};
