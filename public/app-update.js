(function initAppUpdate(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AppUpdate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAppUpdate() {
  const maxManifestBytes = 64 * 1024;

  function normalizeHttpsUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeManifest(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("版本信息格式不正确");
    }

    const versionCode = Number(payload.versionCode);
    const versionName = String(payload.versionName || "").trim().slice(0, 32);
    if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !versionName) {
      throw new Error("版本号无效");
    }

    const notes = Array.isArray(payload.notes)
      ? payload.notes
        .map((note) => String(note || "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 8)
      : [];

    return {
      versionCode,
      versionName,
      apkUrl: normalizeHttpsUrl(payload.apkUrl),
      notes,
      force: payload.force === true
    };
  }

  function isNewerVersion(currentVersionCode, manifest) {
    const current = Number(currentVersionCode);
    return Number.isSafeInteger(current) && manifest.versionCode > current;
  }

  async function requestManifest(endpoint, fetchImpl, timeoutMs) {
    const safeEndpoint = normalizeHttpsUrl(endpoint);
    if (!safeEndpoint) throw new Error("更新地址无效");

    const url = new URL(safeEndpoint);
    url.searchParams.set("_check", String(Math.floor(Date.now() / 60000)));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`版本服务返回 ${response.status}`);
      const length = Number(response.headers?.get?.("content-length") || 0);
      if (length > maxManifestBytes) throw new Error("版本信息过大");
      const text = await response.text();
      if (text.length > maxManifestBytes) throw new Error("版本信息过大");
      return normalizeManifest(JSON.parse(text));
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("检查更新超时");
      if (error instanceof SyntaxError) throw new Error("版本信息无法解析");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchLatestManifest(endpoints, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = Number(options.timeoutMs) || 8000;
    if (typeof fetchImpl !== "function") throw new Error("当前环境不支持联网检查");
    const urls = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
    if (!urls.length) throw new Error("尚未配置更新服务");

    let firstError = null;
    for (const endpoint of urls) {
      try {
        return await requestManifest(endpoint, fetchImpl, timeoutMs);
      } catch (error) {
        firstError ||= error;
      }
    }
    throw firstError || new Error("暂时无法连接更新服务");
  }

  return {
    normalizeHttpsUrl,
    normalizeManifest,
    isNewerVersion,
    fetchLatestManifest
  };
});
