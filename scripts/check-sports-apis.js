const attemptsArg = process.argv.find((value) => value.startsWith("--attempts="));
const timeoutArg = process.argv.find((value) => value.startsWith("--timeout="));
const attempts = Math.max(1, Math.min(5, Number(attemptsArg?.split("=")[1]) || 3));
const timeoutMs = Math.max(3000, Math.min(30000, Number(timeoutArg?.split("=")[1]) || 12000));
const jsonOnly = process.argv.includes("--json");

const espnLeagues = [
  ["NBA", "basketball", "nba"],
  ["NFL", "football", "nfl"],
  ["英超", "soccer", "eng.1"],
  ["女足 WSL", "soccer", "eng.w.1"],
  ["西甲", "soccer", "esp.1"],
  ["意甲", "soccer", "ita.1"],
  ["德甲", "soccer", "ger.1"],
  ["法甲", "soccer", "fra.1"],
  ["欧冠", "soccer", "uefa.champions"],
  ["世界杯", "soccer", "fifa.world", true],
  ["英冠", "soccer", "eng.2"],
  ["中超", "soccer", "chn.1"],
  ["MLB", "baseball", "mlb"]
];

function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date).replaceAll("-", "");
}

function espnSeason(name, sport, now = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", month: "numeric" }).format(now)) - 1;
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(now));
  if (name === "NBA") return month >= 8 ? year + 1 : year;
  if (name === "NFL") return month <= 1 ? year - 1 : year;
  if (sport === "soccer" && name !== "中超" && name !== "世界杯") return month >= 5 ? year : year - 1;
  return year;
}

function espnScheduleRange(name, now = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", month: "numeric" }).format(now)) - 1;
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(now));
  if (name === "世界杯") return "20260601-20260815";
  if (name === "中超") return `${year}0101-${year}1231`;
  const startYear = month >= 5 ? year : year - 1;
  return `${startYear}0701-${startYear + 1}0630`;
}

