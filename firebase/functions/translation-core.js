const crypto = require("node:crypto");
const reference = require("./translation-reference.json");
const { normalizeArticleParagraphs } = require("./news-core");

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

function boundedText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function translationSourceHash(item) {
  const source = JSON.stringify({
    translationReference: reference,
    titleEn: boundedText(item?.titleEn, 240),
    summaryEn: boundedText(item?.summaryEn, 900),
    bodyEn: normalizeArticleParagraphs(item?.bodyEn)
  });
  return crypto.createHash("sha256").update(source).digest("hex");
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function normalizeTranslation(raw, sourceItem) {
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
    translationSourceHash: translationSourceHash(sourceItem)
  };
}

function reusableTranslation(previousItem, sourceItem) {
  if (!previousItem || previousItem.translationSourceHash !== translationSourceHash(sourceItem)) return null;
  try {
    return normalizeTranslation(previousItem, sourceItem);
  } catch {
    return null;
  }
}

function systemPrompt() {
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

function buildTranslationRequest(item, model = DEFAULT_MODEL) {
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `请将以下 MLB 新闻翻译为简体中文并输出 JSON：\n${JSON.stringify({
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

function parseTranslationResponse(payload, sourceItem) {
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("DeepSeek returned empty content");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
  return normalizeTranslation(parsed, sourceItem);
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
