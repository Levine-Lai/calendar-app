const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_MODEL,
  translationSourceHash,
  normalizeTranslation,
  reusableTranslation,
  buildTranslationRequest,
  parseTranslationResponse
} = require("../translation-core");

const article = {
  titleEn: "Blue Jays add a reliever",
  summaryEn: "Toronto strengthened its bullpen.",
  bodyEn: ["The Blue Jays added a reliever.", "He will join the bullpen Friday."]
};

test("translation request includes stable MLB reference and JSON output", () => {
  const request = buildTranslationRequest(article);
  assert.equal(DEFAULT_MODEL, "gemini-2.5-flash-lite");
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(request.generationConfig.responseSchema.required, ["titleZh", "summaryZh", "bodyZh"]);
  assert.match(request.systemInstruction.parts[0].text, /多伦多蓝鸟/);
  assert.match(request.systemInstruction.parts[0].text, /牛棚/);
  assert.match(request.contents[0].parts[0].text, /Blue Jays add a reliever/);
});

test("Arsenal translation request uses football-specific context", () => {
  const request = buildTranslationRequest({
    titleEn: "Arsenal update",
    summaryEn: "The club shared an update.",
    bodyEn: ["The full update is available."]
  }, "gemini-2.5-flash-lite", { teamId: "arsenal" });
  assert.match(request.systemInstruction.parts[0].text, /阿森纳足球俱乐部/);
  assert.doesNotMatch(request.systemInstruction.parts[0].text, /MLB 中文体育编辑/);
  assert.match(request.contents[0].parts[0].text, /阿森纳足球/);
});

test("translation output requires Chinese title and matching paragraphs", () => {
  const translation = normalizeTranslation({
    titleZh: "蓝鸟补强牛棚",
    summaryZh: "多伦多新增一名后援投手。",
    bodyZh: ["蓝鸟新增一名后援投手。", "他将在周五加入牛棚。"]
  }, article);
  assert.equal(translation.titleZh, "蓝鸟补强牛棚");
  assert.equal(translation.bodyZh.length, article.bodyEn.length);
  assert.equal(translation.translationSourceHash, translationSourceHash(article));
  assert.throws(() => normalizeTranslation({
    titleZh: "中文标题",
    bodyZh: ["只有一段。"]
  }, article), /paragraph count mismatch/);
});

test("translation response parses JSON and rejects empty model content", () => {
  const parsed = parseTranslationResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      titleZh: "蓝鸟补强牛棚",
      summaryZh: "多伦多新增一名后援投手。",
      bodyZh: ["第一段。", "第二段。"]
    }) }] } }]
  }, article);
  assert.equal(parsed.titleZh, "蓝鸟补强牛棚");
  assert.throws(() => parseTranslationResponse({ candidates: [] }, article), /empty content/);
});

test("existing translation is reused only when the English source is unchanged", () => {
  const previous = {
    ...article,
    titleZh: "蓝鸟补强牛棚",
    summaryZh: "多伦多新增一名后援投手。",
    bodyZh: ["第一段。", "第二段。"],
    translationSourceHash: translationSourceHash(article)
  };
  assert.equal(reusableTranslation(previous, article).titleZh, "蓝鸟补强牛棚");
  assert.equal(reusableTranslation(previous, { ...article, summaryEn: "Changed." }), null);
});
