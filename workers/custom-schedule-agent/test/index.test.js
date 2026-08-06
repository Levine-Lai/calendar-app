import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSchedule, requestOrigin } from "../src/index.js";

test("only configured app origins receive CORS access", () => {
  const env = { APP_ORIGINS: "capacitor://localhost,https://levine-lai.github.io" };
  assert.equal(requestOrigin(new Request("https://worker.example/v1/parse", { headers: { origin: "capacitor://localhost" } }), env), "capacitor://localhost");
  assert.equal(requestOrigin(new Request("https://worker.example/v1/parse", { headers: { origin: "https://untrusted.example" } }), env), "");
});

test("model output is bounded and reports missing information", () => {
  const result = normalizeSchedule({
    date: "2026-08-26",
    time: "20:00",
    homeTeam: "阿森纳",
    awayTeam: "赫罗纳",
    orientation: "explicit-home"
  });
  assert.deepEqual(result.missing, []);
  assert.equal(result.homeTeam, "阿森纳");
  assert.deepEqual(normalizeSchedule({ date: "invalid", time: "8pm" }).missing, ["日期", "开赛时间", "双方球队"]);
});
