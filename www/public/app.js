const storageKey = "sports-fan-calendar:v5";
const dayMs = 24 * 60 * 60 * 1000;
const weekLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const cache = new Map();
const teamsCache = new Map();
const CalendarCore = window.CalendarCore;
const imageFallbackUrl = "public/assets/icon-fallback.png";
let teamLoadRequestId = 0;
const providerSeasonOverrides = {
  cmcl: {
    2026: { providerLeagueId: "20260410" }
  }
};

const worldCupTeams = [
  ["624", "ALG", "Algeria"],
  ["202", "ARG", "Argentina"],
  ["628", "AUS", "Australia"],
  ["474", "AUT", "Austria"],
  ["459", "BEL", "Belgium"],
  ["452", "BIH", "Bosnia-Herzegovina"],
  ["205", "BRA", "Brazil"],
  ["206", "CAN", "Canada"],
  ["2597", "CPV", "Cape Verde"],
  ["208", "COL", "Colombia"],
  ["2850", "COD", "Congo DR"],
  ["477", "CRO", "Croatia"],
  ["11678", "CUW", "Curacao"],
  ["450", "CZE", "Czechia"],
  ["209", "ECU", "Ecuador"],
  ["2620", "EGY", "Egypt"],
  ["448", "ENG", "England"],
  ["478", "FRA", "France"],
  ["481", "GER", "Germany"],
  ["4469", "GHA", "Ghana"],
  ["2654", "HAI", "Haiti"],
  ["469", "IRN", "Iran"],
  ["4375", "IRQ", "Iraq"],
  ["4789", "CIV", "Ivory Coast"],
  ["627", "JPN", "Japan"],
  ["2917", "JOR", "Jordan"],
  ["203", "MEX", "Mexico"],
  ["2869", "MAR", "Morocco"],
  ["449", "NED", "Netherlands"],
  ["2666", "NZL", "New Zealand"],
  ["464", "NOR", "Norway"],
  ["2659", "PAN", "Panama"],
  ["210", "PAR", "Paraguay"],
  ["482", "POR", "Portugal"],
  ["4398", "QAT", "Qatar"],
  ["655", "KSA", "Saudi Arabia"],
  ["580", "SCO", "Scotland"],
  ["654", "SEN", "Senegal"],
  ["467", "RSA", "South Africa"],
  ["451", "KOR", "South Korea"],
  ["164", "ESP", "Spain"],
  ["466", "SWE", "Sweden"],
  ["475", "SUI", "Switzerland"],
  ["659", "TUN", "Tunisia"],
  ["465", "TUR", "Turkiye"],
  ["660", "USA", "United States"],
  ["212", "URU", "Uruguay"],
  ["2570", "UZB", "Uzbekistan"]
].map(([id, abbreviation, name]) => ({
  id,
  abbreviation,
  name,
  shortName: name,
  logo: `https://a.espncdn.com/i/teamlogos/countries/500/${abbreviation.toLowerCase()}.png`,
  color: "#c8e8b8"
}));

const leagues = [
  {
    id: "nba",
    name: "NBA",
    sport: "basketball",
    league: "nba",
    color: "#f2b0aa",
    logo: "public/assets/leagues/nba.png"
  },
  {
    id: "epl",
    name: "英超",
    sport: "soccer",
    league: "eng.1",
    color: "#c8b8ef",
    logo: "public/assets/leagues/epl.png"
  },
  {
    id: "laliga",
    name: "西甲",
    sport: "soccer",
    league: "esp.1",
    color: "#f2dc86",
    logo: "public/assets/leagues/laliga.png"
  },
  {
    id: "seriea",
    name: "意甲",
    sport: "soccer",
    league: "ita.1",
    color: "#b9d0f5",
    logo: "public/assets/leagues/seriea.png"
  },
  {
    id: "bundesliga",
    name: "德甲",
    sport: "soccer",
    league: "ger.1",
    color: "#f0be9d",
    logo: "public/assets/leagues/bundesliga.png"
  },
  {
    id: "ligue1",
    name: "法甲",
    sport: "soccer",
    league: "fra.1",
    color: "#bce4c8",
    logo: "public/assets/leagues/ligue1.png"
  },
  {
    id: "ucl",
    name: "欧冠",
    sport: "soccer",
    league: "uefa.champions",
    color: "#bde5f1",
    logo: "public/assets/leagues/ucl.png"
  },
  {
    id: "worldcup",
    name: "世界杯",
    sport: "soccer",
    league: "fifa.world",
    teamSource: "static",
    teams: worldCupTeams,
    color: "#c8e8b8",
    logo: "public/assets/leagues/worldcup.png"
  },
  {
    id: "championship",
    name: "英冠",
    sport: "soccer",
    league: "eng.2",
    color: "#efbdd6",
    logo: "public/assets/leagues/championship.png"
  },
  {
    id: "csl",
    name: "中超",
    sport: "soccer",
    league: "chn.1",
    color: "#f3b7aa",
    logo: "public/assets/leagues/csl.png"
  },
  {
    id: "china-league-one",
    name: "中甲",
    sport: "soccer",
    source: "thesportsdb",
    providerLeagueId: "4628",
    roundCount: 30,
    color: "#b9dff2",
    logo: "public/assets/leagues/china-league-one.png"
  },
  {
    id: "china-league-two",
    name: "中乙",
    sport: "soccer",
    source: "thesportsdb",
    providerLeagueId: "5310",
    roundCount: 30,
    color: "#f3d997",
    logo: "public/assets/leagues/china-league-two.png"
  },
  {
    id: "cmcl",
    name: "中冠",
    sport: "soccer",
    source: "cfa",
    color: "#c5dfb4",
    logo: "public/assets/leagues/cmcl.png"
  },
  {
    id: "mlb",
    name: "MLB",
    sport: "baseball",
    league: "mlb",
    color: "#b4c7f5",
    logo: "public/assets/leagues/mlb.png"
  }
];

const state = {
  selectedLeague: "nba",
  selectedTeamsByLeague: {},
  teamSearch: "",
  events: [],
  followedTeams: [],
  cursor: startOfDay(new Date()),
  filters: {
    terms: "",
    favoritesOnly: false,
    hideFinished: false
  }
};

const elements = {
  leagueGrid: document.querySelector("#leagueGrid"),
  teamGrid: document.querySelector("#teamGrid"),
  teamStatus: document.querySelector("#teamStatus"),
  teamSearchInput: document.querySelector("#teamSearchInput"),
  importLeagueBtn: document.querySelector("#importLeagueBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  teamFilterInput: document.querySelector("#teamFilterInput"),
  favoritesOnly: document.querySelector("#favoritesOnly"),
  hideFinished: document.querySelector("#hideFinished"),
  fileImport: document.querySelector("#fileImport"),
  prevBtn: document.querySelector("#prevBtn"),
  todayBtn: document.querySelector("#todayBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  updateImportedBtn: document.querySelector("#updateImportedBtn"),
  deleteImportedBtn: document.querySelector("#deleteImportedBtn"),
  todayLabel: document.querySelector("#todayLabel"),
  rangeTitle: document.querySelector("#rangeTitle"),
  totalCount: document.querySelector("#totalCount"),
  watchCount: document.querySelector("#watchCount"),
  nextGameLabel: document.querySelector("#nextGameLabel"),
  statusLine: document.querySelector("#statusLine"),
  calendarView: document.querySelector("#calendarView"),
  dayModal: document.querySelector("#dayModal"),
  dayModalTitle: document.querySelector("#dayModalTitle"),
  dayModalCount: document.querySelector("#dayModalCount"),
  dayModalBody: document.querySelector("#dayModalBody"),
  dayModalClose: document.querySelector("#dayModalClose"),
  deleteModal: document.querySelector("#deleteModal"),
  deleteModalTitle: document.querySelector("#deleteModalTitle"),
  deleteModalCount: document.querySelector("#deleteModalCount"),
  deleteModalBody: document.querySelector("#deleteModalBody"),
  deleteModalClose: document.querySelector("#deleteModalClose")
};

init();

function init() {
  load();
  bindImageFallbacks();
  bindEvents();
  render();
  syncWidgetEvents();
  loadTeamsForSelectedLeague();
}

function bindImageFallbacks() {
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = "true";
    image.src = imageFallbackUrl;
  }, true);
}

