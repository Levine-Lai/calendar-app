const test = require("node:test");
const assert = require("node:assert/strict");

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class QuotaStorage extends MemoryStorage {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  setItem(key, value) {
    const next = String(value);
    const used = [...this.values.entries()]
      .filter(([storedKey]) => storedKey !== key)
      .reduce((total, [, storedValue]) => total + storedValue.length, 0);
    if (used + next.length > this.limit) {
      const error = new Error("Setting the value exceeded the quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    super.setItem(key, next);
  }
}

test("storage preserves a damaged primary record and restores its backup", async () => {
  globalThis.indexedDB = undefined;
  globalThis.localStorage = new MemoryStorage({
    "sports-fan-calendar:v6:fallback": "{damaged",
    "sports-fan-calendar:v6:fallback:backup": JSON.stringify({
      selectedLeague: "mlb",
      events: [{ id: "game-1", start: "2026-07-12T10:00:00Z" }]
    })
  });
  const CalendarStorage = require("../public/calendar-storage.js");
  const restored = await CalendarStorage.load();

  assert.equal(restored.selectedLeague, "mlb");
  assert.equal(restored.events.length, 1);
  assert.equal(globalThis.localStorage.getItem("sports-fan-calendar:v6:fallback:backup"), "{damaged");
});

test("oversized fallback failures do not expose browser quota details", async () => {
  globalThis.indexedDB = undefined;
  globalThis.localStorage = new QuotaStorage(200);
  const CalendarStorage = require("../public/calendar-storage.js");

  await assert.rejects(
    CalendarStorage.save({
      events: [{ id: "large-game", start: "2026-07-12T10:00:00Z", title: "x".repeat(1000) }]
    }),
    (error) => error.message === "本地数据暂时无法保存" && !error.message.includes("quota")
  );
});