function firstEspnScheduleChunk(name) {
  const [startKey, endKey] = espnScheduleRange(name).split("-");
  const parse = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
  const format = (date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  const start = parse(startKey);
  const end = parse(endKey);
  const chunkEnd = new Date(Math.min(start.getTime() + 44 * 24 * 60 * 60 * 1000, end.getTime()));
  return `${startKey}-${format(chunkEnd)}`;
}

async function fetchText(url, accept = "application/json") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const endpoint = new URL(url);
    endpoint.searchParams.set("_health", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { accept, "user-agent": "GuansaiRiji-ApiHealth/1.0" },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text, ms: Date.now() - started, status: response.status };
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout>${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const response = await fetchText(url);
  return { ...response, data: JSON.parse(response.text) };
}

function jsonProbe(name, provider, family, url, validate) {
  return {
    name,
    provider,
    family,
    async run() {
      const response = await fetchJson(url);
      return { ms: response.ms, status: response.status, count: validate(response.data) };
    }
  };
}

function buildProbes() {
  const today = dateKey();
  const probes = [];
  espnLeagues.forEach(([name, sport, league, staticTeams]) => {
    probes.push(jsonProbe(
      name,
      "ESPN",
      "scoreboard",
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${today}&limit=1000`,
      (payload) => {
        if (!Array.isArray(payload.events)) throw new Error("missing events[]");
        return payload.events.length;
      }
    ));
    if (sport === "soccer") {
      probes.push(jsonProbe(
        name,
        "ESPN",
        "schedule-chunk",
        `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${firstEspnScheduleChunk(name)}&limit=1000`,
        (payload) => {
          if (!Array.isArray(payload.events)) throw new Error("missing events[]");
          return payload.events.length;
        }
      ));
    }
    if (!staticTeams) {
      const season = espnSeason(name, sport);
      probes.push(jsonProbe(
        name,
        "ESPN",
        "team-index",
        `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${season}/teams?limit=100`,
        (payload) => {
          if (!Array.isArray(payload.items)) throw new Error("missing items[]");
          if (payload.items.some((item) => typeof item?.$ref !== "string")) throw new Error("invalid team $ref");
          return payload.items.length;
        }
      ));
    }
  });

  const premierLeagueSeason = espnSeason("PL2（U21）", "soccer");
  probes.push(jsonProbe(
    "PL2（U21）",
    "PremierLeague.com",
    "official-schedule",
    `https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2/matches?competition=898&season=${premierLeagueSeason}&_limit=1000&_sort=kickoff:asc`,
    (payload) => {
      if (!Array.isArray(payload.data)) throw new Error("missing data[]");
      if (payload.data.some((item) => !item?.matchId || !item?.homeTeam?.id || !item?.awayTeam?.id)) {
        throw new Error("invalid PL2 match");
      }
      return payload.data.length;
    }
  ));

  [
    ["NBA", "basketball", "nba", "13"],
    ["NFL", "football", "nfl", "12"],
    ["MLB", "baseball", "mlb", "14"]
  ].forEach(([name, sport, league, teamId]) => {
    const season = espnSeason(name, sport);
    probes.push(jsonProbe(
      name,
      "ESPN",
      "team-schedule",
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/schedule?season=${season}&seasontype=2`,
      (payload) => {
        if (!Array.isArray(payload.events)) throw new Error("missing events[]");
        return payload.events.length;
      }
    ));
  });

  [["中超队徽兜底", "CSL"], ["中甲", "CL1"], ["中乙", "CL2"]].forEach(([name, competitionCode]) => {
    probes.push({
      name,
      provider: "CFL China",
      family: "tournaments+matches",
      async run() {
        const started = Date.now();
        const seasons = await fetchJson(`https://api.cfl-china.cn/frontweb/api/tournaments?competition_code=${competitionCode}`);
        const rows = seasons.data?.data?.dataList;
        if (!Array.isArray(rows)) throw new Error("missing tournament dataList[]");
        const season = rows.find((item) => item.active === "yes") || rows[0];
        if (!season?.id) throw new Error("missing active tournament id");
        const matches = await fetchJson(`https://api.cfl-china.cn/frontweb/api/matches/page?tournament_calendar_id=${season.id}&competition_code=${competitionCode}&curPage=1&pageSize=999`);
        const events = matches.data?.data?.dataList;
        if (!Array.isArray(events)) throw new Error("missing matches dataList[]");
        return { ms: Date.now() - started, status: matches.status, count: events.length };
      }
    });
  });

  probes.push({
    name: "中冠",
    provider: "中国足协",
    family: "gameplans-jsonp",
    async run() {
      const callback = "sportsApiHealth";
      const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date());
      const response = await fetchText(
        `https://data.thecfa.cn/gameplans.do?lid=${year}0410&year=${year}&callback=${callback}`,
        "text/javascript,application/javascript"
      );
      const prefix = `${callback}(`;
      if (!response.text.startsWith(prefix)) throw new Error("invalid JSONP callback");
      const suffix = response.text.trim().endsWith(");") ? 2 : 1;
      const rows = JSON.parse(response.text.trim().slice(prefix.length, -suffix));
      if (!Array.isArray(rows)) throw new Error("missing gameplan array");
      return { ms: response.ms, status: response.status, count: rows.length };
    }
  });
  return probes;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function runProbe(probe) {
  const samples = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      samples.push({ ok: true, ...(await probe.run()) });
    } catch (error) {
      samples.push({ ok: false, error: error.message });
    }
  }
  const successful = samples.filter((sample) => sample.ok);
  const times = successful.map((sample) => sample.ms).sort((left, right) => left - right);
  return {
    provider: probe.provider,
    league: probe.name,
    family: probe.family,
    success: `${successful.length}/${attempts}`,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
    maxMs: times.length ? times[times.length - 1] : null,
    count: successful.at(-1)?.count ?? null,
    errors: [...new Set(samples.filter((sample) => !sample.ok).map((sample) => sample.error))]
  };
}

(async () => {
  const results = await mapLimit(buildProbes(), 4, runProbe);
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), attempts, timeoutMs, results }, null, 2)}\n`);
  } else {
    console.table(results.map((result) => ({
      provider: result.provider,
      league: result.league,
      api: result.family,
      success: result.success,
      medianMs: result.medianMs,
      maxMs: result.maxMs,
      items: result.count,
      errors: result.errors.join(" | ")
    })));
  }
  if (results.some((result) => result.success !== `${attempts}/${attempts}`)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
