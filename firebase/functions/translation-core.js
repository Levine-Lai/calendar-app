const crypto = require("node:crypto");
const reference = require("./translation-reference.json");
const { normalizeArticleParagraphs } = require("./news-core");

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

function boundedText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function translationSourceHash(item, options = {}) {
  const source = JSON.stringify({
    translationReference: reference,
    ...(options.teamId === "arsenal" ? { translationContext: "arsenal-v1" } : {}),
    titleEn: boundedText(item?.titleEn, 240),
    summaryEn: boundedText(item?.summaryEn, 900),
    bodyEn: normalizeArticleParagraphs(item?.bodyEn)
  });
  return crypto.createHash("sha256").update(source).digest("hex");
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function normalizeTranslation(raw, sourceItem, options = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("DeepSeek did not return a JSON object");
  }
  const titleZh = boundedText(raw.titleZh, 240);
  const summaryZh = boundedText(raw.summaryZh, 900);
  const bodyEn = normalizeArticleParagraphs(sourceItem?.bodyEn);
  const bodyZh = normalizeArticleParagraphs(raw.bodyZh);
  if (!titleZh || !containsChinese(titleZh)) throw new Error("Chinese title is missing");
  if (bodyEn.length && bodyZh.length !== bodyEn.length) {
    throw new Error(`Chinese body paragraph count mismatch: expected ${bodyEn.length}, received ${bodyZh.length}`);
  }
  return {
    titleZh,
    summaryZh,
    bodyZh,
    translationSourceHash: translationSourceHash(sourceItem, options)
  };
}

function reusableTranslation(previousItem, sourceItem, options = {}) {
  if (!previousItem || previousItem.translationSourceHash !== translationSourceHash(sourceItem, options)) return null;
  try {
    return normalizeTranslation(previousItem, sourceItem, options);
  } catch {
    return null;
  }
}

function systemPrompt(options = {}) {
  if (options.teamId === "arsenal") {
    return [
      "你是专业的简体中文足球新闻编辑，负责翻译阿森纳足球俱乐部相关新闻。",
      "只翻译来源提供的事实，不补充传闻、不改写比分、不猜测转会结论。",
      "Arsenal 统一翻译为阿森纳；Premier League 统一翻译为英超；人名优先使用常用中文译名，无法确认时保留英文。",
      "只输出 titleZh、summaryZh、bodyZh 三个字段的合法 JSON。summaryZh 应适合手机通知且不超过 60 个汉字；bodyZh 必须是与输入 bodyEn 数量相同的字符串数组。",
      "示例 JSON：{\"titleZh\":\"阿森纳发布球队最新消息\",\"summaryZh\":\"俱乐部公布了最新备战情况。\",\"bodyZh\":[\"第一段译文。\"]}"
    ].join("\n");
  }
  return [
    "你是专业的 MLB 中文体育编辑，负责翻译多伦多蓝鸟相关新闻。",
    reference.teamContext,
    "必须严格使用以下参考资料，并输出合法 JSON。",
    `球队名称：${JSON.stringify(reference.teams)}`,
    `棒球术语：${JSON.stringify(reference.terms)}`,
    `翻译规则：${reference.styleRules.join("；")}`,
    "只输出 titleZh、summaryZh、bodyZh 三个字段。summaryZh 应适合手机通知且不超过 60 个汉字；bodyZh 必须是与输入 bodyEn 数量相同的字符串数组。",
    "示例 JSON：{\"titleZh\":\"蓝鸟补强牛棚\",\"summaryZh\":\"球队签下一名后援投手。\",\"bodyZh\":[\"第一段译文。\"]}"
  ].join("\n");
}

function buildTranslationRequest(item, model = DEFAULT_MODEL, options = {}) {
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt(options) },
      {
        role: "user",
        content: `请将以下${options.teamId === "arsenal" ? "阿森纳足球" : " MLB "}新闻翻译为简体中文并输出 JSON：\n${JSON.stringify({
          titleEn: boundedText(item?.titleEn, 240),
          summaryEn: boundedText(item?.summaryEn, 900),
          bodyEn: normalizeArticleParagraphs(item?.bodyEn)
        })}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 32768
  };
}

function parseTranslationResponse(payload, sourceItem, options = {}) {
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("DeepSeek returned empty content");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
  return normalizeTranslation(parsed, sourceItem, options);
}

module.exports = {
  DEEPSEEK_ENDPOINT,
  DEFAULT_MODEL,
  translationSourceHash,
  normalizeTranslation,
  reusableTranslation,
  buildTranslationRequest,
  parseTranslationResponse
};
