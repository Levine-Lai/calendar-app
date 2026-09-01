const test = require("node:test");
const assert = require("node:assert/strict");

const update = require("../public/app-update.js");

test("newer versions are compared by Android versionCode", () => {
  const manifest = update.normalizeManifest({ versionCode: 22, versionName: "2.2.0" });
  assert.equal(update.isNewerVersion(21, manifest), true);
  assert.equal(update.isNewerVersion(22, manifest), false);
});

test("manifest accepts only HTTPS download links and bounded notes", () => {
  const manifest = update.normalizeManifest({
    versionCode: 22,
    versionName: "2.2.0",
    apkUrl: "http://example.com/app.apk",
    notes: ["修复一", "", "修复二"]
  });
  assert.equal(manifest.apkUrl, "");
  assert.equal(manifest.apkDirectUrl, "");
  assert.deepEqual(manifest.notes, ["修复一", "修复二"]);
});

test("GitHub APK assets remain direct download links", () => {
  assert.equal(
    update.toDownloadUrl("https://github.com/Levine-Lai/calendar-app/releases/download/v2.3.5/calendar.apk"),
    "https://github.com/Levine-Lai/calendar-app/releases/download/v2.3.5/calendar.apk"
  );
  assert.equal(update.toDownloadUrl("https://downloads.example.com/calendar.apk"), "https://downloads.example.com/calendar.apk");
  assert.equal(update.toDownloadUrl("http://example.com/calendar.apk"), "");
});

test("manifest prefers a separate direct APK while retaining an old-client fallback page", () => {
  const manifest = update.normalizeManifest({
    versionCode: 47,
    versionName: "2.3.5",
    apkUrl: "https://github.com/Levine-Lai/calendar-app/releases/expanded_assets/v2.3.5",
    apkDirectUrl: "https://github.com/Levine-Lai/calendar-app/releases/download/v2.3.5/calendar.apk"
  });
  assert.match(manifest.apkUrl, /expanded_assets/);
  assert.match(manifest.apkDirectUrl, /releases\/download/);
});

test("update service falls back when one endpoint fails", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("first.example")) return { ok: false, status: 503, headers: new Map(), text: async () => "" };
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => JSON.stringify({ versionCode: 22, versionName: "2.2.0" })
    };
  };
  const manifest = await update.fetchLatestManifest([
    "https://first.example/version.json",
    "https://second.example/version.json"
  ], { fetchImpl, timeoutMs: 100 });
  assert.equal(manifest.versionCode, 22);
});

test("invalid manifests are rejected", () => {
  assert.throws(() => update.normalizeManifest({ versionCode: 0, versionName: "" }), /版本号无效/);
  assert.throws(() => update.normalizeManifest([]), /格式不正确/);
});
