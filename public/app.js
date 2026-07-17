const dayMs = 24 * 60 * 60 * 1000;
const weekLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const cache = new Map();
const teamsCache = new Map();
const CalendarCore = window.CalendarCore;
const CalendarStorage = window.CalendarStorage;
const CalendarImageCache = window.CalendarImageCache;
const AppUpdate = window.AppUpdate;
const AppUpdateConfig = window.AppUpdateConfig;
const TeamNews = window.TeamNews;
const TeamNewsConfig = window.TeamNewsConfig;
const maxImportBytes = 5 * 1024 * 1024;
const maxImportEvents = 10000;
const maxWidgetEvents = 5000;
const imageFallbackUrl = "public/assets/icon-fallback.png";
const imagePreloadPending = new Map();
const dayScoreRefreshes = new Map();
const dayScoreRefreshTimes = new Map();
const scoreRefreshTtlMs = 60 * 1000;
const teamNewsCacheKey = "sports-fan-calendar:team-news:v1";
const teamNewsCacheTtlMs = 10 * 60 * 1000;
const teamNewsAutoRefreshMs = 5 * 60 * 1000;
const teamNewsResumeRefreshMs = 2 * 60 * 1000;
let teamLoadRequestId = 0;
const providerSeasonOverrides = {};

const cslTeamAliases = [
  ["2052", "北京国安", "Beijing Guoan", "BG"],
  ["21355", "成都蓉城", "Chengdu Rongcheng", "CHE"],
  ["131704", "重庆铜梁龙", "Chongqing Tonglianglong", "CHO"],
  ["22537", "大连英博", "Dalian Yingbo", "DYI"],
  ["8240", "河南", "河南队", "Henan", "HEN"],
  ["131705", "辽宁铁人", "Liaoning Tieren", "LIA"],
  ["21910", "青岛海牛", "Qingdao Hainiu", "QIN"],
  ["22198", "青岛西海岸", "Qingdao West Coast", "QWC"],
  ["7521", "山东泰山", "Shandong Taishan", "SHT"],
  ["15515", "上海海港", "Shanghai Port", "Shanghai SIPG", "SIPG"],
  ["977", "上海申花", "Shanghai Shenhua", "SHE"],
  ["22199", "深圳新鹏城", "Shenzhen Xinpengcheng", "SHX"],
  ["8239", "天津津门虎", "Tianjin Jinmen Tiger", "Tianjin Teda", "TIG"],
  ["21506", "武汉三镇", "Wuhan Three Towns", "WTT"],
  ["22536", "云南玉昆", "Yunnan Yukun", "YUN"],
  ["18203", "浙江", "浙江队", "Zhejiang Professional FC", "Zhejiang", "ZHE"]
].map(([id, name, ...aliases]) => ({ id, name, aliases: [name, ...aliases] }));

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
    id: "nfl",
    name: "NFL",
    sport: "football",
    league: "nfl",
    color: "#b9dff2",
    logo: "public/assets/leagues/nfl.png"
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
    calendarYearSeason: true,
    color: "#f3b7aa",
    logo: "public/assets/leagues/csl.png"
  },
  {
    id: "china-league-one",
    name: "中甲",
    sport: "soccer",
    source: "cfl",
    cflCompetitionCode: "CL1",
    color: "#b9dff2",
    logo: "public/assets/leagues/china-league-one.png"
  },
  {
    id: "china-league-two",
    name: "中乙",
    sport: "soccer",
    source: "cfl",
    cflCompetitionCode: "CL2",
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
  },
  refreshMeta: {
    lastSuccessAt: "",
    lastAttemptAt: "",
    lastError: ""
  }
};

const teamNewsState = {
  items: [],
  updatedAt: "",
  loading: false,
  lastAttemptAt: 0,
  pendingUrl: "",
  articleBodies: new Map(),
  loadingBodies: new Set()
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
  menuToggle: document.querySelector("#menuToggle"),
  sidebar: document.querySelector("#sidebar"),
  sidebarClose: document.querySelector("#sidebarClose"),
  sidebarOverlay: document.querySelector("#sidebarOverlay"),
  prevBtn: document.querySelector("#prevBtn"),
  todayBtn: document.querySelector("#todayBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  updateImportedBtn: document.querySelector("#updateImportedBtn"),
  deleteImportedBtn: document.querySelector("#deleteImportedBtn"),
  currentAppVersion: document.querySelector("#currentAppVersion"),
  appUpdateStatus: document.querySelector("#appUpdateStatus"),
  appUpdateNotes: document.querySelector("#appUpdateNotes"),
  checkAppUpdateBtn: document.querySelector("#checkAppUpdateBtn"),
  downloadAppUpdateBtn: document.querySelector("#downloadAppUpdateBtn"),
  openTeamNewsBtn: document.querySelector("#openTeamNewsBtn"),
  teamNewsPushToggle: document.querySelector("#teamNewsPushToggle"),
  teamNewsPreview: document.querySelector("#teamNewsPreview"),
  teamNewsPanelStatus: document.querySelector("#teamNewsPanelStatus"),
  teamNewsModal: document.querySelector("#teamNewsModal"),
  teamNewsModalClose: document.querySelector("#teamNewsModalClose"),
  refreshTeamNewsBtn: document.querySelector("#refreshTeamNewsBtn"),
  teamNewsUpdatedAt: document.querySelector("#teamNewsUpdatedAt"),
  teamNewsModalStatus: document.querySelector("#teamNewsModalStatus"),
  teamNewsList: document.querySelector("#teamNewsList"),
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

init().catch((error) => setStatus(`启动失败：${error.message}`, true));

async function init() {
  initializeAppUpdate();
  initializeTeamNews();
  await load();
  bindImageFallbacks();
  bindEvents();
  render();
  syncWidgetEvents();
  const recoveryMessage = CalendarStorage?.getRecoveryMessage?.();
  if (recoveryMessage) setStatus(recoveryMessage);
  else renderRefreshStatus();
  const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1200));
  schedule(() => refreshStartupScores(), { timeout: 2500 });
}

function bindImageFallbacks() {
  document.addEventListener("load", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    queueImageCache(image.dataset.cacheSrc);
  }, true);

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = "true";
    image.src = imageFallbackUrl;
  }, true);
}

function bindEvents() {
  elements.menuToggle.addEventListener("click", openSidebar);
  elements.sidebarClose.addEventListener("click", closeSidebar);
  elements.sidebarOverlay.addEventListener("click", closeSidebar);
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
  elements.checkAppUpdateBtn.addEventListener("click", checkForAppUpdate);
  elements.downloadAppUpdateBtn.addEventListener("click", openAppUpdateDownload);
  elements.openTeamNewsBtn.addEventListener("click", openTeamNewsModal);
  elements.teamNewsPushToggle.addEventListener("change", updateTeamNewsPush);
  elements.refreshTeamNewsBtn.addEventListener("click", () => refreshTeamNews());
  elements.teamNewsModalClose.addEventListener("click", closeTeamNewsModal);
  elements.teamNewsModal.addEventListener("click", (event) => {
    if (event.target === elements.teamNewsModal) closeTeamNewsModal();
  });
  elements.teamNewsList.addEventListener("click", (event) => {
    const disclosure = event.target.closest(".team-news-disclosure");
    if (disclosure) toggleTeamNewsArticle(disclosure);
  });
  window.addEventListener("sports-news-open", (event) => {
    handleTeamNewsOpen(event.detail?.url || "");
  });
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
    if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) {
      closeSidebar();
    } else if (event.key === "Escape" && !elements.teamNewsModal.hidden) {
      closeTeamNewsModal();
    } else if (event.key === "Escape" && !elements.deleteModal.hidden) {
      closeDeleteModal();
    } else if (event.key === "Escape" && !elements.dayModal.hidden) {
      closeDayModal();
    }
  });
  bindSidebarGestures();
}

let appUpdateDownloadUrl = "";

function initializeAppUpdate() {
  const versionName = AppUpdateConfig?.currentVersionName || "未知";
  elements.currentAppVersion.textContent = `v${versionName}`;
}