function bindEvents() {
  elements.importLeagueBtn.addEventListener("click", importSelectedLeague);
  elements.refreshBtn.addEventListener("click", importSelectedLeague);
  elements.teamSearchInput.addEventListener("input", () => {
    state.teamSearch = elements.teamSearchInput.value;
    renderTeamButtons();
  });
  elements.teamFilterInput.addEventListener("input", () => {
    state.filters.terms = elements.teamFilterInput.value;
    persist();
    render();
  });
  elements.favoritesOnly.addEventListener("change", () => {
    state.filters.favoritesOnly = elements.favoritesOnly.checked;
    persist();
    render();
  });
  elements.hideFinished.addEventListener("change", () => {
    state.filters.hideFinished = elements.hideFinished.checked;
    persist();
    render();
  });
  elements.fileImport.addEventListener("change", importFile);
  elements.prevBtn.addEventListener("click", () => moveCursor(-1));
  elements.todayBtn.addEventListener("click", () => {
    state.cursor = startOfDay(new Date());
    render();
  });
  elements.nextBtn.addEventListener("click", () => moveCursor(1));
  elements.updateImportedBtn.addEventListener("click", updateImportedTeams);
  elements.deleteImportedBtn.addEventListener("click", openDeleteModal);
  elements.calendarView.addEventListener("click", (event) => {
    const dayCell = event.target.closest(".day-cell");
    if (dayCell?.dataset.date) {
      openDayModal(dayCell.dataset.date);
    }
  });
  elements.calendarView.addEventListener("keydown", (event) => {
    const dayCell = event.target.closest(".day-cell");
    if (!dayCell?.dataset.date || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openDayModal(dayCell.dataset.date);
  });
  elements.dayModalClose.addEventListener("click", closeDayModal);
  elements.dayModal.addEventListener("click", (event) => {
    if (event.target === elements.dayModal) {
      closeDayModal();
    }
  });
  elements.deleteModalClose.addEventListener("click", closeDeleteModal);
  elements.deleteModal.addEventListener("click", (event) => {
    if (event.target === elements.deleteModal) {
      closeDeleteModal();
    }
  });
  elements.deleteModalBody.addEventListener("click", (event) => {
    const button = event.target.closest(".imported-team-delete");
    if (button?.dataset.key) {
      deleteImportedTeam(button.dataset.key);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.deleteModal.hidden) {
      closeDeleteModal();
    } else if (event.key === "Escape" && !elements.dayModal.hidden) {
      closeDayModal();
    }
  });
}

async function importSelectedLeague() {
  const leagueConfig = leagues.find((league) => league.id === state.selectedLeague);
  const selectedTeams = getSelectedTeams();
  const selectedTeam = selectedTeams[0];
  if (!leagueConfig) {
    setStatus("请先选择联赛。", true);
    return;
  }
  if (!selectedTeam) {
    setStatus("请先选择一支球队。", true);
    return;
  }

  setBusy(true);
  const teamNames = selectedTeam.abbreviation || selectedTeam.shortName || selectedTeam.name;
  setStatus(`正在导入 ${leagueConfig.name}：${teamNames} 的全部已确定赛程...`);
  try {
    const payload = await fetchFullTeamSchedule(leagueConfig, selectedTeam);
    const filteredEvents = payload.events.map((event) => tagImportedEvent(event, selectedTeam));
    const importedTeam = toImportedTeam(selectedTeam, leagueConfig);
    state.cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (payload.errors.length) {
      state.followedTeams = CalendarCore.mergeImportedTeams(state.followedTeams, [importedTeam]);
      mergeEvents(filteredEvents, { persistChanges: false });
      persist({ syncWidget: true });
      render();
    } else {
      replaceImportedTeamSchedule(importedTeam, filteredEvents);
    }
    const warning = payload.errors.length ? `，${payload.errors.length} 个请求失败` : "";
    const retained = payload.errors.length ? "，原有赛程已保留" : "";
    setStatus(`已导入 ${filteredEvents.length} 场 ${leagueConfig.name} 全部已确定赛程${warning}${retained}。`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function fetchLeagueSchedule(leagueConfig, start, end, options = {}) {
  if (leagueConfig.source === "thesportsdb") {
    return fetchSportsDbSchedule(leagueConfig, start, end, options);
  }
  if (leagueConfig.source === "cfa") {
    return fetchCfaSchedule(leagueConfig, start, end, options);
  }
  return fetchEspnSchedule(leagueConfig, start, end, options);
}

async function fetchFullTeamSchedule(leagueConfig, team, options = {}) {
  if (!leagueConfig.source && ["basketball", "baseball"].includes(leagueConfig.sport)) {
    return fetchEspnTeamSchedule(leagueConfig, team, options);
  }
  const { start, end } = getFullScheduleRange(leagueConfig);
  const payload = await fetchLeagueSchedule(leagueConfig, start, end, options);
  return {
    events: payload.events.filter((event) => matchesSelectedTeams(event, [team])),
    errors: payload.errors
  };
}

async function fetchEspnTeamSchedule(leagueConfig, team, options = {}) {
  const season = getEspnSeasonYear(leagueConfig);
  const seasonTypes = leagueConfig.id === "nba" ? [1, 2, 3] : [2];
  const settled = await mapLimit(seasonTypes, 3, async (seasonType) => {
    try {
      const cacheKey = `${leagueConfig.id}:team:${team.id}:season:${season}:type:${seasonType}`;
      const cached = cache.get(cacheKey);
      if (!options.force && cached && Date.now() - cached.time < 5 * 60 * 1000) {
        return { status: "fulfilled", value: cached.data };
      }
      const endpoint = new URL(
        `https://site.api.espn.com/apis/site/v2/sports/${leagueConfig.sport}/${leagueConfig.league}/teams/${team.id}/schedule`
      );
      endpoint.searchParams.set("season", String(season));
      endpoint.searchParams.set("seasontype", String(seasonType));
      const payload = await fetchJsonWithRetry(
        endpoint.toString(),
        `${leagueConfig.name} 球队赛程`
      );
      const events = (payload.events || []).map((event) => normalizeEspnEvent(event, leagueConfig));
      cache.set(cacheKey, { time: Date.now(), data: events });
      return { status: "fulfilled", value: events };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
  return collectScheduleResults(settled);
}

function getEspnSeasonYear(leagueConfig, now = new Date()) {
  if (leagueConfig.id === "nba") {
    return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  }
  if (leagueConfig.sport === "soccer" && !["csl", "worldcup"].includes(leagueConfig.id)) {
    return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return now.getFullYear();
}

async function fetchEspnSchedule(leagueConfig, start, end, options = {}) {
  const firstDate = formatEspnDate(start);
  const lastDate = formatEspnDate(end);
  const dateQuery = firstDate === lastDate ? firstDate : `${firstDate}-${lastDate}`;
  const cacheKey = `${leagueConfig.id}:${dateQuery}`;
  const cached = cache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.time < 5 * 60 * 1000) {
    return { events: cached.data, errors: [] };
  }

  const endpoint = new URL(`https://site.api.espn.com/apis/site/v2/sports/${leagueConfig.sport}/${leagueConfig.league}/scoreboard`);
  endpoint.searchParams.set("dates", dateQuery);
  endpoint.searchParams.set("limit", "1000");
  const payload = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} 赛程`);
  const events = (payload.events || [])
    .map((event) => normalizeEspnEvent(event, leagueConfig))
    .sort(sortByStart);
  cache.set(cacheKey, { time: Date.now(), data: events });
  return { events, errors: [] };
}

async function fetchSportsDbSchedule(leagueConfig, start, end, options = {}) {
  if (options.dayOnly) {
    return fetchSportsDbDays(leagueConfig, start, end, options);
  }

  const rounds = Array.from({ length: leagueConfig.roundCount || 30 }, (_, index) => index + 1);
  const settled = await mapLimit(rounds, 4, async (round) => {
    try {
      return { status: "fulfilled", value: await fetchSportsDbRound(leagueConfig, round, options) };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
  return collectScheduleResults(settled);
}

async function fetchSportsDbDays(leagueConfig, start, end, options = {}) {
  const days = dateRange(start, end);
  const settled = await mapLimit(days, 8, async (day) => {
    try {
      return { status: "fulfilled", value: await fetchSportsDbDay(leagueConfig, day, options) };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
  return collectScheduleResults(settled);
}

async function fetchSportsDbRound(leagueConfig, round, options = {}) {
  const providerSeason = getProviderSeason(leagueConfig);
  const cacheKey = `${leagueConfig.id}:season:${providerSeason}:round:${round}`;
  const cached = cache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.data;

  const endpoint = new URL("https://www.thesportsdb.com/api/v1/json/123/eventsround.php");
  endpoint.searchParams.set("id", leagueConfig.providerLeagueId);
  endpoint.searchParams.set("r", String(round));
  endpoint.searchParams.set("s", providerSeason);
  const payload = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} 第 ${round} 轮`);
  const events = (payload.events || []).map((event) => normalizeSportsDbEvent(event, leagueConfig));
  cache.set(cacheKey, { time: Date.now(), data: events });
  return events;
}

function collectScheduleResults(settled) {
  const eventsById = new Map();
  const errors = [];
  settled.forEach((item) => {
    if (item.status === "rejected") {
      errors.push(item.reason?.message || "请求失败");
      return;
    }
    item.value.forEach((event) => eventsById.set(event.id, event));
  });
  return { events: [...eventsById.values()].sort(sortByStart), errors };
}

async function fetchSportsDbDay(leagueConfig, date, options = {}) {
  const dateKey = toInputDate(date);
  const cacheKey = `${leagueConfig.id}:${dateKey}`;
  const cached = cache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.data;

  const endpoint = new URL("https://www.thesportsdb.com/api/v1/json/123/eventsday.php");
  endpoint.searchParams.set("d", dateKey);
  endpoint.searchParams.set("l", leagueConfig.providerLeagueId);
  const payload = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} ${dateKey}`);
  const events = (payload.events || []).map((event) => normalizeSportsDbEvent(event, leagueConfig));
  cache.set(cacheKey, { time: Date.now(), data: events });
  return events;
}

async function fetchJsonWithRetry(url, label, attempts = 3, timeoutMs = 15000) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (response.ok) return await response.json();
      lastError = new Error(`${label} 返回 ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error.name === "AbortError"
        ? new Error(`${label} 请求超时`)
        : new Error(`${label} 网络失败：${error.message}`);
    } finally {
      window.clearTimeout(timeout);
    }
    if (attempt < attempts - 1) await wait(400 * (2 ** attempt));
  }
  throw lastError || new Error(`${label} 请求失败`);
}

async function fetchCfaSchedule(leagueConfig, start, end, options = {}) {
  const runtimeConfig = getProviderRuntimeConfig(leagueConfig);
  const cacheKey = `${leagueConfig.id}:season:${runtimeConfig.providerYear}`;
  const cached = cache.get(cacheKey);
  let seasonEvents = cached?.data;
  if (options.force || !cached || Date.now() - cached.time >= 5 * 60 * 1000) {
    const endpoint = new URL("https://data.thecfa.cn/gameplans.do");
    endpoint.searchParams.set("lid", runtimeConfig.providerLeagueId);
    endpoint.searchParams.set("year", runtimeConfig.providerYear);
    const rows = await fetchJsonp(endpoint.toString());
    seasonEvents = (rows || []).map((event) => normalizeCfaEvent(event, runtimeConfig));
    cache.set(cacheKey, { time: Date.now(), data: seasonEvents });
  }

  const first = startOfDay(start).getTime();
  const afterLast = addDays(startOfDay(end), 1).getTime();
  return {
    events: seasonEvents
      .filter((event) => {
        const time = new Date(event.start).getTime();
        return time >= first && time < afterLast;
      })
      .sort(sortByStart),
    errors: []
  };
}

function fetchJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `sportsCalendarJsonp${Date.now()}${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("中国足协赛程请求超时")), 20000);
    const finish = (error, data) => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(data);
    };
    window[callbackName] = (data) => finish(null, data);
    script.onerror = () => finish(new Error("中国足协赛程请求失败"));
    const endpoint = new URL(url);
    endpoint.searchParams.set("callback", callbackName);
    script.src = endpoint.toString();
    document.head.append(script);
  });
}

function normalizeEspnEvent(event, leagueConfig) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find((item) => item.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((item) => item.homeAway === "away") || competitors[1] || {};
  const homeTeam = home.team || {};
  const awayTeam = away.team || {};
  const statusType = competition.status?.type || event.status?.type || {};
  const broadcasts = [...(competition.broadcasts || []), ...(event.broadcasts || [])]
    .flatMap((broadcast) => broadcast.names || [])
    .filter(Boolean);
  const link = (event.links || competition.links || []).find((item) =>
    item.rel?.includes("summary") || item.rel?.includes("desktop")
  );

  return {
    id: `${leagueConfig.id}-${event.id}`,
    sourceId: event.id,
    dataSource: "espn",
    providerLeagueId: leagueConfig.league,
    league: leagueConfig.id,
    leagueName: leagueConfig.name,
    leagueColor: leagueConfig.color,
    leagueTeamIds: competitors.map((item) => item.team?.id).filter(Boolean),
    teamMeta: competitors.map((item) => normalizeEventTeam(item.team, leagueConfig)).filter(Boolean),
    title: event.name || `${awayTeam.displayName || "Away"} @ ${homeTeam.displayName || "Home"}`,
    shortTitle: event.shortName || event.name,
    start: event.date || competition.date || competition.startDate,
    venue: competition.venue?.fullName || event.venue?.displayName || "",
    city: competition.venue?.address?.city || "",
    status: statusType.shortDetail || statusType.detail || statusType.description || "Scheduled",
    statusState: statusType.state || "",
    completed: Boolean(statusType.completed),
    homeScore: home.score == null ? "" : String(home.score),
    awayScore: away.score == null ? "" : String(away.score),
    homeTeam: homeTeam.displayName || homeTeam.name || "",
    awayTeam: awayTeam.displayName || awayTeam.name || "",
    teams: [homeTeam.displayName, awayTeam.displayName, homeTeam.abbreviation, awayTeam.abbreviation].filter(Boolean),
    homeLogo: getTeamLogo(homeTeam),
    awayLogo: getTeamLogo(awayTeam),
    homeColor: getTeamColor(homeTeam, leagueConfig.color),
    awayColor: getTeamColor(awayTeam, leagueConfig.color),
    broadcast: [...new Set(broadcasts)].join(" / "),
    url: link?.href || "",
    importedAt: new Date().toISOString()
  };
}

function normalizeSportsDbEvent(event, leagueConfig) {
  const rawTimestamp = event.strTimestamp || `${event.dateEvent || ""}T${event.strTime || "00:00:00"}`;
  const start = /(?:Z|[+-]\d{2}:?\d{2})$/.test(rawTimestamp) ? rawTimestamp : `${rawTimestamp}Z`;
  const status = event.strStatus || "Scheduled";
  const completed = /^(FT|AET|PEN|Match Finished)$/i.test(status);
  const homeTeam = normalizeProviderTeam({
    id: event.idHomeTeam,
    name: event.strHomeTeam,
    abbreviation: event.strHomeTeamShort,
    logo: event.strHomeTeamBadge
  }, leagueConfig);
  const awayTeam = normalizeProviderTeam({
    id: event.idAwayTeam,
    name: event.strAwayTeam,
    abbreviation: event.strAwayTeamShort,
    logo: event.strAwayTeamBadge
  }, leagueConfig);

  return {
    id: `${leagueConfig.id}-${event.idEvent}`,
    sourceId: String(event.idEvent || ""),
    dataSource: "thesportsdb",
    providerLeagueId: leagueConfig.providerLeagueId,
    providerDate: event.dateEvent || "",
    league: leagueConfig.id,
    leagueName: leagueConfig.name,
    leagueColor: leagueConfig.color,
    leagueTeamIds: [homeTeam.id, awayTeam.id].filter(Boolean),
    teamMeta: [homeTeam, awayTeam],
    title: event.strEvent || `${awayTeam.name} @ ${homeTeam.name}`,
    shortTitle: event.strEventAlternate || event.strEvent || `${awayTeam.name} @ ${homeTeam.name}`,
    start,
    venue: event.strVenue || "",
    city: event.strCity || "",
    status,
    statusState: completed ? "post" : (/live|progress|half/i.test(status) ? "in" : "pre"),
    completed,
    homeScore: event.intHomeScore == null ? "" : String(event.intHomeScore),
    awayScore: event.intAwayScore == null ? "" : String(event.intAwayScore),
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    teams: [homeTeam.name, awayTeam.name],
    homeLogo: homeTeam.logo,
    awayLogo: awayTeam.logo,
    homeColor: leagueConfig.color,
    awayColor: leagueConfig.color,
    broadcast: "",
    url: event.strVideo || "",
    importedAt: new Date().toISOString()
  };
}

function normalizeCfaEvent(event, leagueConfig) {
  const homeName = cleanCfaTeamName(event.hostteamname || "主队");
  const awayName = cleanCfaTeamName(event.clientteamname || "客队");
  const homeId = `cfa-${hash(homeName)}`;
  const awayId = `cfa-${hash(awayName)}`;
  const scoreMatch = String(event.score || "").match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  const start = `${String(event.gametime || "").replace(" ", "T")}+08:00`;
  const homeTeam = normalizeProviderTeam({ id: homeId, name: homeName }, leagueConfig);
  const awayTeam = normalizeProviderTeam({ id: awayId, name: awayName }, leagueConfig);

  return {
    id: `${leagueConfig.id}-${event.gameid || event.fieldorder}`,
    sourceId: String(event.gameid || event.fieldorder || ""),
    dataSource: "cfa",
    providerLeagueId: leagueConfig.providerLeagueId,
    providerYear: leagueConfig.providerYear,
    league: leagueConfig.id,
    leagueName: leagueConfig.name,
    leagueColor: leagueConfig.color,
    leagueTeamIds: [homeId, awayId],
    teamMeta: [homeTeam, awayTeam],
    title: `${homeName} vs ${awayName}`,
    shortTitle: `${homeName} vs ${awayName}`,
    start,
    venue: event.stadium || "",
    city: event.city || "",
    status: scoreMatch ? "已结束" : "未开始",
    statusState: scoreMatch ? "post" : "pre",
    completed: Boolean(scoreMatch),
    homeScore: scoreMatch?.[1] || "",
    awayScore: scoreMatch?.[2] || "",
    homeTeam: homeName,
    awayTeam: awayName,
    teams: [homeName, awayName],
    homeLogo: "",
    awayLogo: "",
    homeColor: leagueConfig.color,
    awayColor: leagueConfig.color,
    broadcast: event.gamesession ? `第 ${event.gamesession} 轮` : "",
    url: "https://www.thecfa.cn/yyls/",
    importedAt: new Date().toISOString()
  };
}

function normalizeProviderTeam(team, leagueConfig) {
  return {
    id: String(team.id || hash(team.name || "team")),
    uid: "",
    league: leagueConfig.id,
    name: team.name || "球队",
    shortName: team.name || "球队",
    abbreviation: team.abbreviation || "",
    logo: CalendarCore.normalizeImageUrl(team.logo, ""),
    color: leagueConfig.color
  };
}

function cleanCfaTeamName(name) {
  return String(name)
    .replace(/足球俱乐部|有限公司|有限责任公司|集团|职业|股份/g, "")
    .trim();
}

function getFullScheduleRange(leagueConfig, now = new Date()) {
  if (leagueConfig?.seasonPreset) {
    return {
      start: parseInputDate(leagueConfig.seasonPreset.start),
      end: parseInputDate(leagueConfig.seasonPreset.end)
    };
  }

  const year = now.getFullYear();
  if (leagueConfig.id === "worldcup") {
    return { start: new Date(2026, 5, 1), end: new Date(2026, 6, 31) };
  }
  if (leagueConfig.id === "mlb") {
    return { start: new Date(year, 1, 1), end: new Date(year, 10, 30) };
  }
  if (leagueConfig.id === "csl" || ["thesportsdb", "cfa"].includes(leagueConfig.source)) {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
  if (leagueConfig.id === "nba") {
    const startYear = now.getMonth() >= 8 ? year : year - 1;
    return { start: new Date(startYear, 9, 1), end: new Date(startYear + 1, 5, 30) };
  }

  const startYear = now.getMonth() >= 5 ? year : year - 1;
  return { start: new Date(startYear, 6, 1), end: new Date(startYear + 1, 5, 30) };
}

function getProviderSeason(leagueConfig, now = new Date()) {
  return String(leagueConfig.providerSeason || now.getFullYear());
}

function getProviderRuntimeConfig(leagueConfig, now = new Date()) {
  const year = now.getFullYear();
  const override = providerSeasonOverrides[leagueConfig.id]?.[year] || {};
  const providerLeagueId = override.providerLeagueId || leagueConfig.providerLeagueId;
  if (!providerLeagueId) {
    throw new Error(`${leagueConfig.name} ${year} 赛季数据源尚未配置`);
  }
  return {
    ...leagueConfig,
    ...override,
    providerLeagueId,
    providerYear: String(year)
  };
}

function mergeEvents(events, options = {}) {
  const { persistChanges = true } = options;
  const byId = new Map(state.events.map((event) => [event.id, event]));
  events.forEach((event) => byId.set(event.id, CalendarCore.mergeEventRecords(byId.get(event.id), event)));
  state.events = [...byId.values()].sort(sortByStart);
  if (persistChanges) {
    persist({ syncWidget: true });
    render();
  }
}

function toImportedTeam(team, leagueConfig) {
  return CalendarCore.normalizeImportedTeam({
    ...team,
    league: leagueConfig?.id || team.league,
    leagueName: leagueConfig?.name || team.leagueName || team.league
  });
}

function replaceImportedTeamSchedule(team, events) {
  state.events = state.events
    .map((event) => CalendarCore.detachTeamFromEvent(event, team.key))
    .filter(Boolean);
  state.followedTeams = CalendarCore.mergeImportedTeams(
    state.followedTeams.filter((item) => item.key !== team.key),
    [team]
  );
  mergeEvents(events, { persistChanges: false });
  persist({ syncWidget: true });
  render();
}

function getImportedTeams() {
  const teams = new Map(
    CalendarCore.deriveFollowedTeams(state.events, state.followedTeams)
      .map((team) => [team.key, { ...team, count: 0 }])
  );
  state.events.forEach((event) => {
    CalendarCore.getEventImportedTeams(event).forEach((team) => {
      if (!teams.has(team.key)) teams.set(team.key, { ...team, count: 0 });
      teams.get(team.key).count += 1;
    });
  });
  return [...teams.values()].sort((left, right) =>
    `${left.leagueName} ${left.name}`.localeCompare(`${right.leagueName} ${right.name}`, "zh-CN")
  );
}

function openDeleteModal() {
  const teams = getImportedTeams();
  elements.deleteModalCount.textContent = teams.length ? `${teams.length} 支球队` : "暂无球队";
  elements.deleteModalBody.innerHTML = teams.length
    ? teams.map(renderImportedTeamDelete).join("")
    : `<div class="day-modal-empty">还没有可删除的已导入球队。</div>`;
  elements.deleteModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.deleteModalClose.focus();
}

function closeDeleteModal() {
  elements.deleteModal.hidden = true;
  if (elements.dayModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function renderImportedTeamDelete(team) {
  const logo = renderImage(team.logo, team.name);
  const name = team.abbreviation || team.shortName || team.name;
  return `
    <button class="imported-team-delete" type="button" data-key="${escapeAttr(team.key)}" style="--team-color:${escapeHtml(team.color)}">
      <span class="imported-team-logo">${logo}</span>
      <span class="imported-team-main">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(team.leagueName)} · ${team.count} 场</small>
      </span>
      <span class="imported-team-action">删除</span>
    </button>
  `;
}

function deleteImportedTeam(key) {
  const team = getImportedTeams().find((item) => item.key === key);
  if (!team) return;
  const removed = team.count;
  state.events = state.events
    .map((event) => CalendarCore.detachTeamFromEvent(event, key))
    .filter(Boolean);
  state.followedTeams = state.followedTeams.filter((item) => item.key !== key);
  persist({ syncWidget: true });
  render();
  openDeleteModal();
  setStatus(`已删除 ${team.leagueName}：${team.abbreviation || team.name} 的 ${removed} 场赛程。`);
}

async function updateImportedTeams() {
  const teams = getImportedTeams();
  if (!teams.length) {
    setStatus("还没有已导入球队，无法更新。", true);
    return;
  }

  const beforeIds = new Set(state.events.map((event) => event.id));
  const updatedEvents = [];
  const errors = [];
  const updatedTeamKeys = new Set();
  const teamsByLeague = new Map();
  teams.forEach((team) => {
    if (!teamsByLeague.has(team.league)) teamsByLeague.set(team.league, []);
    teamsByLeague.get(team.league).push(team);
  });

  setBusy(true);
  setStatus(`正在更新 ${teams.length} 支球队的全部已确定赛程...`);
  try {
    for (const [leagueId, leagueTeams] of teamsByLeague) {
      const leagueConfig = leagues.find((league) => league.id === leagueId);
      if (!leagueConfig) {
        errors.push(`${leagueTeams[0].leagueName} 配置缺失`);
        continue;
      }

      const sharesLeagueSchedule = leagueConfig.source || leagueConfig.sport === "soccer";
      if (sharesLeagueSchedule) {
        try {
          const { start, end } = getFullScheduleRange(leagueConfig);
          const payload = await fetchLeagueSchedule(leagueConfig, start, end, { force: true });
          errors.push(...payload.errors);
          leagueTeams.forEach((team) => {
            updatedEvents.push(
              ...payload.events
                .filter((event) => matchesSelectedTeams(event, [team]))
                .map((event) => tagImportedEvent(event, team))
            );
            if (!payload.errors.length) updatedTeamKeys.add(team.key);
          });
        } catch (error) {
          errors.push(`${leagueConfig.name}：${error.message}`);
        }
        continue;
      }

      for (const team of leagueTeams) {
        try {
          const payload = await fetchFullTeamSchedule(leagueConfig, team, { force: true });
          errors.push(...payload.errors);
          updatedEvents.push(...payload.events.map((event) => tagImportedEvent(event, team)));
          if (!payload.errors.length) updatedTeamKeys.add(team.key);
        } catch (error) {
          errors.push(`${team.leagueName} ${team.abbreviation || team.name}：${error.message}`);
        }
      }
    }

    state.events = state.events
      .map((event) => {
        let next = event;
        updatedTeamKeys.forEach((key) => {
          if (next) next = CalendarCore.detachTeamFromEvent(next, key);
        });
        return next;
      })
      .filter(Boolean);
    const byId = new Map(state.events.map((event) => [event.id, event]));
    updatedEvents.forEach((event) => {
      byId.set(event.id, CalendarCore.mergeEventRecords(byId.get(event.id), event));
    });
    state.events = [...byId.values()].sort(sortByStart);
    state.cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    persist({ syncWidget: true });
    render();
    const newCount = updatedEvents.filter((event) => !beforeIds.has(event.id)).length;
    const uniqueErrors = [...new Set(errors)];
    const warning = uniqueErrors.length ? `，${uniqueErrors.length} 个请求失败` : "";
    setStatus(
      `更新完成：${updatedTeamKeys.size} 支球队共 ${updatedEvents.length} 场已确定赛程，新增 ${newCount} 场${warning}。`,
      Boolean(!updatedTeamKeys.size && uniqueErrors.length)
    );
  } finally {
    setBusy(false);
  }
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const name = file.name.toLowerCase();
  try {
    let events = [];
    if (name.endsWith(".ics")) events = parseIcs(text);
    else if (name.endsWith(".csv")) events = parseCsv(text);
    else if (name.endsWith(".json")) events = parseJson(text);
    else throw new Error("暂不支持这个文件格式。");
    mergeEvents(events);
    setStatus(`已从 ${file.name} 导入 ${events.length} 场赛事。`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    elements.fileImport.value = "";
  }
}

function parseJson(text) {
  const payload = JSON.parse(text);
  const rows = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(rows)) throw new Error("JSON 需要是数组，或包含 events 数组。");
  return rows.map((row, index) => normalizeImportedEvent(row, `json-${index}`));
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) || [];
  return rows
    .filter((row) => row.some(Boolean))
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, column) => [header, row[column] || ""]));
      return normalizeImportedEvent(record, `csv-${index}`);
    });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.map((block, index) => {
    const fields = Object.fromEntries(
      block.split(/\r?\n/)
        .map((line) => {
          const splitAt = line.indexOf(":");
          if (splitAt === -1) return null;
          const [key, ...rawParams] = line.slice(0, splitAt).split(";");
          const params = Object.fromEntries(rawParams.map((param) => {
            const equalsAt = param.indexOf("=");
            return equalsAt === -1
              ? [param.toUpperCase(), ""]
              : [param.slice(0, equalsAt).toUpperCase(), param.slice(equalsAt + 1)];
          }));
          const value = line.slice(splitAt + 1);
          return [key, { value, params }];
        })
        .filter(Boolean)
    );
    const valueOf = (name, fallback = "") => fields[name]?.value || fallback;
    return normalizeImportedEvent({
      id: valueOf("UID"),
      title: unescapeIcs(valueOf("SUMMARY", "未命名赛事")),
      start: CalendarCore.parseIcsDate(valueOf("DTSTART"), fields.DTSTART?.params?.TZID || ""),
      venue: unescapeIcs(valueOf("LOCATION")),
      league: "imported",
      leagueName: "导入",
      url: valueOf("URL")
    }, `ics-${index}`);
  });
}

function normalizeImportedEvent(row, fallbackId) {
  const start = row.start || row.date || row.DTSTART;
  if (!start) throw new Error("导入数据缺少 start/date 字段。");
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) throw new Error(`无法解析时间：${start}`);
  const leagueName = row.leagueName || row.league || "导入";
  return {
    id: row.id || `imported-${hash(`${fallbackId}-${row.title || row.summary || start}`)}`,
    league: row.league || "imported",
    leagueName,
    leagueColor: row.leagueColor || "#00c2ff",
    title: row.title || row.summary || row.name || "未命名赛事",
    shortTitle: row.shortTitle || row.title || row.summary || row.name || "未命名赛事",
    start: parsed.toISOString(),
    venue: row.venue || row.location || "",
    city: row.city || "",
    status: row.status || "Scheduled",
    statusState: row.statusState || "",
      completed: CalendarCore.parseBoolean(row.completed),
    homeScore: row.homeScore == null ? "" : String(row.homeScore),
    awayScore: row.awayScore == null ? "" : String(row.awayScore),
    homeTeam: row.homeTeam || "",
    awayTeam: row.awayTeam || "",
    teams: [row.homeTeam, row.awayTeam, row.teams].flat().filter(Boolean),
    broadcast: row.broadcast || "",
    url: row.url || "",
    importedAt: new Date().toISOString()
  };
}

function render() {
  renderLeagueButtons();
  renderTeamButtons();
  syncInputs();
  renderHeader();
  renderStats();
  renderView();
}

function renderLeagueButtons() {
  elements.leagueGrid.innerHTML = "";
  leagues.forEach((league) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `league-button${league.id === state.selectedLeague ? " active" : ""}`;
    button.style.setProperty("--league-color", league.color);
    button.innerHTML = `${renderImage(league.logo, league.name)}<span>${league.name}</span>`;
    button.addEventListener("click", () => {
      state.selectedLeague = league.id;
      state.teamSearch = "";
      persist();
      renderLeagueButtons();
      loadTeamsForSelectedLeague();
    });
    elements.leagueGrid.append(button);
  });
}

async function loadTeamsForSelectedLeague() {
  const leagueConfig = leagues.find((league) => league.id === state.selectedLeague);
  if (!leagueConfig) return;
  const requestId = ++teamLoadRequestId;
  const selectedLeagueId = leagueConfig.id;
  const cacheKey = getTeamCacheKey();
  if (teamsCache.has(cacheKey)) {
    renderTeamButtons();
    return;
  }

  elements.teamStatus.textContent = leagueConfig.teamSource === "static"
    ? "正在加载世界杯 48 支参赛队..."
    : "正在加载本赛季全部已确定赛程中的球队...";
  elements.teamGrid.innerHTML = "";

  try {
    if (leagueConfig.teamSource === "static") {
      const teams = (leagueConfig.teams || []).slice(0, 48);
      teamsCache.set(cacheKey, teams);
      if (requestId === teamLoadRequestId && state.selectedLeague === selectedLeagueId) {
        renderTeamButtons();
      }
      return;
    }

    let teams = [];
    if (!leagueConfig.source) {
      teams = await fetchLeagueTeams(leagueConfig);
    } else {
      const { start, end } = getFullScheduleRange(leagueConfig);
      const payload = await fetchLeagueSchedule(leagueConfig, start, end);
      const teamsById = new Map();
      payload.events.forEach((event) => {
        (event.teamMeta || []).forEach((team) => teamsById.set(team.id, team));
      });
      teams = [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    teamsCache.set(cacheKey, teams);
    if (requestId === teamLoadRequestId && state.selectedLeague === selectedLeagueId) {
      renderTeamButtons();
    }
  } catch (error) {
    if (requestId === teamLoadRequestId && state.selectedLeague === selectedLeagueId) {
      elements.teamStatus.textContent = `球队加载失败：${error.message}，可重新点击联赛重试`;
    }
  }
}

async function fetchLeagueTeams(leagueConfig) {
  const cacheKey = `${leagueConfig.id}:teams:${getLeagueSeasonKey(leagueConfig)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.data;

  const season = getEspnSeasonYear(leagueConfig);
  const endpoint = new URL(
    `https://sports.core.api.espn.com/v2/sports/${leagueConfig.sport}/leagues/${leagueConfig.league}/seasons/${season}/teams`
  );
  endpoint.searchParams.set("limit", "100");
  const data = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} 球队列表`);
  const refs = (data.items || []).map((item) => item.$ref).filter(Boolean);
  const rows = await mapLimit(refs, 8, async (ref) => {
    try {
      return await fetchJsonWithRetry(
        ref.replace("http://", "https://"),
        `${leagueConfig.name} 球队详情`,
        2
      );
    } catch (error) {
      console.warn(error.message);
      return null;
    }
  });
  const teams = rows
    .map((team) => normalizeEventTeam(team, leagueConfig))
    .filter((team) => team?.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, leagueConfig.teamLimit || 48);

  if (!teams.length && refs.length) {
    throw new Error("球队详情请求全部失败");
  }

  cache.set(cacheKey, { time: Date.now(), data: teams });
  return teams;
}

function normalizeEventTeam(team, leagueConfig) {
  if (!team) return null;
  return {
    id: String(team.id || ""),
    uid: team.uid || "",
    league: leagueConfig.id,
    name: team.displayName || team.name || team.shortDisplayName || team.abbreviation || "",
    shortName: team.shortDisplayName || team.name || team.displayName || "",
    abbreviation: team.abbreviation || "",
    logo: getTeamLogo(team),
    color: getTeamColor(team, leagueConfig.color)
  };
}

function renderTeamButtons() {
  if (!elements.teamGrid) return;
  const cacheKey = getTeamCacheKey();
  const teams = cacheKey ? teamsCache.get(cacheKey) || [] : [];
  const selected = getSelectedTeamIds();
  const search = state.teamSearch.trim().toLowerCase();
  const visibleTeams = teams.filter((team) => {
    if (!search) return true;
    return [team.name, team.shortName, team.abbreviation].join(" ").toLowerCase().includes(search);
  });

  elements.teamSearchInput.value = state.teamSearch;
  elements.teamGrid.innerHTML = "";

  if (!cacheKey || !teamsCache.has(cacheKey)) {
    elements.teamStatus.textContent = "球队列表加载中...";
    return;
  }

  if (!teams.length) {
    elements.teamStatus.textContent = "当前还没有已确定赛程的球队。";
    return;
  }

  const selectedTeam = teams.find((team) => selected.has(team.id));
  elements.teamStatus.textContent = selectedTeam
    ? `已选择 ${selectedTeam.abbreviation || selectedTeam.shortName}（单选）`
    : "请选择要关注的球队";

  visibleTeams.forEach((team) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-button${selected.has(team.id) ? " active" : ""}`;
    button.style.setProperty("--team-color", team.color || "#c7e6eb");
    button.innerHTML = `
      <span class="team-button-logo">${renderImage(team.logo, team.name)}</span>
      <span>${escapeHtml(team.abbreviation || team.shortName)}</span>
    `;
    button.title = team.name;
    button.addEventListener("click", () => toggleTeam(team.id));
    elements.teamGrid.append(button);
  });
}

