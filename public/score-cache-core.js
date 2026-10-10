(function initScoreCacheCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ScoreCacheCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createScoreCacheCore() {
  const ESPN_LEAGUES = [
    { id: "nba", sport: "basketball", league: "nba" },
    { id: "nfl", sport: "football", league: "nfl" },
    { id: "epl", sport: "soccer", league: "eng.1" },
    { id: "wsl", sport: "soccer", league: "eng.w.1" },
    { id: "laliga", sport: "soccer", league: "esp.1" },
    { id: "seriea", sport: "soccer", league: "ita.1" },
    { id: "bundesliga", sport: "soccer", league: "ger.1" },
    { id: "ligue1", sport: "soccer", league: "fra.1" },
    { id: "ucl", sport: "soccer", league: "uefa.champions" },
    { id: "worldcup", sport: "soccer", league: "fifa.world" },
    { id: "championship", sport: "soccer", league: "eng.2" },
    { id: "csl", sport: "soccer", league: "chn.1" },
    { id: "mlb", sport: "baseball", league: "mlb" }
  ];

  function clean(value, maxLength = 300) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function score(value) {
    if (value == null || value === "") return "";
    if (typeof value === "object") return clean(value.displayValue ?? value.value ?? value.score ?? "", 20);
    return clean(value, 20);
  }

  function firstCompetition(event) {
    return Array.isArray(event?.competitions) ? event.competitions[0] : null;
  }

  function competitor(competition, side) {
    return (competition?.competitors || []).find((item) => item?.homeAway === side) || null;
  }

  function normalizeEvent(event, config) {
    const competition = firstCompetition(event);
    const away = competitor(competition, "away");
    const home = competitor(competition, "home");
    const type = competition?.status?.type || event?.status?.type || {};
    const id = clean(event?.id || competition?.id, 80);
    const start = clean(event?.date || competition?.date || competition?.startDate, 60);
    if (!id || !start || !config?.id) return null;
    return {
      id: `${config.id}-${id}`,
      sourceId: id,
      league: config.id,
      sport: config.sport,
      espnLeague: config.league,
      start,
      status: clean(type.shortDetail || type.detail || type.description, 120),
      statusState: clean(type.state, 20),
      completed: Boolean(type.completed),
      awayScore: score(away?.score),
      homeScore: score(home?.score),
      awayTeam: clean(away?.team?.displayName || away?.team?.name, 160),
      homeTeam: clean(home?.team?.displayName || home?.team?.name, 160),
      awayLogo: clean(away?.team?.logo || away?.team?.logos?.[0]?.href, 500),
      homeLogo: clean(home?.team?.logo || home?.team?.logos?.[0]?.href, 500)
    };
  }

  function buildPayload(eventsByLeague, updatedAt = new Date()) {
    const items = ESPN_LEAGUES.flatMap((config) => (
      (eventsByLeague?.[config.id] || []).map((event) => normalizeEvent(event, config)).filter(Boolean)
    ));
    const unique = new Map();
    items.forEach((item) => unique.set(`${item.league}:${item.sourceId}`, item));
    return {
      updatedAt: new Date(updatedAt).toISOString(),
      items: [...unique.values()].sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    };
  }

  function selectItems(payload, leagueId, startValue, endValue, maxAgeMs = 2 * 60 * 60 * 1000, now = Date.now()) {
    const updatedAt = Date.parse(payload?.updatedAt || "");
    if (!Number.isFinite(updatedAt) || now - updatedAt > maxAgeMs || updatedAt - now > 5 * 60 * 1000) return [];
    const first = new Date(startValue).getTime();
    const last = new Date(endValue).getTime();
    if (!Number.isFinite(first) || !Number.isFinite(last)) return [];
    return (Array.isArray(payload?.items) ? payload.items : []).filter((item) => {
      const time = Date.parse(item?.start || "");
      return item?.league === leagueId && Number.isFinite(time) && time >= first && time < last;
    });
  }

  function sameItems(left, right) {
    return JSON.stringify(left?.items || []) === JSON.stringify(right?.items || []);
  }

  return { ESPN_LEAGUES, buildPayload, normalizeEvent, sameItems, selectItems };
}));
