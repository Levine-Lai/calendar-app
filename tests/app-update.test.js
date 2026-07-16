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
  assert.deepEqual(manifest.notes, ["修复一", "修复二"]);
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