function toggleTeam(teamId) {
  const selected = getSelectedTeamIds();
  state.selectedTeamsByLeague[state.selectedLeague] = selected.has(teamId) ? [] : [teamId];
  persist();
  renderTeamButtons();
}

function getSelectedTeamIds() {
  return new Set((state.selectedTeamsByLeague[state.selectedLeague] || []).slice(0, 1));
}

function getSelectedTeams() {
  const cacheKey = getTeamCacheKey();
  const teams = cacheKey ? teamsCache.get(cacheKey) || [] : [];
  const selected = getSelectedTeamIds();
  return teams.filter((team) => selected.has(team.id));
}

function getTeamCacheKey() {
  const leagueConfig = leagues.find((league) => league.id === state.selectedLeague);
  if (leagueConfig?.teamSource === "static") return `${state.selectedLeague}:teams`;
  return `${state.selectedLeague}:full-season:${getLeagueSeasonKey(leagueConfig)}`;
}

function getLeagueSeasonKey(leagueConfig, now = new Date()) {
  if (!leagueConfig) return "unknown";
  if (leagueConfig.source === "thesportsdb") return getProviderSeason(leagueConfig, now);
  if (leagueConfig.source === "cfa") return String(now.getFullYear());
  return String(getEspnSeasonYear(leagueConfig, now));
}