async function checkForAppUpdate() {
  if (!AppUpdate || !AppUpdateConfig) {
    setAppUpdateStatus("更新组件初始化失败", true);
    return;
  }

  elements.checkAppUpdateBtn.disabled = true;
  elements.checkAppUpdateBtn.setAttribute("aria-busy", "true");
  elements.downloadAppUpdateBtn.hidden = true;
  elements.appUpdateNotes.hidden = true;
  elements.appUpdateNotes.replaceChildren();
  appUpdateDownloadUrl = "";
  setAppUpdateStatus("正在连接更新服务...");

  try {
    const manifest = await AppUpdate.fetchLatestManifest(AppUpdateConfig.manifestUrls);
    if (!AppUpdate.isNewerVersion(AppUpdateConfig.currentVersionCode, manifest)) {
      setAppUpdateStatus(`当前 v${AppUpdateConfig.currentVersionName} 已是最新版本`);
      return;
    }

    setAppUpdateStatus(`发现新版本 v${manifest.versionName}`);
    renderAppUpdateNotes(manifest.notes);
    appUpdateDownloadUrl = manifest.apkUrl;
    if (appUpdateDownloadUrl) {
      elements.downloadAppUpdateBtn.hidden = false;
    } else {
      setAppUpdateStatus(`发现新版本 v${manifest.versionName}，下载地址尚未发布`);
    }
  } catch (error) {
    setAppUpdateStatus(`检查失败：${error.message || "网络不可用"}`, true);
  } finally {
    elements.checkAppUpdateBtn.disabled = false;
    elements.checkAppUpdateBtn.removeAttribute("aria-busy");
  }
}

function renderAppUpdateNotes(notes) {
  const fragment = document.createDocumentFragment();
  notes.forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    fragment.append(item);
  });
  elements.appUpdateNotes.replaceChildren(fragment);
  elements.appUpdateNotes.hidden = notes.length === 0;
}

function setAppUpdateStatus(message, isError = false) {
  elements.appUpdateStatus.textContent = message;
  elements.appUpdateStatus.classList.toggle("is-error", isError);
}

async function openAppUpdateDownload() {
  const url = AppUpdate?.normalizeHttpsUrl(appUpdateDownloadUrl);
  if (!url) {
    setAppUpdateStatus("新版下载地址无效", true);
    return;
  }

  try {
    const plugin = window.Capacitor?.Plugins?.SportsWidget;
    if (plugin?.openExternalUrl) {
      await plugin.openExternalUrl({ url });
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  } catch (error) {
    setAppUpdateStatus(`无法打开下载页：${error.message || "请稍后重试"}`, true);
  }
}

function initializeTeamNews() {
  restoreTeamNewsCache();
  renderTeamNews();
  syncTeamNewsPushStatus();
  consumePendingTeamNewsOpen();

  if (!getTeamNewsApiUrls().length) {
    setTeamNewsPanelStatus("新闻 API 尚未部署");
    return;
  }

  const age = Date.now() - Date.parse(teamNewsState.updatedAt || "");
  if (teamNewsState.items.length && Number.isFinite(age) && age <= teamNewsCacheTtlMs) {
    setTeamNewsPanelStatus(`已缓存 ${teamNewsState.items.length} 条英文新闻`);
  }
  window.setTimeout(() => refreshTeamNews({ silent: true }), 400);
  window.setInterval(() => {
    if (!document.hidden) refreshTeamNews({ silent: true });
  }, teamNewsAutoRefreshMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - teamNewsState.lastAttemptAt >= teamNewsResumeRefreshMs) {
      refreshTeamNews({ silent: true });
    }
  });
  window.addEventListener("online", () => refreshTeamNews({ silent: true }));
}

function getTeamNewsApiUrls() {
  if (!TeamNews || !TeamNewsConfig) return [];
  const configured = Array.isArray(TeamNewsConfig.apiUrls)
    ? TeamNewsConfig.apiUrls
    : [TeamNewsConfig.apiUrl];
  return Array.from(new Set(configured.map((url) => TeamNews.normalizeHttpsUrl(url)).filter(Boolean)));
}

async function fetchTeamNewsPayload() {
  const apiUrls = getTeamNewsApiUrls();
  if (!apiUrls.length) throw new Error("新闻 API 尚未部署");
  const attempts = apiUrls.map((url) => TeamNews.fetchNews(url, { timeoutMs: 25000 }));
  const plugin = window.Capacitor?.Plugins?.SportsWidget;
  if (plugin?.fetchTeamNews) {
    attempts.unshift(
      plugin.fetchTeamNews({ urls: apiUrls }).then((result) => {
        if (!result?.json) throw new Error("原生新闻数据为空");
        return TeamNews.normalizeNewsPayload(JSON.parse(result.json));
      })
    );
  }
  try {
    return await Promise.any(attempts);
  } catch {
    throw new Error("新闻同步超时或网络不可用");
  }
}

function restoreTeamNewsCache() {
  if (!TeamNews) return;
  try {
    const raw = localStorage.getItem(teamNewsCacheKey);
    if (!raw) return;
    const cached = TeamNews.normalizeNewsPayload(JSON.parse(raw));
    teamNewsState.items = cached.items;
    teamNewsState.updatedAt = cached.updatedAt;
  } catch {
    localStorage.removeItem(teamNewsCacheKey);
  }
}

function cacheTeamNews(payload) {
  try {
    localStorage.setItem(teamNewsCacheKey, JSON.stringify(payload));
  } catch {
    // News remains available for the current session when storage is full.
  }
}

async function refreshTeamNews(options = {}) {
  if (teamNewsState.loading) return;
  if (!TeamNews || !TeamNewsConfig) {
    setTeamNewsStatus("新闻组件初始化失败", true);
    return;
  }

  if (!getTeamNewsApiUrls().length) {
    setTeamNewsStatus("新闻 API 尚未部署", true);
    renderTeamNews();
    return;
  }

  teamNewsState.loading = true;
  teamNewsState.lastAttemptAt = Date.now();
  elements.refreshTeamNewsBtn.disabled = true;
  elements.refreshTeamNewsBtn.setAttribute("aria-busy", "true");
  if (!options.silent) setTeamNewsStatus("正在同步蓝鸟队英文新闻...");
  try {
    const payload = await fetchTeamNewsPayload();
    teamNewsState.items = payload.items;
    teamNewsState.updatedAt = payload.updatedAt;
    cacheTeamNews(payload);
    renderTeamNews();
    const message = payload.items.length
      ? `${options.silent ? "已自动同步" : "已同步"} ${payload.items.length} 条英文新闻`
      : "暂时没有可显示的蓝鸟队新闻";
    setTeamNewsStatus(message);
    setTeamNewsPanelStatus(message);
    scrollToPendingTeamNews();
  } catch (error) {
    const message = `同步失败：${error.message || "网络不可用"}`;
    if (!options.silent || !teamNewsState.items.length) {
      setTeamNewsStatus(message, true);
      setTeamNewsPanelStatus(teamNewsState.items.length ? "当前显示上次同步内容" : message, !teamNewsState.items.length);
    }
  } finally {
    teamNewsState.loading = false;
    elements.refreshTeamNewsBtn.disabled = false;
    elements.refreshTeamNewsBtn.removeAttribute("aria-busy");
  }
}

function renderTeamNews() {
  const latest = teamNewsState.items[0];
  elements.teamNewsPreview.textContent = latest?.titleEn || "部署新闻服务后，将在这里显示 MLB 官方英文新闻。";
  elements.teamNewsUpdatedAt.textContent = teamNewsState.updatedAt
    ? `更新于 ${formatTeamNewsTime(teamNewsState.updatedAt)}`
    : "等待同步";

  if (!teamNewsState.items.length) {
    const empty = document.createElement("div");
    empty.className = "day-modal-empty";
    empty.textContent = TeamNewsConfig?.apiUrl ? "暂时没有蓝鸟队新闻。" : "新闻 API 尚未部署。";
    elements.teamNewsList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  teamNewsState.items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "team-news-item";
    article.dataset.newsId = item.id;
    article.dataset.url = item.url;

    const disclosure = document.createElement("button");
    disclosure.className = "team-news-disclosure";
    disclosure.type = "button";
    disclosure.dataset.newsId = item.id;
    disclosure.dataset.url = item.url;
    disclosure.setAttribute("aria-expanded", "false");

    const heading = document.createElement("div");
    heading.className = "team-news-disclosure-copy";
    const title = document.createElement("h4");
    title.textContent = item.titleEn;

    const meta = document.createElement("div");
    meta.className = "team-news-meta";
    const published = document.createElement("span");
    published.textContent = formatTeamNewsTime(item.publishedAt);
    const source = document.createElement("span");
    source.textContent = item.author ? `${item.source} · ${item.author}` : item.source;
    meta.append(published, source);

    heading.append(title, meta);
    if (item.summaryEn) {
      const summary = document.createElement("p");
      summary.className = "team-news-summary";
      summary.textContent = item.summaryEn;
      heading.append(summary);
    }

    const chevron = document.createElement("span");
    chevron.className = "team-news-chevron";
    chevron.setAttribute("aria-hidden", "true");
    disclosure.append(heading, chevron);

    const body = document.createElement("div");
    body.className = "team-news-article-body";
    body.hidden = true;
    body.setAttribute("aria-live", "polite");
    const bundledBody = TeamNews?.normalizeArticleParagraphs?.(item.bodyEn) || [];
    if (bundledBody.length) teamNewsState.articleBodies.set(item.id, bundledBody);
    const cached = teamNewsState.articleBodies.get(item.id);
    if (cached) renderTeamNewsArticleBody(body, cached);

    article.append(disclosure, body);
    fragment.append(article);
  });
  elements.teamNewsList.replaceChildren(fragment);
}

function formatTeamNewsTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function openTeamNewsModal() {
  if (document.body.classList.contains("sidebar-open")) closeSidebar();
  elements.teamNewsModal.hidden = false;
  document.body.classList.add("modal-open");
  renderTeamNews();
  elements.teamNewsModalClose.focus();
  if (!teamNewsState.items.length && getTeamNewsApiUrls().length) refreshTeamNews();
  scrollToPendingTeamNews();
}

function closeTeamNewsModal() {
  elements.teamNewsModal.hidden = true;
  document.body.classList.remove("modal-open");
  teamNewsState.pendingUrl = "";
}

function setTeamNewsStatus(message, isError = false) {
  elements.teamNewsModalStatus.textContent = message;
  elements.teamNewsModalStatus.classList.toggle("is-error", isError);
}

function setTeamNewsPanelStatus(message, isError = false) {
  elements.teamNewsPanelStatus.textContent = message;
  elements.teamNewsPanelStatus.classList.toggle("is-error", isError);
}

async function syncTeamNewsPushStatus() {
  const plugin = window.Capacitor?.Plugins?.SportsWidget;
  if (!plugin?.getTeamNewsPushStatus) {
    elements.teamNewsPushToggle.disabled = true;
    setTeamNewsPanelStatus("推送仅支持 Android 安装版");
    return;
  }

  try {
    const status = await plugin.getTeamNewsPushStatus();
    elements.teamNewsPushToggle.checked = status.enabled === true;
    elements.teamNewsPushToggle.disabled = status.configured !== true;
    if (status.configured !== true) setTeamNewsPanelStatus("需要加入 Firebase 配置后才能启用推送");
  } catch (error) {
    elements.teamNewsPushToggle.disabled = true;
    setTeamNewsPanelStatus(`推送状态读取失败：${error.message || "未知错误"}`, true);
  }
}

async function updateTeamNewsPush() {
  const requested = elements.teamNewsPushToggle.checked;
  const plugin = window.Capacitor?.Plugins?.SportsWidget;
  if (!plugin?.setTeamNewsPush) {
    elements.teamNewsPushToggle.checked = false;
    setTeamNewsPanelStatus("当前版本不支持新闻推送", true);
    return;
  }

  elements.teamNewsPushToggle.disabled = true;
  setTeamNewsPanelStatus(requested ? "正在开启蓝鸟队新闻推送..." : "正在关闭新闻推送...");
  try {
    const result = await plugin.setTeamNewsPush({
      enabled: requested,
      topic: TeamNewsConfig.topic
    });
    elements.teamNewsPushToggle.checked = result.enabled === true;
    setTeamNewsPanelStatus(result.enabled ? "蓝鸟队英文新闻推送已开启" : "蓝鸟队新闻推送已关闭");
  } catch (error) {
    elements.teamNewsPushToggle.checked = !requested;
    setTeamNewsPanelStatus(`推送设置失败：${error.message || "请检查通知权限"}`, true);
  } finally {
    elements.teamNewsPushToggle.disabled = false;
  }
}

async function consumePendingTeamNewsOpen() {
  const plugin = window.Capacitor?.Plugins?.SportsWidget;
  if (!plugin?.consumePendingNewsOpen) return;
  try {
    const result = await plugin.consumePendingNewsOpen();
    if (result?.url) handleTeamNewsOpen(result.url);
  } catch {
    // A missing pending notification is not an app startup error.
  }
}

function handleTeamNewsOpen(url) {
  const safeUrl = TeamNews?.normalizeMlbUrl?.(url);
  teamNewsState.pendingUrl = safeUrl || "";
  openTeamNewsModal();
  if (getTeamNewsApiUrls().length) refreshTeamNews({ silent: true });
}

function scrollToPendingTeamNews() {
  if (!teamNewsState.pendingUrl || elements.teamNewsModal.hidden) return;
  const target = Array.from(elements.teamNewsList.querySelectorAll(".team-news-item"))
    .find((item) => item.dataset.url === teamNewsState.pendingUrl);
  if (!target) return;
  target.scrollIntoView?.({ block: "start", behavior: "smooth" });
  const disclosure = target.querySelector(".team-news-disclosure");
  if (disclosure?.getAttribute("aria-expanded") !== "true") toggleTeamNewsArticle(disclosure);
  teamNewsState.pendingUrl = "";
}

async function toggleTeamNewsArticle(disclosure) {
  const article = disclosure.closest(".team-news-item");
  const body = article?.querySelector(".team-news-article-body");
  const newsId = disclosure.dataset.newsId || "";
  const url = TeamNews?.normalizeMlbUrl?.(disclosure.dataset.url);
  if (!article || !body || !newsId || !url) return;

  const expanded = disclosure.getAttribute("aria-expanded") === "true";
  disclosure.setAttribute("aria-expanded", String(!expanded));
  body.hidden = expanded;
  if (expanded) return;

  const cached = teamNewsState.articleBodies.get(newsId);
  if (cached) {
    renderTeamNewsArticleBody(body, cached);
    return;
  }

  const bundledBody = TeamNews?.normalizeArticleParagraphs?.(
    teamNewsState.items.find((item) => item.id === newsId)?.bodyEn
  ) || [];
  if (bundledBody.length) {
    teamNewsState.articleBodies.set(newsId, bundledBody);
    renderTeamNewsArticleBody(body, bundledBody);
    return;
  }

  if (teamNewsState.loadingBodies.has(newsId)) return;
  teamNewsState.loadingBodies.add(newsId);
  disclosure.disabled = true;
  renderTeamNewsArticleMessage(body, "正在读取 MLB 原文...");
  try {
    const plugin = window.Capacitor?.Plugins?.SportsWidget;
    if (!plugin?.fetchMlbArticle) {
      renderTeamNewsArticleMessage(body, "正文下拉阅读仅支持 Android 安装版。", true);
      return;
    }
    const result = await plugin.fetchMlbArticle({ url });
    const paragraphs = extractMlbArticleParagraphs(result?.html || "");
    if (!paragraphs.length) throw new Error("MLB 页面暂未提供可读取正文");
    teamNewsState.articleBodies.set(newsId, paragraphs);
    if (body.isConnected) renderTeamNewsArticleBody(body, paragraphs);
  } catch (error) {
    if (body.isConnected) renderTeamNewsArticleMessage(body, `正文读取失败：${error.message || "请稍后重试"}`, true);
  } finally {
    teamNewsState.loadingBodies.delete(newsId);
    if (disclosure.isConnected) disclosure.disabled = false;
  }
}

function extractMlbArticleParagraphs(html) {
  if (!html || html.length > 768 * 1024 || typeof DOMParser !== "function") return [];
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const article = documentNode.querySelector("article");
  if (!article) return [];
  const nodes = article.querySelectorAll(":scope > p, :scope > h2, :scope > h3, :scope > blockquote, :scope > ul > li, :scope > ol > li");
  const paragraphs = [];
  let totalLength = 0;
  for (const node of nodes) {
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text === "This browser does not support the video element.") continue;
    totalLength += text.length;
    if (totalLength > 40_000 || paragraphs.length >= 120) break;
    paragraphs.push(text);
  }
  if (paragraphs.length) return paragraphs;
  const description = documentNode.querySelector('meta[name="description"]')?.content?.trim();
  return description ? [description.slice(0, 1200)] : [];
}

