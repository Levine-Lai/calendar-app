(function initTeamNews(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TeamNews = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTeamNews() {
  const maxResponseBytes = 1024 * 1024;
  const maxItems = 30;
  const defaultTeamId = "toronto-blue-jays";
  const teamDefinitions = Object.freeze({
    "toronto-blue-jays": Object.freeze({
      teamName: "多伦多蓝鸟",
      source: "MLB.com",
      articleHosts: Object.freeze(["mlb.com"]),
      imageHosts: Object.freeze(["mlbstatic.com", "mlb.com"])
    }),
    arsenal: Object.freeze({
      teamName: "阿森纳",
      source: "Arsenal.com",
      articleHosts: Object.freeze(["arsenal.com", "theguardian.com", "arseblog.com", "arseblog.news"]),
      imageHosts: Object.freeze(["assets.arsenal.com", "arsenal.com", "guim.co.uk"])
    })
  });

  function normalizeHttpsUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeMlbUrl(value) {
    return normalizeNewsUrl(value, "toronto-blue-jays");
  }

  function normalizeMlbImageUrl(value) {
    return normalizeNewsImageUrl(value, "toronto-blue-jays");
  }

  function normalizeTeamId(value) {
    const teamId = boundedText(value, 80).toLowerCase();
    return teamDefinitions[teamId] ? teamId : defaultTeamId;
  }

  function hostMatches(hostname, allowedHost) {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
  }

  function normalizeNewsUrl(value, teamId = defaultTeamId) {
    const normalized = normalizeHttpsUrl(value);
    if (!normalized) return "";
    const hostname = new URL(normalized).hostname.toLowerCase();
    const definition = teamDefinitions[normalizeTeamId(teamId)];
    return definition.articleHosts.some((host) => hostMatches(hostname, host)) ? normalized : "";
  }

  function normalizeNewsImageUrl(value, teamId = defaultTeamId) {
    const normalized = normalizeHttpsUrl(value);
    if (!normalized) return "";
    const hostname = new URL(normalized).hostname.toLowerCase();
    const normalizedTeamId = normalizeTeamId(teamId);
    const definition = teamDefinitions[normalizedTeamId];
    if (!definition.imageHosts.some((host) => hostMatches(hostname, host))) return "";
    const url = new URL(normalized);
    if (normalizedTeamId === "toronto-blue-jays") {
      url.pathname = url.pathname.replace(/\/t_w\d{2,4}\//i, "/t_w640/");
    }
    return url.href;
  }

  function boundedText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function normalizeDate(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
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

  function normalizeNewsItem(item, options = {}) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const teamId = normalizeTeamId(item.teamId || options.teamId);
    const definition = teamDefinitions[teamId];
    const id = boundedText(item.id, 160);
    const url = normalizeNewsUrl(item.url, teamId);
    const titleEn = boundedText(item.titleEn, 240);
    const publishedAt = normalizeDate(item.publishedAt);
    if (!id || !url || !titleEn || !publishedAt) return null;
    return {
      id,
      teamId,
      teamName: boundedText(item.teamName, 80) || definition.teamName,
      titleEn,
      summaryEn: boundedText(item.summaryEn, 900),
      bodyEn: normalizeArticleParagraphs(item.bodyEn),
      titleZh: boundedText(item.titleZh, 240),
      summaryZh: boundedText(item.summaryZh, 900),
      bodyZh: normalizeArticleParagraphs(item.bodyZh),
      imageUrl: normalizeNewsImageUrl(item.imageUrl, teamId),
      translationSourceHash: boundedText(item.translationSourceHash, 64),
      translationModel: boundedText(item.translationModel, 80),
      translatedAt: normalizeDate(item.translatedAt),
      author: boundedText(item.author, 80),
      publishedAt,
      url,
      source: boundedText(item.source, 80) || definition.source
    };
  }

  function normalizeNewsPayload(payload, options = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("新闻数据格式不正确");
    }
    const teamId = normalizeTeamId(payload.teamId || options.teamId);
    const definition = teamDefinitions[teamId];
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const seen = new Set();
    const items = [];
    rawItems.forEach((item) => {
      const normalized = normalizeNewsItem(item, { teamId });
      if (!normalized || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      items.push(normalized);
    });
    items.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
    return {
      teamId,
      teamName: boundedText(payload.teamName, 80) || definition.teamName,
      updatedAt: normalizeDate(payload.updatedAt) || new Date().toISOString(),
      items: items.slice(0, maxItems)
    };
  }

  function localizeNewsItem(item, language = "zh") {
    const normalizedLanguage = language === "en" ? "en" : "zh";
    if (!item || typeof item !== "object") {
      return { language: normalizedLanguage, title: "", summary: "", body: [] };
    }
    if (normalizedLanguage === "en") {
      return {
        language: "en",
        title: boundedText(item.titleEn, 240),
        summary: boundedText(item.summaryEn, 900),
        body: normalizeArticleParagraphs(item.bodyEn)
      };
    }
    const bodyZh = normalizeArticleParagraphs(item.bodyZh);
    return {
      language: "zh",
      title: boundedText(item.titleZh, 240) || boundedText(item.titleEn, 240),
      summary: boundedText(item.summaryZh, 900) || boundedText(item.summaryEn, 900),
      body: bodyZh.length ? bodyZh : normalizeArticleParagraphs(item.bodyEn)
    };
  }

  function payloadFreshness(payload) {
    const normalized = normalizeNewsPayload(payload);
    const latestPublishedAt = normalized.items.length ? Date.parse(normalized.items[0].publishedAt) : 0;
    return [latestPublishedAt || 0, Date.parse(normalized.updatedAt) || 0];
  }

  function selectFreshestNewsPayload(payloads) {
    const normalized = (Array.isArray(payloads) ? payloads : [])
      .map((payload) => {
        try {
          return normalizeNewsPayload(payload);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    normalized.sort((left, right) => {
      const leftFreshness = payloadFreshness(left);
      const rightFreshness = payloadFreshness(right);
      return rightFreshness[0] - leftFreshness[0] || rightFreshness[1] - leftFreshness[1];
    });
    return normalized[0] || null;
  }

  function mergeNewsPayloads(primaryPayload, supplementPayloads = []) {
    const primary = normalizeNewsPayload(primaryPayload);
    const supplements = (Array.isArray(supplementPayloads) ? supplementPayloads : [])
      .map((payload) => {
        try {
          return normalizeNewsPayload(payload);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const supplementItems = new Map();
    supplements.forEach((payload) => payload.items.forEach((item) => {
      const existing = supplementItems.get(item.id);
      if (!existing || (!existing.bodyEn.length && item.bodyEn.length) || (!existing.titleZh && item.titleZh)) {
        supplementItems.set(item.id, item);
      }
    }));
    return {
      ...primary,
      items: primary.items.map((item) => {
        const supplement = supplementItems.get(item.id);
        if (!supplement) return item;
        return {
          ...item,
          summaryEn: item.summaryEn || supplement.summaryEn,
          bodyEn: item.bodyEn.length ? item.bodyEn : supplement.bodyEn,
          titleZh: item.titleZh || supplement.titleZh,
          summaryZh: item.summaryZh || supplement.summaryZh,
          bodyZh: item.bodyZh.length ? item.bodyZh : supplement.bodyZh,
          imageUrl: item.imageUrl || supplement.imageUrl,
          translationSourceHash: item.translationSourceHash || supplement.translationSourceHash,
          translationModel: item.translationModel || supplement.translationModel,
          translatedAt: item.translatedAt || supplement.translatedAt,
          author: item.author || supplement.author
        };
      })
    };
  }

  function collectFastNewsResults(attempts, graceMs = 1200) {
    const sources = Array.isArray(attempts) ? attempts : [];
    if (!sources.length) return Promise.reject(new Error("没有可用的新闻来源"));
    const boundedGrace = Math.max(0, Math.min(5000, Number(graceMs) || 0));
    return new Promise((resolve, reject) => {
      const successes = [];
      let remaining = sources.length;
      let timer = null;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (successes.length) resolve(successes.sort((left, right) => left.index - right.index));
        else reject(new Error("所有新闻来源均不可用"));
      };
      sources.forEach((attempt, index) => {
        Promise.resolve(attempt).then((value) => {
          if (finished) return;
          successes.push({ index, value });
          if (!timer) timer = setTimeout(finish, boundedGrace);
        }).catch(() => {
          // Another endpoint or the bundled cache may still succeed.
        }).finally(() => {
          remaining -= 1;
          if (remaining === 0) finish();
        });
      });
    });
  }

  async function fetchNews(endpoint, options = {}) {
    const safeEndpoint = normalizeHttpsUrl(endpoint);
    if (!safeEndpoint) throw new Error("新闻服务尚未部署");
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("当前环境不支持联网读取新闻");

    const url = new URL(safeEndpoint);
    const teamId = normalizeTeamId(options.teamId);
    url.searchParams.set("team", teamId);
    url.searchParams.set("limit", "30");
    url.searchParams.set("_", String(Date.now()));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 10000);
    try {
      const response = await fetchImpl(url.href, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`新闻服务返回 ${response.status}`);
      const declaredLength = Number(response.headers?.get?.("content-length") || 0);
      if (declaredLength > maxResponseBytes) throw new Error("新闻数据过大");
      const text = await response.text();
      if (text.length > maxResponseBytes) throw new Error("新闻数据过大");
      return normalizeNewsPayload(JSON.parse(text), { teamId });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("新闻同步超时");
      if (error instanceof SyntaxError) throw new Error("新闻数据无法解析");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    normalizeHttpsUrl,
    normalizeMlbUrl,
    normalizeMlbImageUrl,
    normalizeNewsUrl,
    normalizeNewsImageUrl,
    normalizeTeamId,
    normalizeArticleParagraphs,
    normalizeNewsItem,
    normalizeNewsPayload,
    localizeNewsItem,
    selectFreshestNewsPayload,
    mergeNewsPayloads,
    collectFastNewsResults,
    fetchNews
  };
});