function tagImportedEvent(event, team) {
  const leagueConfig = leagues.find((league) => league.id === event.league);
  return CalendarCore.attachTeamToEvent(event, toImportedTeam(team, leagueConfig));
}

function getTeamLogo(team) {
  if (!team) return "";
  const logo = team.logo || team.logos?.find((item) => item.rel?.includes("default"))?.href || team.logos?.[0]?.href || "";
  return CalendarCore.normalizeImageUrl(logo, "");
}

function getTeamColor(team, fallback = "#c7e6eb") {
  const primary = String(team?.color || "").replace("#", "").trim();
  const alternate = String(team?.alternateColor || "").replace("#", "").trim();
  const chosen = isLowSignalTeamColor(primary) ? alternate : primary;
  return /^[0-9a-fA-F]{6}$/.test(chosen) ? `#${chosen}` : fallback;
}

function isLowSignalTeamColor(value) {
  const color = String(value || "").toLowerCase();
  return !color || color === "ffffff" || color === "000000";
}

function matchesSelectedTeams(event, selectedTeams) {
  const selectedIds = new Set(selectedTeams.map((team) => team.id));
  if (event.leagueTeamIds?.length) {
    return event.leagueTeamIds.some((id) => selectedIds.has(String(id)));
  }

  const selectedTerms = selectedTeams.flatMap((team) => [
    team.name,
    team.shortName,
    team.abbreviation
  ]).filter(Boolean).map((value) => value.toLowerCase());

  const haystack = [
    event.title,
    event.shortTitle,
    event.homeTeam,
    event.awayTeam,
    ...(event.teams || [])
  ].join(" ").toLowerCase();
  return selectedTerms.some((term) => haystack.includes(term));
}