function renderTeamNewsArticleBody(container, paragraphs) {
  const fragment = document.createDocumentFragment();
  paragraphs.forEach((paragraph) => {
    const element = document.createElement("p");
    element.textContent = paragraph;
    fragment.append(element);
  });
  container.replaceChildren(fragment);
  container.classList.remove("is-error");
}

function renderTeamNewsArticleMessage(container, message, isError = false) {
  const paragraph = document.createElement("p");
  paragraph.className = "team-news-article-message";
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
  container.classList.toggle("is-error", isError);
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  elements.sidebar.setAttribute("aria-hidden", "false");
  elements.sidebarOverlay.hidden = false;
  elements.menuToggle.setAttribute("aria-expanded", "true");
  elements.sidebarClose.focus();
  loadTeamsForSelectedLeague();
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  elements.sidebar.setAttribute("aria-hidden", "true");
  elements.sidebarOverlay.hidden = true;
  elements.menuToggle.setAttribute("aria-expanded", "false");
  elements.menuToggle.focus();
}

function bindSidebarGestures() {
  let startX = 0;
  let startY = 0;
  let canOpen = false;
  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    canOpen = startX <= 28;
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaY) > 54 || Math.abs(deltaX) < 64) return;
    if (canOpen && deltaX > 0) {
      openSidebar();
    } else if (document.body.classList.contains("sidebar-open") && deltaX < 0) {
      closeSidebar();
    }
  }, { passive: true });
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
  if (leagueConfig.source === "cfl") {
    return fetchCflSchedule(leagueConfig, start, end, options);
  }
  if (leagueConfig.source === "thesportsdb") {
    return fetchSportsDbSchedule(leagueConfig, start, end, options);
  }
  if (leagueConfig.source === "cfa") {
    return fetchCfaSchedule(leagueConfig, start, end, options);
  }
  return fetchEspnSchedule(leagueConfig, start, end, options);
}

