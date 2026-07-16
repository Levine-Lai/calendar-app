(function initCalendarImageCache(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CalendarImageCache = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCalendarImageCache(root) {
  const prefix = "sports-fan-calendar:image-cache:v1";
  const indexKey = `${prefix}:index`;
  const maxEntries = 120;
  const maxBytes = 4 * 1024 * 1024;
  const memory = new Map();
  const pending = new Map();
  let index = loadIndex();

  function isCacheable(source) {
    return /^https?:\/\//i.test(source || "") && !source.includes("icon-fallback");
  }

  function get(source) {
    if (!isCacheable(source)) return "";
    if (memory.has(source)) return memory.get(source);
    const record = index.find((item) => item.url === source);
    if (!record) return "";
    try {
      const cached = root.localStorage.getItem(record.key);
      if (!cached) return "";
      memory.set(source, cached);
      record.time = Date.now();
      return cached;
    } catch {
      return "";
    }
  }

  function queue(source) {
    if (!isCacheable(source) || get(source)) return Promise.resolve();
    if (pending.has(source)) return pending.get(source);
    const task = cacheRemote(source).finally(() => pending.delete(source));
    pending.set(source, task);
    return task;
  }

  async function cacheRemote(source) {
    try {
      const response = await root.fetch(source, { cache: "force-cache", credentials: "omit", mode: "cors" });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > 220 * 1024) return;
      const dataUrl = await blobToDataUrl(blob);
      save(source, dataUrl);
      Array.from(root.document?.images || []).forEach((image) => {
        if (image.dataset.cacheSrc === source && !image.dataset.fallbackApplied) image.src = dataUrl;
      });
    } catch {
      // Providers that block CORS still work through the normal image element path.
    }
  }

  function save(source, dataUrl) {
    if (!dataUrl) return;
    const key = `${prefix}:${hash(source)}`;
    memory.set(source, dataUrl);
    index = index.filter((item) => item.url !== source);
    index.unshift({ url: source, key, size: dataUrl.length, time: Date.now() });
    try {
      root.localStorage.setItem(key, dataUrl);
      prune(false);
    } catch {
      root.localStorage.removeItem(key);
      index = index.filter((item) => item.url !== source);
      prune(true);
    }
  }

  function prune(force) {
    let total = index.reduce((sum, item) => sum + Number(item.size || 0), 0);
    index.sort((left, right) => Number(right.time || 0) - Number(left.time || 0));
    while (index.length > maxEntries || total > maxBytes || (force && index.length > 30)) {
      const removed = index.pop();
      if (!removed) break;
      total -= Number(removed.size || 0);
      memory.delete(removed.url);
      try { root.localStorage.removeItem(removed.key); } catch { /* best effort */ }
    }
    try { root.localStorage.setItem(indexKey, JSON.stringify(index)); } catch { /* best effort */ }
  }

  function loadIndex() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(indexKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.url && item?.key) : [];
    } catch {
      return [];
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new root.FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function hash(value) {
    let result = 0;
    for (let position = 0; position < value.length; position += 1) {
      result = (result << 5) - result + value.charCodeAt(position);
      result |= 0;
    }
    return Math.abs(result).toString(36);
  }

  return { get, isCacheable, queue };
}));