function syncInputs() {
  elements.teamFilterInput.value = state.filters.terms;
  elements.favoritesOnly.checked = state.filters.favoritesOnly;
  elements.hideFinished.checked = state.filters.hideFinished;
}

function renderHeader() {
  const now = new Date();
  elements.todayLabel.textContent = `今天 ${formatDate(now, { month: "long", day: "numeric", weekday: "long" })}`;
  elements.rangeTitle.textContent = formatDate(state.cursor, { year: "numeric", month: "long" });
}

function renderStats() {
  const visible = getFilteredEvents();
  const terms = getTerms();
  const watchCount = state.events.filter((event) => matchesTerms(event, terms)).length;
  const next = visible.find((event) => new Date(event.start) >= new Date());
  elements.totalCount.textContent = state.events.length;
  elements.watchCount.textContent = watchCount;
  elements.nextGameLabel.textContent = next ? `${formatTime(new Date(next.start))} ${next.shortTitle}` : "暂无";
}

function renderView() {
  const range = getVisibleRange();
  const visibleEvents = getFilteredEvents().filter((event) => {
    const date = new Date(event.start);
    return date >= range.start && date < addDays(range.end, 1);
  });

  renderMonth(visibleEvents);
}

function renderMonth(events) {
  const monthStart = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const byDay = groupByDay(events);
  const cells = [];

  weekLabels.forEach((label) => {
    cells.push(`<div class="day-name">${label}</div>`);
  });

  for (let offset = 0; offset < 42; offset += 1) {
    const day = addDays(gridStart, offset);
    const key = toInputDate(day);
    const dayEvents = byDay.get(key) || [];
    const classes = [
      "day-cell",
      day.getMonth() !== state.cursor.getMonth() ? "is-muted" : "",
      isSameDay(day, new Date()) ? "is-today" : "",
      dayEvents.length ? "has-events" : ""
    ].filter(Boolean).join(" ");
    const eventHtml = dayEvents.map(renderChip).join("");
    const label = `${formatDate(day, { month: "long", day: "numeric", weekday: "long" })}，${dayEvents.length ? `${dayEvents.length} 场比赛` : "无比赛"}`;
    cells.push(`
      <div class="${classes}" data-date="${key}" role="button" tabindex="0" aria-label="${escapeAttr(label)}">
        <div class="day-number">${day.getDate()}</div>
        <div class="day-events">${eventHtml}</div>
      </div>
    `);
  }

  elements.calendarView.innerHTML = `<div class="month-grid">${cells.join("")}</div>`;
}

