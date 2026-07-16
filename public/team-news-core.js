(function initTeamNews(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TeamNews = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTeamNews() {
  const maxResponseBytes = 256 * 1024;
  const maxItems = 30;

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
    const normalized = normalizeHttpsUrl(value);
    if (!normalized) return "";
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname === "mlb.com" || hostname.endsWith(".mlb.com") ? normalized : "";
  }

  function boundedText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function normalizeDate(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  }

  function normalizeNewsItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = boundedText(item.id, 160);
    const url = normalizeMlbUrl(item.url);
    const titleEn = boundedText(item.titleEn, 240);
    const publishedAt = normalizeDate(item.publishedAt);
    if (!id || !url || !titleEn || !publishedAt) return null;
    return {
      id,
      teamId: "toronto-blue-jays",
      teamName: "多伦多蓝鸟",
      titleEn,
      summaryEn: boundedText(item.summaryEn, 900),
      author: boundedText(item.author, 80),
      publishedAt,
      url,
      source: "MLB.com"
    };
  }

  function normalizeNewsPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("新闻数据格式不正确");
    }
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const seen = new Set();
    const items = [];
    rawItems.forEach((item) => {
      const normalized = normalizeNewsItem(item);
      if (!normalized || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      items.push(normalized);
    });
    items.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
    return {
      teamId: "toronto-blue-jays",
      teamName: "多伦多蓝鸟",
      updatedAt: normalizeDate(payload.updatedAt) || new Date().toISOString(),
      items: items.slice(0, maxItems)
    };
  }

  async function fetchNews(endpoint, options = {}) {
    const safeEndpoint = normalizeHttpsUrl(endpoint);
    if (!safeEndpoint) throw new Error("新闻服务尚未部署");
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("当前环境不支持联网读取新闻");

    const url = new URL(safeEndpoint);
    url.searchParams.set("team", "toronto-blue-jays");
    url.searchParams.set("limit", "30");
    url.searchParams.set("_", String(Math.floor(Date.now() / 300000)));
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
      return normalizeNewsPayload(JSON.parse(text));
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
    normalizeNewsItem,
    normalizeNewsPayload,
    fetchNews
  };
});
