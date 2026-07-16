(function initCalendarStorage(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CalendarStorage = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCalendarStorage(root) {
  const databaseName = "sports-fan-calendar";
  const databaseVersion = 1;
  const schemaVersion = 6;
  const legacyKey = "sports-fan-calendar:v5";
  const fallbackKey = "sports-fan-calendar:v6:fallback";
  const fallbackBackupKey = `${fallbackKey}:backup`;
  const maxFallbackCharacters = 1_250_000;
  let writeQueue = Promise.resolve();
  let recoveryMessage = "";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = root.indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
        if (!db.objectStoreNames.contains("backups")) db.createObjectStore("backups", { autoIncrement: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    });
  }

  async function loadFromDatabase(db) {
    const transaction = db.transaction(["meta", "events"], "readonly");
    const metaPromise = requestValue(transaction.objectStore("meta").get("current"));
    const eventsPromise = requestValue(transaction.objectStore("events").getAll());
    const [meta, events] = await Promise.all([metaPromise, eventsPromise, transactionDone(transaction)]);
    if (!meta) return null;
    return normalizeSnapshot({ ...meta, events });
  }

  function parseStoredValue(key) {
    const raw = root.localStorage?.getItem(key);
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  }

  async function load() {
    try {
      const db = await openDatabase();
      try {
        const stored = await loadFromDatabase(db);
        if (stored) return stored;
      } finally {
        db.close();
      }
    } catch {
      recoveryMessage = "";
    }

    for (const key of [fallbackKey, fallbackBackupKey, legacyKey]) {
      try {
        const stored = parseStoredValue(key);
        if (!stored) continue;
        recoveryMessage = key === legacyKey ? "已迁移旧版本本地赛程。" : "已从本地备份恢复赛程。";
        try {
          await save(stored);
        } catch {
          // The parsed fallback remains usable when IndexedDB is unavailable.
        }
        return stored;
      } catch {
        recoveryMessage = "部分旧数据无法读取，已跳过损坏记录。";
      }
    }
    return emptySnapshot();
  }

  function save(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    writeQueue = writeQueue.catch(() => {}).then(() => saveNow(normalized));
    return writeQueue;
  }

  async function saveNow(snapshot) {
    let primarySaved = false;
    try {
      const db = await openDatabase();
      try {
        const previous = await loadFromDatabase(db);
        const transaction = db.transaction(["meta", "events", "backups"], "readwrite");
        const metaStore = transaction.objectStore("meta");
        const eventsStore = transaction.objectStore("events");
        const backupsStore = transaction.objectStore("backups");
        if (previous?.events?.length) backupsStore.add({ savedAt: new Date().toISOString(), snapshot: previous });
        eventsStore.clear();
        snapshot.events.forEach((event) => eventsStore.put(event));
        const { events, ...meta } = snapshot;
        metaStore.put({ ...meta, schemaVersion, savedAt: new Date().toISOString() }, "current");
        await transactionDone(transaction);
        await pruneBackups(db);
        primarySaved = true;
      } finally {
        db.close();
      }
    } catch {
      primarySaved = false;
    }
    const fallbackSaved = saveFallback(snapshot);
    if (!primarySaved && !fallbackSaved) throw new Error("本地数据暂时无法保存");
  }

  function saveFallback(snapshot) {
    if (!root.localStorage) return false;
    const next = JSON.stringify(snapshot);
    if (next.length > maxFallbackCharacters) return false;
    try {
      const current = root.localStorage.getItem(fallbackKey);
      if (current && current !== next && current.length + next.length <= maxFallbackCharacters) {
        root.localStorage.setItem(fallbackBackupKey, current);
      } else {
        root.localStorage.removeItem(fallbackBackupKey);
      }
      root.localStorage.setItem(fallbackKey, next);
      return true;
    } catch {
      try {
        root.localStorage.removeItem(fallbackBackupKey);
        root.localStorage.setItem(fallbackKey, next);
        return true;
      } catch {
        return false;
      }
    }
  }

  async function pruneBackups(db) {
    const transaction = db.transaction("backups", "readwrite");
    const store = transaction.objectStore("backups");
    const keys = await requestValue(store.getAllKeys());
    keys.slice(0, Math.max(0, keys.length - 2)).forEach((key) => store.delete(key));
    await transactionDone(transaction);
  }

  function normalizeSnapshot(value = {}) {
    return {
      schemaVersion,
      selectedLeague: value.selectedLeague || "nba",
      selectedTeamsByLeague: value.selectedTeamsByLeague || {},
      events: Array.isArray(value.events) ? value.events.filter((event) => event?.id && event?.start) : [],
      followedTeams: Array.isArray(value.followedTeams) ? value.followedTeams : [],
      filters: value.filters || {},
      refreshMeta: value.refreshMeta || {}
    };
  }

  function emptySnapshot() {
    return normalizeSnapshot();
  }

  function getRecoveryMessage() {
    return recoveryMessage;
  }

  return { emptySnapshot, getRecoveryMessage, load, normalizeSnapshot, save };
}));