function renderChip(event) {
  const color = eventColor(event, "#00c2ff");
  const awayLogo = renderImage(event.awayLogo, event.awayTeam || "Away");
  const homeLogo = renderImage(event.homeLogo, event.homeTeam || "Home");
  return `
    <div class="event-chip" style="--event-color:${escapeHtml(color)}">
      <div class="matchup-row">
        <span class="matchup-logo away-logo">${awayLogo}</span>
        <span class="matchup-divider">vs</span>
        <span class="matchup-logo home-logo">${homeLogo}</span>
      </div>
      <strong>${escapeHtml(event.shortTitle || event.title)}</strong>
      <span>${formatTime(new Date(event.start))} / ${escapeHtml(event.leagueName || event.league)}</span>
    </div>
  `;
}

let activeDayModalDate = "";

function openDayModal(dateKey) {
  activeDayModalDate = dateKey;
  const date = parseInputDate(dateKey);
  renderDayModalContents(dateKey);
  elements.dayModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.dayModalClose.focus();
  refreshDayModalScores(dateKey);
}

function renderDayModalContents(dateKey, isRefreshing = false) {
  const dayEvents = getFilteredEvents().filter((event) => toInputDate(new Date(event.start)) === dateKey);
  const date = parseInputDate(dateKey);
  elements.dayModalTitle.textContent = formatDate(date, { month: "long", day: "numeric", weekday: "long" });
  elements.dayModalCount.textContent = dayEvents.length
    ? `${dayEvents.length} 场比赛${isRefreshing ? " · 更新中" : ""}`
    : "暂无比赛";
  elements.dayModalBody.innerHTML = dayEvents.length
    ? dayEvents.map(renderDayModalEvent).join("")
    : `<div class="day-modal-empty">当天没有已导入的比赛。</div>`;
}