async function fetchFullTeamSchedule(leagueConfig, team, options = {}) {
  if (usesEspnTeamSchedule(leagueConfig)) {
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
  const seasons = getEspnScheduleSeasonYears(leagueConfig);
  const seasonTypes = getEspnSeasonTypes(leagueConfig);
  const requests = seasons.flatMap((season) => seasonTypes.map((seasonType) => ({ season, seasonType })));
  const settled = await mapLimit(requests, 4, async ({ season, seasonType }) => {
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
      const providerEvents = requireArray(payload.events, `${leagueConfig.name} 球队赛程 events`);
      const events = providerEvents.map((event) => ({
        ...normalizeEspnEvent(event, leagueConfig),
        providerYear: String(season)
      }));
      cache.set(cacheKey, { time: Date.now(), data: events });
      return { status: "fulfilled", value: events };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
  return collectEspnTeamScheduleResults(settled);
}

function getEspnSeasonYear(leagueConfig, now = new Date()) {
  if (leagueConfig.id === "worldcup") {
    return getWorldCupYear(now);
  }
  if (leagueConfig.id === "nba") {
    return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  }
  if (leagueConfig.id === "nfl") {
    return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
  }
  if (leagueConfig.sport === "soccer" && !["csl", "worldcup"].includes(leagueConfig.id)) {
    return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return now.getFullYear();
}

function usesEspnTeamSchedule(leagueConfig) {
  return !leagueConfig.source && ["basketball", "baseball", "football"].includes(leagueConfig.sport);
}

function getEspnScheduleSeasonYears(leagueConfig, now = new Date()) {
  const current = getEspnSeasonYear(leagueConfig, now);
  if (!usesEspnTeamSchedule(leagueConfig)) return [current];
  return [...new Set([current, current + 1])];
}

function getEspnSeasonTypes(leagueConfig) {
  if (leagueConfig.id === "nba" || leagueConfig.id === "nfl") return [1, 2, 3];
  return [2];
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
  const providerEvents = requireArray(payload.events, `${leagueConfig.name} 赛程 events`);
  const events = providerEvents
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

async function fetchCflSchedule(leagueConfig, start, end, options = {}) {
  const season = await fetchCflSeason(leagueConfig, options);
  const cacheKey = `${leagueConfig.id}:cfl:matches:${season.id}`;
  const cached = cache.get(cacheKey);
  let seasonEvents = cached?.data;
  if (options.force || !cached || Date.now() - cached.time >= 5 * 60 * 1000) {
    const endpoint = new URL("https://api.cfl-china.cn/frontweb/api/matches/page");
    endpoint.searchParams.set("tournament_calendar_id", season.id);
    endpoint.searchParams.set("competition_code", season.competitionCode);
    endpoint.searchParams.set("curPage", "1");
    endpoint.searchParams.set("pageSize", "999");
    const payload = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} 官方赛程`);
    const providerEvents = requireArray(payload.data?.dataList, `${leagueConfig.name} 官方赛程 dataList`);
    seasonEvents = providerEvents.map((event) => normalizeCflEvent(event, leagueConfig, season));
    cache.set(cacheKey, { time: Date.now(), data: seasonEvents });
  }

  return {
    events: filterEventsByDateRange(seasonEvents, start, end).sort(sortByStart),
    errors: []
  };
}

async function fetchCflSeason(leagueConfig, options = {}) {
  const competitionCode = leagueConfig.cflCompetitionCode;
  if (!competitionCode) {
    throw new Error(`${leagueConfig.name} 官方赛事代码尚未配置`);
  }
  const cacheKey = `${leagueConfig.id}:cfl:tournaments`;
  const cached = cache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.data;

  const endpoint = new URL("https://api.cfl-china.cn/frontweb/api/tournaments");
  endpoint.searchParams.set("competition_code", competitionCode);
  const payload = await fetchJsonWithRetry(endpoint.toString(), `${leagueConfig.name} 官方赛季`);
  const seasons = payload.data?.dataList || [];
  const currentYear = String(new Date().getFullYear());
  const season = seasons.find((item) => item.active === "yes")
    || seasons.find((item) => String(item.name) === currentYear)
    || seasons[0];
  if (!season?.id) {
    throw new Error(`${leagueConfig.name} 未找到当前官方赛季`);
  }

  const result = {
    id: String(season.id),
    name: String(season.name || currentYear),
    competitionCode
  };
  cache.set(cacheKey, { time: Date.now(), data: result });
  return result;
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

function filterEventsByDateRange(events, start, end) {
  const first = startOfDay(start).getTime();
  const afterLast = addDays(startOfDay(end), 1).getTime();
  return (events || []).filter((event) => {
    const time = new Date(event.start).getTime();
    return time >= first && time < afterLast;
  });
}

function collectEspnTeamScheduleResults(settled) {
  const eventsById = new Map();
  const errors = [];
  let fulfilledCount = 0;
  settled.forEach((item) => {
    if (item.status === "rejected") {
      errors.push(item.reason?.message || "请求失败");
      return;
    }
    fulfilledCount += 1;
    item.value.forEach((event) => eventsById.set(event.id, event));
  });
  return {
    events: [...eventsById.values()].sort(sortByStart),
    errors: fulfilledCount ? [] : errors
  };
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

async function fetchJsonWithRetry(url, label, attempts = 2, timeoutMs = 10000) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (response.ok) {
        const length = Number(response.headers.get("content-length") || 0);
        if (length > 5 * 1024 * 1024) throw new Error(`${label} 返回数据过大`);
        const text = await response.text();
        if (text.length > 6 * 1024 * 1024) throw new Error(`${label} 返回数据过大`);
        return JSON.parse(text);
      }
      lastError = new Error(`${label} 返回 ${response.status}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error.name === "AbortError"
        ? new Error(`${label} 请求超时`)
        : new Error(`${label} 网络失败：${error.message}`);
    } finally {
      window.clearTimeout(timeout);
    }
    if (attempt < attempts - 1) await wait(350 * (2 ** attempt) + Math.round(Math.random() * 150));
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
    seasonEvents = requireArray(rows, `${leagueConfig.name} 中国足协赛程`).map((event) => normalizeCfaEvent(event, runtimeConfig));
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
  const homeMeta = normalizeEventTeam(homeTeam, leagueConfig);
  const awayMeta = normalizeEventTeam(awayTeam, leagueConfig);
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
    teamMeta: [homeMeta, awayMeta].filter(Boolean),
    title: event.name || `${awayTeam.displayName || "Away"} @ ${homeTeam.displayName || "Home"}`,
    shortTitle: event.shortName || event.name,
    start: event.date || competition.date || competition.startDate,
    venue: competition.venue?.fullName || event.venue?.displayName || "",
    city: competition.venue?.address?.city || "",
    status: statusType.shortDetail || statusType.detail || statusType.description || "Scheduled",
    statusState: statusType.state || "",
    completed: Boolean(statusType.completed),
    homeScore: cleanScoreValue(home.score),
    awayScore: cleanScoreValue(away.score),
    homeTeam: homeMeta?.name || homeTeam.displayName || homeTeam.name || "",
    awayTeam: awayMeta?.name || awayTeam.displayName || awayTeam.name || "",
    teams: [homeTeam.displayName, awayTeam.displayName, homeTeam.abbreviation, awayTeam.abbreviation].filter(Boolean),
    homeLogo: getTeamLogo(homeTeam),
    awayLogo: getTeamLogo(awayTeam),
    homeColor: getTeamColor(homeTeam, leagueConfig.color),
    awayColor: getTeamColor(awayTeam, leagueConfig.color),
    broadcast: [...new Set(broadcasts)].join(" / "),
    url: link?.href || "",
    scoreUpdatedAt: new Date().toISOString(),
    importedAt: new Date().toISOString()
  };
}

function normalizeCflEvent(event, leagueConfig, season) {
  const status = event.match_status || "Fixture";
  const start = `${String(event.local_date_time || `${event.local_date || ""} ${event.local_time || "00:00:00"}`).replace(" ", "T")}+08:00`;
  const completed = isFinishedStatusText(status);
  const homeTeam = normalizeProviderTeam({
    id: event.home_contestant_id,
    name: cleanCfaTeamName(event.home_contestant_name || event.home_contestant_name_en || "主队"),
    logo: event.home_contestant_icon
  }, leagueConfig);
  const awayTeam = normalizeProviderTeam({
    id: event.away_contestant_id,
    name: cleanCfaTeamName(event.away_contestant_name || event.away_contestant_name_en || "客队"),
    logo: event.away_contestant_icon
  }, leagueConfig);

  return {
    id: `${leagueConfig.id}-${event.id}`,
    sourceId: String(event.id || ""),
    dataSource: "cfl",
    providerLeagueId: event.competition_code || season.competitionCode,
    providerYear: event.tournament_calendar_id || season.id,
    providerDate: event.local_date || "",
    league: leagueConfig.id,
    leagueName: leagueConfig.name,
    leagueColor: leagueConfig.color,
    leagueTeamIds: [homeTeam.id, awayTeam.id].filter(Boolean),
    teamMeta: [homeTeam, awayTeam],
    title: `${homeTeam.name} vs ${awayTeam.name}`,
    shortTitle: `${homeTeam.name} vs ${awayTeam.name}`,
    start,
    venue: event.venue_short_name || event.venue_long_name || "",
    city: "",
    status,
    statusState: completed ? "post" : (isLiveStatusText(status) ? "in" : "pre"),
    completed,
    homeScore: cflScoreValue(event, "home"),
    awayScore: cflScoreValue(event, "away"),
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
    teams: [homeTeam.name, awayTeam.name, event.home_contestant_name_en, event.away_contestant_name_en].filter(Boolean),
    homeLogo: homeTeam.logo,
    awayLogo: awayTeam.logo,
    homeColor: leagueConfig.color,
    awayColor: leagueConfig.color,
    broadcast: "",
    url: "https://www.cfl-china.cn/zh/fixtures/list.html",
    scoreUpdatedAt: new Date().toISOString(),
    importedAt: new Date().toISOString()
  };
}

function cflScoreValue(event, side) {
  const fields = [`total_${side}_score`, `ft_${side}_score`, `ht_${side}_score`];
  const value = fields.map((field) => event[field]).find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return cleanScoreValue(value);
}

function combineStatusText(...values) {
  return [...new Set(values
    .map((value) => String(value || "").trim())
    .filter((value) => value && value.toLowerCase() !== "null"))]
    .join(" ");
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 数据格式异常`);
  return value;
}

function normalizeSportsDbEvent(event, leagueConfig) {
  const rawTimestamp = event.strTimestamp || `${event.dateEvent || ""}T${event.strTime || "00:00:00"}`;
  const start = /(?:Z|[+-]\d{2}:?\d{2})$/.test(rawTimestamp) ? rawTimestamp : `${rawTimestamp}Z`;
  const status = combineStatusText(event.strStatus, event.strProgress) || "Scheduled";
  const completed = isFinishedStatusText(status);
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
    statusState: completed ? "post" : (isLiveStatusText(status) ? "in" : "pre"),
    completed,
    homeScore: cleanScoreValue(event.intHomeScore),
    awayScore: cleanScoreValue(event.intAwayScore),
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
  const statusInfo = getCfaStatusInfo(event, start, scoreMatch);
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
    status: statusInfo.status,
    statusState: statusInfo.state,
    completed: statusInfo.completed,
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

function getCfaStatusInfo(event, start, scoreMatch, now = Date.now()) {
  const providerStatus = combineStatusText(
    event.status,
    event.gamestatus,
    event.game_status,
    event.matchstatus,
    event.match_status,
    event.state
  );
  const classified = CalendarCore.classifyEventStatus({ status: providerStatus });
  if (classified === "finished") return { status: providerStatus || "已结束", state: "post", completed: true };
  if (classified === "live") return { status: providerStatus || "进行中", state: "in", completed: false };
  if (classified === "postponed" || classified === "canceled") {
    return { status: providerStatus, state: "pre", completed: false };
  }
  const startTime = Date.parse(start);
  if (Number.isFinite(startTime) && now >= startTime + 4 * 60 * 60 * 1000) {
    return { status: scoreMatch ? "已结束" : "赛果待确认", state: scoreMatch ? "post" : "pre", completed: Boolean(scoreMatch) };
  }
  if (Number.isFinite(startTime) && now >= startTime - 5 * 60 * 1000) {
    return { status: "进行中", state: "in", completed: false };
  }
  return { status: "未开始", state: "pre", completed: false };
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
    const tournamentYear = getWorldCupYear(now);
    return { start: new Date(tournamentYear, 5, 1), end: new Date(tournamentYear, 7, 15) };
  }
  if (leagueConfig.id === "mlb") {
    return { start: new Date(year, 1, 1), end: new Date(year, 10, 30) };
  }
  if (leagueConfig.calendarYearSeason || ["cfl", "thesportsdb", "cfa"].includes(leagueConfig.source)) {
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
  const derivedProviderLeagueId = leagueConfig.id === "cmcl" ? `${year}0410` : "";
  const providerLeagueId = override.providerLeagueId || leagueConfig.providerLeagueId || derivedProviderLeagueId;
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

function getWorldCupYear(now = new Date()) {
  const year = now.getFullYear();
  const offset = ((year - 2026) % 4 + 4) % 4;
  let tournamentYear = offset === 0 ? year : year + (4 - offset);
  if (offset === 0 && now > new Date(year, 7, 31, 23, 59, 59)) tournamentYear += 4;
  return tournamentYear;
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
    const leagueEntries = [...teamsByLeague.entries()];
    let completedGroups = 0;
    await mapLimit(leagueEntries, 3, async ([leagueId, leagueTeams]) => {
      const leagueConfig = leagues.find((league) => league.id === leagueId);
      if (!leagueConfig) {
        errors.push(`${leagueTeams[0].leagueName} 配置缺失`);
        return;
      }

      const sharesLeagueSchedule = leagueConfig.source || leagueConfig.sport === "soccer";
      if (sharesLeagueSchedule) {
        try {
          const { start, end } = getFullScheduleRange(leagueConfig);
          const payload = await fetchLeagueSchedule(leagueConfig, start, end, { force: true });
          errors.push(...payload.errors);
          leagueTeams.forEach((team) => {
            const teamEvents = payload.events
              .filter((event) => matchesSelectedTeams(event, [team]))
              .map((event) => tagImportedEvent(event, team));
            updatedEvents.push(...teamEvents);
            if (!payload.errors.length) updatedTeamKeys.add(team.key);
          });
        } catch (error) {
          errors.push(`${leagueConfig.name}：${error.message}`);
        }
      } else {
        await mapLimit(leagueTeams, 4, async (team) => {
          try {
            const payload = await fetchFullTeamSchedule(leagueConfig, team, { force: true });
            errors.push(...payload.errors);
            const teamEvents = payload.events.map((event) => tagImportedEvent(event, team));
            updatedEvents.push(...teamEvents);
            if (!payload.errors.length) updatedTeamKeys.add(team.key);
          } catch (error) {
            errors.push(`${team.leagueName} ${team.abbreviation || team.name}：${error.message}`);
          }
        });
      }
      completedGroups += 1;
      setStatus(`正在更新赛程：${completedGroups}/${leagueEntries.length} 个联赛完成...`);
    });

    const previousEvents = state.events;
    const preparedUpdatedEvents = updatedEvents.map((event) => preserveExistingEventAssets(event, previousEvents));
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
    preparedUpdatedEvents.forEach((event) => {
      byId.set(event.id, CalendarCore.mergeEventRecords(byId.get(event.id), event));
    });
    state.events = [...byId.values()].sort(sortByStart);
    state.cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    persist({ syncWidget: true });
    render();
    const newCount = updatedEvents.filter((event) => !beforeIds.has(event.id)).length;
    const uniqueErrors = [...new Set(errors)];
    const warning = uniqueErrors.length ? `，${uniqueErrors.length} 个请求失败` : "";
    const retained = teams.length > updatedTeamKeys.size ? `，${teams.length - updatedTeamKeys.size} 支球队未拉到新赛程并保留原内容` : "";
    setStatus(
      `更新完成：${updatedTeamKeys.size} 支球队共 ${updatedEvents.length} 场已确定赛程，新增 ${newCount} 场${warning}${retained}。`,
      Boolean(!updatedTeamKeys.size && uniqueErrors.length)
    );
    state.refreshMeta = {
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: updatedTeamKeys.size ? new Date().toISOString() : state.refreshMeta.lastSuccessAt,
      lastError: uniqueErrors.join("；")
    };
    persist({ syncWidget: true });
  } catch (error) {
    state.refreshMeta = {
      ...state.refreshMeta,
      lastAttemptAt: new Date().toISOString(),
      lastError: error.message
    };
    persist();
    setStatus(`更新失败，原赛程已保留：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function preserveExistingEventAssets(event, previousEvents) {
  const previous = previousEvents.find((candidate) => candidate.id === event.id)
    || previousEvents.find((candidate) => eventsLikelySameMatch(candidate, event));
  if (!previous) return event;
  return {
    ...event,
    homeLogo: event.homeLogo || previous.homeLogo,
    awayLogo: event.awayLogo || previous.awayLogo
  };
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > maxImportBytes) {
    setStatus("导入文件不能超过 5 MB。", true);
    elements.fileImport.value = "";
    return;
  }
  const name = file.name.toLowerCase();
  try {
    const text = await file.text();
    let events = [];
    if (name.endsWith(".ics")) events = parseIcs(text);
    else if (name.endsWith(".csv")) events = parseCsv(text);
    else if (name.endsWith(".json")) events = parseJson(text);
    else throw new Error("暂不支持这个文件格式。");
    if (events.length > maxImportEvents) throw new Error(`单次最多导入 ${maxImportEvents} 场比赛。`);
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
  if (rows.length > maxImportEvents) throw new Error(`JSON 赛事数量超过 ${maxImportEvents} 场。`);
  return rows.map((row, index) => normalizeImportedEvent(row, `json-${index}`));
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length > maxImportEvents + 1) throw new Error(`CSV 赛事数量超过 ${maxImportEvents} 场。`);
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
  if (blocks.length > maxImportEvents) throw new Error(`ICS 赛事数量超过 ${maxImportEvents} 场。`);
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
  const minimumDate = new Date();
  minimumDate.setFullYear(minimumDate.getFullYear() - 10);
  const maximumDate = new Date();
  maximumDate.setFullYear(maximumDate.getFullYear() + 10);
  if (parsed < minimumDate || parsed > maximumDate) throw new Error(`赛事日期超出允许范围：${start}`);
  const leagueName = row.leagueName || row.league || "导入";
  const cleanText = (value, limit = 240) => String(value || "").trim().slice(0, limit);
  return {
    id: cleanText(row.id, 160) || `imported-${hash(`${fallbackId}-${row.title || row.summary || start}`)}`,
    league: cleanText(row.league, 80) || "imported",
    leagueName: cleanText(leagueName, 80),
    leagueColor: CalendarCore.sanitizeColor(row.leagueColor, "#00c2ff"),
    title: cleanText(row.title || row.summary || row.name, 240) || "未命名赛事",
    shortTitle: cleanText(row.shortTitle || row.title || row.summary || row.name, 120) || "未命名赛事",
    start: parsed.toISOString(),
    venue: cleanText(row.venue || row.location, 180),
    city: cleanText(row.city, 100),
    status: cleanText(row.status, 80) || "Scheduled",
    statusState: cleanText(row.statusState, 20),
    completed: CalendarCore.parseBoolean(row.completed),
    homeScore: cleanScoreValue(row.homeScore),
    awayScore: cleanScoreValue(row.awayScore),
    homeTeam: cleanText(row.homeTeam, 120),
    awayTeam: cleanText(row.awayTeam, 120),
    teams: [row.homeTeam, row.awayTeam, row.teams].flat().filter(Boolean).slice(0, 16).map((value) => cleanText(value, 120)),
    broadcast: cleanText(row.broadcast, 120),
    url: sanitizeExternalUrl(row.url),
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

  elements.teamStatus.textContent = usesStaticWorldCupTeams(leagueConfig)
    ? "正在加载世界杯 48 支参赛队..."
    : "正在加载本赛季全部已确定赛程中的球队...";
  elements.teamGrid.innerHTML = "";

  try {
    if (usesStaticWorldCupTeams(leagueConfig)) {
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
  const aliasRecord = leagueConfig.id === "csl" ? findCslTeamAlias(team) : null;
  return {
    id: String(team.id || ""),
    uid: team.uid || "",
    league: leagueConfig.id,
    name: aliasRecord?.name || team.displayName || team.name || team.shortDisplayName || team.abbreviation || "",
    shortName: aliasRecord?.name || team.shortDisplayName || team.name || team.displayName || "",
    abbreviation: team.abbreviation || "",
    aliases: aliasRecord?.aliases || [],
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
  if (usesStaticWorldCupTeams(leagueConfig)) return `${state.selectedLeague}:teams:2026`;
  return `${state.selectedLeague}:full-season:${getLeagueSeasonKey(leagueConfig)}`;
}

function usesStaticWorldCupTeams(leagueConfig, now = new Date()) {
  return leagueConfig?.id === "worldcup" && getWorldCupYear(now) === 2026;
}

function getLeagueSeasonKey(leagueConfig, now = new Date()) {
  if (!leagueConfig) return "unknown";
  if (leagueConfig.source === "cfl") return `${leagueConfig.cflCompetitionCode || leagueConfig.id}:${now.getFullYear()}`;
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
  if (event.leagueTeamIds?.some((id) => selectedIds.has(String(id)))) {
    return true;
  }

  const selectedTerms = selectedTeams
    .flatMap((team) => getTeamAliases(team, event.league))
    .map(normalizeMatchText)
    .filter(Boolean);
  const eventTerms = [
    event.homeTeam,
    event.awayTeam,
    ...(event.teams || []),
    ...(event.teamMeta || []).flatMap((team) => getTeamAliases(team, event.league))
  ].map(normalizeMatchText).filter(Boolean);
  const eventTermSet = new Set(eventTerms);
  const titles = [event.title, event.shortTitle].map(normalizeMatchText).filter(Boolean);
  return selectedTerms.some((term) =>
    eventTermSet.has(term)
    || (term.length >= 5 && titles.some((title) => title.includes(term)))
  );
}

function findCslTeamAlias(team) {
  const id = String(team?.id || "");
  const candidates = [
    team?.displayName,
    team?.name,
    team?.shortDisplayName,
    team?.abbreviation,
    ...(team?.aliases || [])
  ].filter(Boolean).map(normalizeMatchText);
  return cslTeamAliases.find((record) =>
    record.id === id
    || record.aliases.some((alias) => candidates.includes(normalizeMatchText(alias)))
  ) || null;
}

function getTeamAliases(team, leagueId = "") {
  const values = [team?.name, team?.shortName, team?.abbreviation, ...(team?.aliases || [])].filter(Boolean);
  if ((team?.league || leagueId) === "csl") {
    const record = findCslTeamAlias(team);
    if (record) values.push(...record.aliases);
  }
  return [...new Set(values)];
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/football club|\bfc\b|足球俱乐部|俱乐部/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
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
  warmVisibleMonthLogos(events);
}

function renderChip(event) {
  const color = eventColor(event, "#00c2ff");
  const matchup = getMatchupPresentation(event);
  const leftLogo = renderImage(matchup.left.logo, matchup.left.team || "Team");
  const rightLogo = renderImage(matchup.right.logo, matchup.right.team || "Team");
  return `
    <div class="event-chip" style="--event-color:${escapeHtml(color)}">
      <div class="matchup-row">
        <span class="matchup-logo ${matchup.left.slot}-logo">${leftLogo}</span>
        <span class="matchup-divider">vs</span>
        <span class="matchup-logo ${matchup.right.slot}-logo">${rightLogo}</span>
      </div>
      <strong>${escapeHtml(event.shortTitle || event.title)}</strong>
      <span>${formatTime(new Date(event.start))} / ${escapeHtml(event.leagueName || event.league)}</span>
    </div>
  `;
}

function warmVisibleMonthLogos(events) {
  const sources = [...new Set((events || []).flatMap((event) => [event.homeLogo, event.awayLogo]).filter(Boolean))]
    .slice(0, 24);
  const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 50));
  schedule(() => mapLimit(sources, 4, warmImageSource), { timeout: 1800 });
}

function warmImageSource(value) {
  const source = CalendarCore.normalizeImageUrl(value, "");
  if (!source || getCachedImageSource(source)) return Promise.resolve();
  if (imagePreloadPending.has(source)) return imagePreloadPending.get(source);
  const task = new Promise((resolve) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = async () => {
      queueImageCache(source);
      try {
        await image.decode?.();
      } catch {
        // The decoded browser cache is still useful even if decode() rejects.
      }
      resolve();
    };
    image.onerror = resolve;
    image.src = source;
  }).finally(() => imagePreloadPending.delete(source));
  imagePreloadPending.set(source, task);
  return task;
}

let activeDayModalDate = "";

function openDayModal(dateKey) {
  activeDayModalDate = dateKey;
  const date = parseInputDate(dateKey);
  const shouldRefresh = !isDayScoreRefreshFresh(dateKey);
  renderDayModalContents(dateKey, shouldRefresh);
  elements.dayModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.dayModalClose.focus();
  if (shouldRefresh) refreshDayModalScores(dateKey);
}

function renderDayModalContents(dateKey, isRefreshing = false) {
  const dayEvents = getFilteredEvents().filter((event) => toInputDate(new Date(event.start)) === dateKey);
  const date = parseInputDate(dateKey);
  elements.dayModalTitle.textContent = formatDate(date, { month: "long", day: "numeric", weekday: "long" });
  elements.dayModalCount.textContent = dayEvents.length
    ? `${dayEvents.length} 场比赛${isRefreshing ? " · 更新中" : ""}`
    : "暂无比赛";
  elements.dayModalBody.innerHTML = dayEvents.length
    ? dayEvents.map((event) => renderDayModalEvent(event, { isRefreshing })).join("")
    : `<div class="day-modal-empty">当天没有已导入的比赛。</div>`;
}

function isDayScoreRefreshFresh(dateKey) {
  return Date.now() - Number(dayScoreRefreshTimes.get(dateKey) || 0) < scoreRefreshTtlMs;
}

function refreshDayModalScores(dateKey, options = {}) {
  if (!options.force && isDayScoreRefreshFresh(dateKey)) return Promise.resolve();
  if (dayScoreRefreshes.has(dateKey)) return dayScoreRefreshes.get(dateKey);
  const task = performDayScoreRefresh(dateKey)
    .finally(() => dayScoreRefreshes.delete(dateKey));
  dayScoreRefreshes.set(dateKey, task);
  return task;
}

async function performDayScoreRefresh(dateKey) {
  const dayEvents = state.events.filter((event) => toInputDate(new Date(event.start)) === dateKey);
  const leagueIds = [...new Set(dayEvents.map((event) => event.league))];
  const leagueConfigs = leagueIds
    .map((id) => leagues.find((league) => league.id === id))
    .filter(Boolean);
  if (!leagueConfigs.length) return;

  const date = parseInputDate(dateKey);
  const start = addDays(date, -1);
  const refreshed = [];
  let successfulLeagues = 0;
  const refreshErrors = [];
  await Promise.all(leagueConfigs.map(async (leagueConfig) => {
    try {
      const payload = await fetchLeagueSchedule(leagueConfig, start, date, { force: true, dayOnly: true });
      refreshed.push(...payload.events);
      successfulLeagues += 1;
    } catch (error) {
      refreshErrors.push(`${leagueConfig.name}：${error.message}`);
      console.warn(`Score refresh failed for ${leagueConfig.id}`, error);
    }
  }));

  let updateCount = 0;
  if (refreshed.length && dayEvents.length) {
    state.events = state.events.map((event) => {
      if (toInputDate(new Date(event.start)) !== dateKey) return event;
      const update = findRefreshedEvent(event, refreshed);
      if (!update) return event;
      updateCount += 1;
      return CalendarCore.mergeEventRecords(event, {
        ...update,
        id: event.id,
        homeLogo: update.homeLogo || event.homeLogo,
        awayLogo: update.awayLogo || event.awayLogo,
        scoreUpdatedAt: new Date().toISOString()
      });
    }).sort(sortByStart);
  }

  if (updateCount) {
    persist({ syncWidget: true });
    renderStats();
  }
  state.refreshMeta = {
    lastAttemptAt: new Date().toISOString(),
    lastSuccessAt: successfulLeagues ? new Date().toISOString() : state.refreshMeta.lastSuccessAt,
    lastError: refreshErrors.join("；")
  };
  persist({ syncWidget: Boolean(updateCount) });
  if (successfulLeagues) dayScoreRefreshTimes.set(dateKey, Date.now());
  if (activeDayModalDate === dateKey && !elements.dayModal.hidden) {
    patchDayModalContents(dateKey);
  }
}

function findRefreshedEvent(event, candidates) {
  return candidates.find((candidate) => candidate.id === event.id)
    || candidates.find((candidate) =>
      candidate.league === event.league
      && candidate.sourceId
      && String(candidate.sourceId) === String(event.sourceId || "")
    )
    || candidates.find((candidate) => eventsLikelySameMatch(event, candidate));
}

function eventsLikelySameMatch(left, right) {
  if (!left || !right || left.league !== right.league) return false;
  const timeGap = Math.abs(new Date(left.start).getTime() - new Date(right.start).getTime());
  if (!Number.isFinite(timeGap) || timeGap > 18 * 60 * 60 * 1000) return false;
  const sameDirection = teamNamesOverlap(left.homeTeam, right.homeTeam, left.league)
    && teamNamesOverlap(left.awayTeam, right.awayTeam, left.league);
  const swapped = teamNamesOverlap(left.homeTeam, right.awayTeam, left.league)
    && teamNamesOverlap(left.awayTeam, right.homeTeam, left.league);
  return sameDirection || swapped;
}

function teamNamesOverlap(left, right, leagueId) {
  const leftAliases = getTeamAliases({ name: left, league: leagueId }, leagueId).map(normalizeMatchText);
  const rightAliases = getTeamAliases({ name: right, league: leagueId }, leagueId).map(normalizeMatchText);
  return leftAliases.some((value) => value && rightAliases.includes(value));
}

function patchDayModalContents(dateKey) {
  const dayEvents = getFilteredEvents().filter((event) => toInputDate(new Date(event.start)) === dateKey);
  const cards = [...elements.dayModalBody.querySelectorAll("[data-event-id]")];
  const cardIds = new Set(cards.map((card) => card.dataset.eventId));
  if (cards.length !== dayEvents.length || dayEvents.some((event) => !cardIds.has(event.id))) {
    renderDayModalContents(dateKey);
    return;
  }
  elements.dayModalCount.textContent = dayEvents.length ? `${dayEvents.length} 场比赛` : "暂无比赛";
  const byId = new Map(dayEvents.map((event) => [event.id, event]));
  cards.forEach((card) => {
    const event = byId.get(card.dataset.eventId);
    if (!event) return;
    const display = getDayModalDisplay(event);
    card.querySelector(".day-modal-start").textContent = display.start;
    const score = card.querySelector(".day-modal-score");
    score.textContent = display.score;
    score.classList.toggle("is-live", isEventLive(event));
    card.querySelector(".day-modal-status").textContent = display.status;
    card.querySelector(".day-modal-title").textContent = display.details;
  });
}

function refreshStartupScores() {
  const today = startOfDay(new Date());
  const dates = [addDays(today, -1), today]
    .map(toInputDate)
    .filter((dateKey) => state.events.some((event) => toInputDate(new Date(event.start)) === dateKey));
  return Promise.allSettled(dates.map((dateKey) => refreshDayModalScores(dateKey)));
}

function closeDayModal() {
  activeDayModalDate = "";
  elements.dayModal.hidden = true;
  if (elements.deleteModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function renderDayModalEvent(event, options = {}) {
  const color = eventColor(event, "#c8e8b8");
  const matchup = getMatchupPresentation(event);
  const leftLogo = renderImage(matchup.left.logo, matchup.left.team || "Team", { eager: true });
  const rightLogo = renderImage(matchup.right.logo, matchup.right.team || "Team", { eager: true });
  const display = getDayModalDisplay(event, options);
  return `
    <article class="day-modal-game" data-event-id="${escapeAttr(event.id)}" style="--event-color:${escapeHtml(color)}">
      <span class="day-modal-logo">${leftLogo}</span>
      <div class="day-modal-center">
        <span class="day-modal-start">${escapeHtml(display.start)}</span>
        <strong class="day-modal-score ${isEventLive(event) ? "is-live" : ""}">${escapeHtml(display.score)}</strong>
        <span class="day-modal-status">${escapeHtml(display.status)}</span>
        <span class="day-modal-title">${escapeHtml(display.details)}</span>
      </div>
      <span class="day-modal-logo">${rightLogo}</span>
    </article>
  `;
}

function getDayModalDisplay(event, options = {}) {
  const maskScore = options.isRefreshing && shouldMaskUnverifiedScore(event);
  const details = [
    event.shortTitle || event.title,
    [event.venue, event.city].filter(Boolean).join(" · "),
    event.broadcast ? `转播：${event.broadcast}` : ""
  ].filter(Boolean).join(" / ");
  return {
    start: formatTime(new Date(event.start)),
    score: maskScore ? "···" : eventScoreLabel(event),
    status: [maskScore ? "正在同步" : eventStatusLabel(event), event.leagueName || event.league]
      .filter(Boolean)
      .join(" · "),
    details
  };
}

function shouldMaskUnverifiedScore(event) {
  if (event.scoreUpdatedAt || new Date(event.start).getTime() > Date.now()) return false;
  const home = scoreText(event.homeScore);
  const away = scoreText(event.awayScore);
  return (home === "0" && away === "0") || (!cleanScoreValue(event.homeScore) && !cleanScoreValue(event.awayScore));
}

function eventScoreLabel(event) {
  const matchup = getMatchupPresentation(event);
  return `${scoreText(matchup.left.score)} - ${scoreText(matchup.right.score)}`;
}

function eventStatusLabel(event) {
  const status = CalendarCore.classifyEventStatus(event);
  if (status === "live") return "进行中";
  if (status === "finished") return "已结束";
  if (status === "postponed") return "已延期";
  if (status === "canceled") return "已取消";
  return "未开始";
}

function isEventLive(event) {
  return CalendarCore.isEventLive(event);
}

function isEventFinished(event) {
  return CalendarCore.isEventFinished(event);
}

function isLiveStatusText(value) {
  return CalendarCore.isLiveStatusText(value);
}

function isFinishedStatusText(value) {
  return CalendarCore.isFinishedStatusText(value);
}

function getMatchupPresentation(event) {
  const homeFirst = isSoccerHomeFirst(event);
  const home = {
    slot: "home",
    team: event.homeTeam,
    logo: event.homeLogo,
    score: event.homeScore
  };
  const away = {
    slot: "away",
    team: event.awayTeam,
    logo: event.awayLogo,
    score: event.awayScore
  };
  return homeFirst
    ? { left: home, right: away }
    : { left: away, right: home };
}

function isSoccerHomeFirst(event) {
  const leagueConfig = leagues.find((league) => league.id === event.league);
  return leagueConfig?.sport === "soccer";
}

function cleanScoreValue(value) {
  return CalendarCore.normalizeScoreValue(value);
}

function scoreText(value) {
  return cleanScoreValue(value) || "0";
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
    <article class="event-card" style="--event-color:${escapeHtml(CalendarCore.sanitizeColor(event.leagueColor, "#00c2ff"))}">
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
  return CalendarCore.sanitizeColor(
    CalendarCore.getEventImportedTeams(event)[0]?.color || event.leagueColor,
    fallback
  );
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

let persistTimer = 0;
let persistShouldSyncWidget = false;

function persist(options = {}) {
  persistShouldSyncWidget ||= Boolean(options.syncWidget);
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(flushPersist, 120);
}

async function flushPersist() {
  window.clearTimeout(persistTimer);
  persistTimer = 0;
  const shouldSyncWidget = persistShouldSyncWidget;
  persistShouldSyncWidget = false;
  try {
    await CalendarStorage.save(createStorageSnapshot());
    if (shouldSyncWidget) scheduleWidgetSync();
  } catch (error) {
    console.warn("Local schedule save failed", error);
  }
}

function createStorageSnapshot() {
  return {
    selectedLeague: state.selectedLeague,
    selectedTeamsByLeague: state.selectedTeamsByLeague,
    events: state.events,
    followedTeams: state.followedTeams,
    filters: state.filters,
    refreshMeta: state.refreshMeta
  };
}

async function load() {
  const saved = await CalendarStorage.load();
  state.selectedLeague = saved.selectedLeague || state.selectedLeague;
  state.selectedTeamsByLeague = saved.selectedTeamsByLeague || state.selectedTeamsByLeague;
  state.events = Array.isArray(saved.events)
    ? saved.events.map((event) => {
      const invalidScore = CalendarCore.isInvalidScoreValue(event.homeScore)
        || CalendarCore.isInvalidScoreValue(event.awayScore);
      const normalized = CalendarCore.mergeEventRecords(null, event);
      if (invalidScore) normalized.scoreUpdatedAt = "";
      return normalized;
    })
    : [];
  state.followedTeams = CalendarCore.deriveFollowedTeams(state.events, saved.followedTeams || []);
  state.filters = { ...state.filters, ...(saved.filters || {}) };
  state.refreshMeta = { ...state.refreshMeta, ...(saved.refreshMeta || {}) };
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
  const events = state.events
    .slice(-maxWidgetEvents)
    .map(toWidgetEvent);
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
    awayScore: cleanScoreValue(event.awayScore),
    homeScore: cleanScoreValue(event.homeScore),
    awayLogo: CalendarCore.normalizeImageUrl(event.awayLogo, ""),
    homeLogo: CalendarCore.normalizeImageUrl(event.homeLogo, ""),
    awayTeam: event.awayTeam || "",
    homeTeam: event.homeTeam || "",
    venue: event.venue || "",
    city: event.city || "",
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

function renderRefreshStatus() {
  if (state.refreshMeta.lastError) {
    const attempted = state.refreshMeta.lastAttemptAt
      ? formatDate(new Date(state.refreshMeta.lastAttemptAt), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "最近一次";
    setStatus(`${attempted} 更新失败，原赛程已保留。`, true);
    return;
  }
  if (state.refreshMeta.lastSuccessAt) {
    const updated = formatDate(new Date(state.refreshMeta.lastSuccessAt), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    setStatus(`上次成功更新：${updated}`);
  }
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

function isCacheableImageSource(source) {
  return CalendarImageCache.isCacheable(source);
}

function getCachedImageSource(source) {
  return CalendarImageCache.get(source);
}

function queueImageCache(source) {
  return CalendarImageCache.queue(source);
}

function renderImage(value, alt = "", options = {}) {
  const source = CalendarCore.normalizeImageUrl(value, imageFallbackUrl);
  const cached = getCachedImageSource(source);
  const cacheAttr = isCacheableImageSource(source)
    ? ` data-cache-src="${escapeAttr(source)}"`
    : "";
  const loading = options.eager ? "eager" : "lazy";
  const priority = options.eager ? ' fetchpriority="high"' : "";
  return `<img src="${escapeAttr(cached || source)}" alt="${escapeAttr(alt)}" referrerpolicy="no-referrer" loading="${loading}" decoding="async" width="64" height="64"${priority}${cacheAttr}>`;
}

function sanitizeExternalUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" ? url.href : "";
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
