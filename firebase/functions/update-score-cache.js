const fs = require("node:fs");
const path = require("node:path");
const ScoreCacheCore = require("../../public/score-cache-core");

const root = path.resolve(__dirname, "..", "..");
const outputFile = path.join(root, "public", "scores", "espn.json");
const USER_AGENT = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const CACHE_HEARTBEAT_MS = 30 * 60 * 1000;

function beijingDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function scoreDates(now = new Date()) {
  return [-1, 0, 1].map((offset) => beijingDateKey(new Date(now.getTime() + offset * 86400000)));
}

async function fetchJson(url, fetchImpl = fetch) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("score request failed");
}

async function fetchLeagueDate(config, date, fetchImpl = fetch) {
  const primary = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/scoreboard?dates=${date}&limit=300`;
  try {
    const payload = await fetchJson(primary, fetchImpl);
    return Array.isArray(payload.events) ? payload.events : [];
  } catch (primaryError) {
    const fallbackPath = config.sport === "soccer" ? "soccer" : config.league;
    const leagueQuery = config.sport === "soccer" ? `&league=${encodeURIComponent(config.league)}` : "";
    const fallback = `https://cdn.espn.com/core/${fallbackPath}/scoreboard?xhr=1&dates=${date}&limit=300${leagueQuery}`;
    try {
      const payload = await fetchJson(fallback, fetchImpl);
      return Array.isArray(payload?.content?.sbData?.events) ? payload.content.sbData.events : [];
    } catch (fallbackError) {
      throw new Error(`${primaryError.message}; CDN fallback: ${fallbackError.message}`);
    }
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } catch {
    return null;
  }
}

function writePayload(payload) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const temporary = `${outputFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, outputFile);
}

async function main(options = {}) {
  const dates = options.dates || scoreDates(options.now || new Date());
  const eventsByLeague = {};
  const failures = [];
  await mapLimit(ScoreCacheCore.ESPN_LEAGUES, 4, async (config) => {
    const settled = await Promise.allSettled(dates.map((date) => fetchLeagueDate(config, date, options.fetchImpl)));
    eventsByLeague[config.id] = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    settled.forEach((result, index) => {
      if (result.status === "rejected") failures.push(`${config.id} ${dates[index]}: ${result.reason.message}`);
    });
  });
  const previous = readPrevious();
  const payload = ScoreCacheCore.buildPayload(eventsByLeague, options.now || new Date());
  if (!payload.items.length) throw new Error(`All score sources failed: ${failures.join("; ")}`);
  const previousAge = payload.updatedAt && previous?.updatedAt
    ? Date.parse(payload.updatedAt) - Date.parse(previous.updatedAt)
    : Number.POSITIVE_INFINITY;
  if (ScoreCacheCore.sameItems(previous, payload) && previousAge >= 0 && previousAge < CACHE_HEARTBEAT_MS) {
    process.stdout.write(`Score cache unchanged with ${payload.items.length} event(s).\n`);
    return previous;
  }
  writePayload(payload);
  process.stdout.write(`Updated public/scores/espn.json with ${payload.items.length} event(s).\n`);
  failures.forEach((message) => process.stderr.write(`::warning title=Score source unavailable::${message}\n`));
  return payload;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Score cache update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { CACHE_HEARTBEAT_MS, beijingDateKey, fetchLeagueDate, main, scoreDates };