async function refreshDayModalScores(dateKey) {
  const dayEvents = state.events.filter((event) => toInputDate(new Date(event.start)) === dateKey);
  const trackedIds = new Set(dayEvents.map((event) => event.id));
  const leagueIds = [...new Set(dayEvents.map((event) => event.league))];
  const leagueConfigs = leagueIds
    .map((id) => leagues.find((league) => league.id === id))
    .filter(Boolean);
  if (!leagueConfigs.length) return;

  renderDayModalContents(dateKey, true);
  const date = parseInputDate(dateKey);
  const start = addDays(date, -1);
  const refreshed = [];
  await Promise.all(leagueConfigs.map(async (leagueConfig) => {
    try {
      const payload = await fetchLeagueSchedule(leagueConfig, start, date, { force: true, dayOnly: true });
      refreshed.push(...payload.events.filter((event) => trackedIds.has(event.id)));
    } catch (error) {
      console.warn(`Score refresh failed for ${leagueConfig.id}`, error);
    }
  }));

  if (refreshed.length) {
    const updates = new Map(refreshed.map((event) => [event.id, event]));
    state.events = state.events
      .map((event) => updates.has(event.id)
        ? CalendarCore.mergeEventRecords(event, updates.get(event.id))
        : event)
      .sort(sortByStart);
    persist({ syncWidget: true });
    render();
  }
  if (activeDayModalDate === dateKey && !elements.dayModal.hidden) {
    renderDayModalContents(dateKey);
  }
}

