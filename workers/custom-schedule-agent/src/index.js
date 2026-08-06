const MAX_INPUT_CHARS = 300;
const MAX_REQUEST_BYTES = 4_096;
const MAX_MODEL_RESPONSE_CHARS = 8_192;
const REQUEST_TIMEOUT_MS = 10_000;

function allowedOrigins(env) {
  return new Set(String(env.APP_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
}

export function requestOrigin(request, env) {
  const origin = String(request.headers.get("origin") || "").trim();
  return allowedOrigins(env).has(origin) ? origin : "";
}

function responseHeaders(origin) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("vary", "Origin");
  }
  return headers;
}

function json(origin, payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders(origin) });
}

function cleanText(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeSchedule(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value?.date || "")) ? String(value.date) : "";
  const time = /^\d{2}:\d{2}$/.test(String(value?.time || "")) ? String(value.time) : "";
  const homeTeam = cleanText(value?.homeTeam);
  const awayTeam = cleanText(value?.awayTeam);
  const orientation = ["explicit-home", "explicit-away", "agent"].includes(value?.orientation)
    ? value.orientation
    : "agent";
  const missing = [];
  if (!date) missing.push("日期");
  if (!time) missing.push("开赛时间");
  if (!homeTeam || !awayTeam) missing.push("双方球队");
  return { date, time, homeTeam, awayTeam, orientation, missing };
}

function parseJsonObject(value) {
  const text = String(value || "").trim().slice(0, MAX_MODEL_RESPONSE_CHARS);
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回可识别的赛程数据");
    return JSON.parse(match[0]);
  }
}

function clientKey(request) {
  return cleanText(request.headers.get("cf-connecting-ip"), 80) || "unknown-client";
}

async function callDeepSeek(input, referenceDate, locale, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CUSTOM_SCHEDULE_AI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: String(env.DEEPSEEK_MODEL || "deepseek-v4-pro"),
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是体育赛程信息提取器。只提取用户明确说明的一场比赛；绝不猜测或补全。只返回 JSON：{date:'YYYY-MM-DD或空字符串',time:'HH:mm或空字符串',homeTeam:'主队或空字符串',awayTeam:'客队或空字符串',orientation:'explicit-home|explicit-away|agent'}。用户说主场时该球队为 homeTeam；说客场时该球队为 awayTeam。"
          },
          {
            role: "user",
            content: JSON.stringify({ input, referenceDate, locale })
          }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return normalizeSchedule(parseJsonObject(content));
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const origin = requestOrigin(request, env);
    if (!origin) return json("", { error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/parse") return json(origin, { error: "not_found" }, 404);
    if (!String(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return json(origin, { error: "content_type_required" }, 415);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return json(origin, { error: "request_too_large" }, 413);

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_REQUEST_BYTES) return json(origin, { error: "request_too_large" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json(origin, { error: "invalid_json" }, 400);
    }
    const input = cleanText(body?.input, MAX_INPUT_CHARS);
    if (!input) return json(origin, { error: "input_required" }, 400);
    if (!env.CUSTOM_SCHEDULE_AI_API_KEY) return json(origin, { error: "service_not_configured" }, 503);

    const rate = await env.CUSTOM_SCHEDULE_LIMITER.limit({ key: clientKey(request) });
    if (!rate.success) return json(origin, { error: "rate_limited" }, 429);

    try {
      const schedule = await callDeepSeek(input, cleanText(body?.referenceDate, 64), cleanText(body?.locale, 20), env);
      return json(origin, { schedule });
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      return json(origin, { error: isTimeout ? "upstream_timeout" : "upstream_unavailable" }, 502);
    }
  }
};