function closeDayModal() {
  activeDayModalDate = "";
  elements.dayModal.hidden = true;
  if (elements.deleteModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function renderDayModalEvent(event) {
  const color = eventColor(event, "#c8e8b8");
  const awayLogo = renderImage(event.awayLogo, event.awayTeam || "Away");
  const homeLogo = renderImage(event.homeLogo, event.homeTeam || "Home");
  const details = [
    event.shortTitle || event.title,
    [event.venue, event.city].filter(Boolean).join(" · "),
    event.broadcast ? `转播：${event.broadcast}` : ""
  ].filter(Boolean);
  return `
    <article class="day-modal-game" style="--event-color:${escapeHtml(color)}">
      <span class="day-modal-logo">${awayLogo}</span>
      <div class="day-modal-center">
        <span class="day-modal-start">${formatTime(new Date(event.start))}</span>
        <strong class="day-modal-score ${isEventLive(event) ? "is-live" : ""}">${escapeHtml(eventScoreLabel(event))}</strong>
        <span class="day-modal-status">${escapeHtml([eventStatusLabel(event), event.leagueName || event.league].filter(Boolean).join(" · "))}</span>
        <span class="day-modal-title">${escapeHtml(details.join(" / "))}</span>
      </div>
      <span class="day-modal-logo">${homeLogo}</span>
    </article>
  `;
}

function eventScoreLabel(event) {
  const awayScore = event.awayScore ?? "";
  const homeScore = event.homeScore ?? "";
  if (awayScore !== "" && homeScore !== "") {
    return `${awayScore} - ${homeScore}`;
  }
  if (isEventLive(event)) return "进行中";
  if (isEventFinished(event)) return "已结束";
  return "0 - 0";
}

function eventStatusLabel(event) {
  if (isEventLive(event)) return "进行中";
  if (isEventFinished(event)) return "已结束";
  return "未开始";
}

function isEventLive(event) {
  const stateValue = (event.statusState || "").toLowerCase();
  const status = (event.status || "").toLowerCase();
  if (isEventFinished(event)) return false;
  return stateValue === "in"
    || status.includes("in progress")
    || status.includes("live")
    || status.includes("top")
    || status.includes("bot")
    || status.includes("bottom")
    || status.includes("mid")
    || status.includes("halftime")
    || status === "ht"
    || status.includes("'");
}

function isEventFinished(event) {
  const stateValue = (event.statusState || "").toLowerCase();
  const status = (event.status || "").toLowerCase();
  return Boolean(event.completed)
    || stateValue === "post"
    || status.includes("final")
    || status.includes("full time")
    || status === "ft";
}

function renderGroupedList(events, className) {
  if (!events.length) {
    elements.calendarView.innerHTML = `<div class="empty-state"><p>当前视图没有比赛。</p></div>`;
    return;
  }

  const byDay = groupByDay(events);
  const html = [...byDay.entries()].map(([dateKey, dayEvents]) => {
    const date = new Date(`${dateKey}T00:00:00`);
    return `
      <section class="day-group">
        <div class="day-group-header">
          <span>${formatDate(date, { month: "long", day: "numeric", weekday: "long" })}</span>
          <span>${dayEvents.length} 场</span>
        </div>
        ${dayEvents.map(renderEventCard).join("")}
      </section>
    `;
  }).join("");
  elements.calendarView.innerHTML = `<div class="${className}">${html}</div>`;
}

function renderEventCard(event) {
  const parts = [
    event.venue,
    event.city,
    event.broadcast ? `转播：${event.broadcast}` : "",
    event.status && event.status !== "Scheduled" ? event.status : ""
  ].filter(Boolean);
  const eventUrl = sanitizeExternalUrl(event.url);
  const title = eventUrl
    ? `<a href="${escapeAttr(eventUrl)}" target="_blank" rel="noreferrer">${escapeHtml(event.title)}</a>`
    : escapeHtml(event.title);
  return `
    <article class="event-card" style="--event-color:${escapeHtml(event.leagueColor || "#00c2ff")}">
      <div class="event-time">${formatTime(new Date(event.start))}</div>
      <div class="event-main">
        <div class="event-title-row">
          <strong>${title}</strong>
          <span class="league-pill">${escapeHtml(event.leagueName || event.league)}</span>
        </div>
        <p class="event-meta">${escapeHtml(parts.join(" / "))}</p>
      </div>
    </article>
  `;
}

function getVisibleRange() {
  return CalendarCore.getMonthGridRange(state.cursor);
}

function eventColor(event, fallback) {
  return CalendarCore.getEventImportedTeams(event)[0]?.color || event.leagueColor || fallback;
}

function getFilteredEvents() {
  const terms = getTerms();
  return state.events
    .filter((event) => !state.filters.hideFinished || !event.completed)
    .filter((event) => !state.filters.favoritesOnly || matchesTerms(event, terms))
    .sort(sortByStart);
}

function getTerms() {
  return state.filters.terms
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function matchesTerms(event, terms) {
  if (!terms.length) return false;
  const haystack = [
    event.title,
    event.shortTitle,
    event.homeTeam,
    event.awayTeam,
    event.leagueName,
    ...(event.teams || [])
  ].join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function moveCursor(direction) {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + direction, 1);
  render();
}

function groupByDay(events) {
  const map = new Map();
  events.forEach((event) => {
    const key = toInputDate(new Date(event.start));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  });
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function persist(options = {}) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      selectedLeague: state.selectedLeague,
      selectedTeamsByLeague: state.selectedTeamsByLeague,
      events: state.events,
      followedTeams: state.followedTeams,
      filters: state.filters
    }));
  } catch (error) {
    setStatus(`本地数据保存失败：${error.message}`, true);
    return;
  }
  if (options.syncWidget) scheduleWidgetSync();
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.selectedLeague = saved.selectedLeague || state.selectedLeague;
    state.selectedTeamsByLeague = saved.selectedTeamsByLeague || state.selectedTeamsByLeague;
    state.events = Array.isArray(saved.events)
      ? saved.events.map((event) => CalendarCore.mergeEventRecords(null, event))
      : [];
    state.followedTeams = CalendarCore.deriveFollowedTeams(state.events, saved.followedTeams || []);
    state.filters = { ...state.filters, ...(saved.filters || {}) };
  } catch {
    localStorage.removeItem(storageKey);
  }
}

let widgetSyncTimer = 0;
let lastWidgetSignature = "";

function scheduleWidgetSync() {
  window.clearTimeout(widgetSyncTimer);
  widgetSyncTimer = window.setTimeout(syncWidgetEvents, 250);
}

async function syncWidgetEvents() {
  const plugin = window.Capacitor?.Plugins?.SportsWidget;
  if (!plugin?.saveEvents) return;
  const events = state.events.map(toWidgetEvent);
  const signature = JSON.stringify(events);
  if (signature === lastWidgetSignature) return;
  lastWidgetSignature = signature;
  try {
    await plugin.saveEvents({ events });
  } catch (error) {
    lastWidgetSignature = "";
    console.warn("Widget sync failed", error);
  }
}

function toWidgetEvent(event) {
  const leagueConfig = leagues.find((league) => league.id === event.league);
  return {
    id: event.id,
    start: event.start,
    sourceId: event.sourceId || "",
    league: event.league,
    leagueName: event.leagueName || event.league || "比赛",
    sport: leagueConfig?.sport || "",
    espnLeague: leagueConfig?.league || "",
    dataSource: event.dataSource || leagueConfig?.source || "espn",
    providerLeagueId: event.providerLeagueId || leagueConfig?.providerLeagueId || leagueConfig?.league || "",
    providerYear: event.providerYear || leagueConfig?.providerYear || "",
    providerDate: event.providerDate || "",
    status: event.status || "",
    statusState: event.statusState || "",
    completed: Boolean(event.completed),
    awayScore: event.awayScore == null ? "" : String(event.awayScore),
    homeScore: event.homeScore == null ? "" : String(event.homeScore),
    awayLogo: CalendarCore.normalizeImageUrl(event.awayLogo, ""),
    homeLogo: CalendarCore.normalizeImageUrl(event.homeLogo, ""),
    awayTeam: event.awayTeam || "",
    homeTeam: event.homeTeam || "",
    importedTeamId: event.importedTeamId || "",
    importedTeamName: event.importedTeamName || ""
  };
}

function setBusy(isBusy) {
  elements.importLeagueBtn.disabled = isBusy;
  elements.refreshBtn.disabled = isBusy;
  elements.updateImportedBtn.disabled = isBusy;
  elements.deleteImportedBtn.disabled = isBusy;
}

function setStatus(message, isError = false) {
  elements.statusLine.textContent = message;
  elements.statusLine.classList.toggle("is-error", isError);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(start, end) {
  const days = [];
  for (let time = start.getTime(); time <= end.getTime(); time += dayMs) {
    days.push(new Date(time));
  }
  return days;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function parseInputDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toInputDate(date) {
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function isSameDay(a, b) {
  return toInputDate(a) === toInputDate(b);
}

function sortByStart(a, b) {
  return new Date(a.start) - new Date(b.start);
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatEspnDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
}

function unescapeIcs(value = "") {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function renderImage(value, alt = "") {
  const source = CalendarCore.normalizeImageUrl(value, imageFallbackUrl);
  return `<img src="${escapeAttr(source)}" alt="${escapeAttr(alt)}" referrerpolicy="no-referrer">`;
}

function sanitizeExternalUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return Math.abs(result).toString(36);
}
