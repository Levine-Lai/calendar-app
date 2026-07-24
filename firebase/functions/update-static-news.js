const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  TEAM_ID,
  TEAM_NAME,
  NEWS_TOPIC,
  RSS_URL,
  parseBlueJaysFeed,
  buildStaticNewsUpdate,
  normalizeArticleParagraphs,
  normalizeMlbImageUrl,
  normalizeMlbUrl,
  toMlbAmpUrl,
  extractMlbArticleParagraphs,
  extractMlbArticleImage
} = require("./news-core");
const {
  DEEPSEEK_ENDPOINT,
  DEFAULT_MODEL,
  reusableTranslation,
  buildTranslationRequest,
  parseTranslationResponse
} = require("./translation-core");

const root = path.resolve(__dirname, "..", "..");
const outputFile = path.join(root, "public", "news", "blue-jays.json");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchFeed() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml",
        "user-agent": "SportsCalendar/2.2.1 GitHub news updater"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`MLB RSS returned ${response.status}`);
    const xml = await response.text();
    if (xml.length > 1024 * 1024) throw new Error("MLB RSS response exceeded 1 MB");
    const items = parseBlueJaysFeed(xml);
    if (!items.length) throw new Error("MLB RSS did not contain valid Blue Jays news");
    return items;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticleContent(item) {
  const articleUrl = toMlbAmpUrl(item.url);
  if (!articleUrl) return { bodyEn: [], imageUrl: "" };
  const response = await fetchWithTimeout(articleUrl, {
    headers: {
      accept: "text/html, application/xhtml+xml",
      "user-agent": "SportsCalendar/2.2.3 GitHub news updater"
    },
    redirect: "follow"
  }, 15000);
  if (!response.ok) throw new Error(`MLB article returned ${response.status}`);
  if (!normalizeMlbUrl(response.url)) throw new Error("MLB article redirected outside mlb.com");
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) throw new Error("MLB article did not return HTML");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > 768 * 1024) throw new Error("MLB article response exceeded 768 KB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 768 * 1024) throw new Error("MLB article response exceeded 768 KB");
  const html = bytes.toString("utf8");
  const paragraphs = extractMlbArticleParagraphs(html);
  if (!paragraphs.length) throw new Error("MLB article did not contain readable paragraphs");
  return {
    bodyEn: paragraphs,
    imageUrl: extractMlbArticleImage(html)
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function enrichArticleBodies(items, previousPayload) {
  const previousItems = new Map(
    (Array.isArray(previousPayload?.items) ? previousPayload.items : [])
      .map((item) => [item?.id, item])
      .filter(([id]) => id)
  );
  return mapWithConcurrency(items, 4, async (item) => {
    const previous = previousItems.get(item.id);
    const previousBody = normalizeArticleParagraphs(previous?.bodyEn);
    const previousImage = normalizeMlbImageUrl(previous?.imageUrl);
    if (previousBody.length && previousImage) {
      return { ...item, bodyEn: previousBody, imageUrl: previousImage };
    }
    try {
      const content = await fetchArticleContent(item);
      process.stdout.write(`Fetched article content: ${item.titleEn}\n`);
      return {
        ...item,
        bodyEn: previousBody.length ? previousBody : content.bodyEn,
        imageUrl: previousImage || content.imageUrl
      };
    } catch (error) {
      process.stderr.write(`Article content skipped for ${item.titleEn}: ${error.message}\n`);
      return { ...item, bodyEn: previousBody, imageUrl: previousImage };
    }
  });
}

function deepSeekModel() {
  const configured = String(process.env.DEEPSEEK_MODEL || "").trim();
  return /^deepseek-[a-z0-9-]{1,64}$/i.test(configured) ? configured : DEFAULT_MODEL;
}

async function translateArticle(item, options = {}) {
  const apiKey = String(options.apiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  const fetchImpl = options.fetchImpl || fetch;
  const model = options.model || deepSeekModel();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(buildTranslationRequest(item, model))
      }, 120000, fetchImpl);
      if (!response.ok) {
        const details = (await response.text()).slice(0, 300);
        const error = new Error(`DeepSeek returned ${response.status}: ${details}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const translation = parseTranslationResponse(await response.json(), item);
      return {
        ...translation,
        translationModel: model,
        translatedAt: new Date().toISOString()
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || error.retryable === false) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }
  throw lastError || new Error("DeepSeek translation failed");
}

async function enrichTranslations(items, previousPayload, options = {}) {
  const previousItems = new Map(
    (Array.isArray(previousPayload?.items) ? previousPayload.items : [])
      .map((item) => [item?.id, item])
      .filter(([id]) => id)
  );
  const apiKey = String(options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "").trim();
  const translator = options.translator || (apiKey
    ? (item) => translateArticle(item, { apiKey, model: options.model, fetchImpl: options.fetchImpl })
    : null);
  let translatedCount = 0;
  let failedCount = 0;
  const enriched = await mapWithConcurrency(items, 2, async (item) => {
    const previous = previousItems.get(item.id);
    const reusable = reusableTranslation(previous, item);
    if (reusable) {
      return {
        ...item,
        ...reusable,
        translationModel: previous.translationModel || DEFAULT_MODEL,
        translatedAt: previous.translatedAt || ""
      };
    }
    if (!translator) return item;
    try {
      const translation = await translator(item);
      translatedCount += 1;
      process.stdout.write(`Translated article: ${item.titleEn}\n`);
      return { ...item, ...translation };
    } catch (error) {
      failedCount += 1;
      process.stderr.write(`Article translation skipped for ${item.titleEn}: ${error.message}\n`);
      return item;
    }
  });
  if (!translator) process.stdout.write("DeepSeek key is not configured; keeping English news.\n");
  if (translator) process.stdout.write(`DeepSeek translation result: ${translatedCount} translated, ${failedCount} failed.\n`);
  return enriched;
}

function readPreviousPayload() {
  if (!fs.existsSync(outputFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } catch {
    throw new Error("Existing Blue Jays news JSON is invalid");
  }
}

function writePayload(payload) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, outputFile);
}

async function sendNotifications(items) {
  if (!items.length) return { sentIds: [], failedIds: [] };
  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    process.stdout.write(`Queued ${items.length} notification(s); FCM secret is not configured yet.\n`);
    return { sentIds: [], failedIds: items.map((item) => item.id) };
  }

  const accessToken = await createGoogleAccessToken(serviceAccount);
  const endpoint = fcmEndpoint(serviceAccount);
  const selectedItems = items.slice(0, 5);
  const sentIds = [];
  const failedIds = items.slice(5).map((item) => item.id);
  for (const item of [...selectedItems].reverse()) {
    let delivered = false;
    let lastError = "unknown FCM error";
    for (let attempt = 0; attempt < 3 && !delivered; attempt += 1) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(buildFcmRequest(item))
        }, 15000);
        if (response.ok) {
          delivered = true;
          break;
        }
        const details = (await response.text()).slice(0, 500);
        lastError = `FCM returned ${response.status}: ${details}`;
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error.message || String(error);
      }
      if (attempt < 2) await wait(1000 * (2 ** attempt));
    }
    if (delivered) sentIds.push(item.id);
    else {
      failedIds.push(item.id);
      reportWorkflowWarning("FCM notification queued for retry", `${item.id}: ${lastError}`);
    }
  }
  process.stdout.write(`FCM delivery result for ${TEAM_NAME}: ${sentIds.length} sent, ${failedIds.length} queued.\n`);
  return { sentIds, failedIds };
}

function readServiceAccount() {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) return null;
  return parseServiceAccount(rawCredentials);
}

function parseServiceAccount(rawCredentials) {
  let candidate = String(rawCredentials || "").trim();
  let serviceAccount = null;

  for (let attempt = 0; attempt < 3 && candidate; attempt += 1) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        candidate = parsed.trim();
        continue;
      }
      serviceAccount = parsed;
      break;
    } catch {
      if (attempt > 0 || !/^[A-Za-z0-9+/=_-]+$/.test(candidate)) break;
      try {
        candidate = Buffer.from(candidate, "base64").toString("utf8").trim();
      } catch {
        break;
      }
    }
  }

  if (!serviceAccount || typeof serviceAccount !== "object" || Array.isArray(serviceAccount)) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid service account JSON or Base64 JSON");
  }
  if (serviceAccount.project_info && serviceAccount.client) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON contains google-services.json; replace it with a Firebase Admin service-account JSON");
  }

  const requiredFields = ["project_id", "client_email", "private_key"];
  const missingFields = requiredFields.filter((field) => !serviceAccount[field]);
  if (missingFields.length) {
    throw new Error(`Firebase service account JSON is incomplete; missing ${missingFields.join(", ")}`);
  }
  return serviceAccount;
}

function fcmEndpoint(serviceAccount) {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`;
}

function buildFcmRequest(item, validateOnly = false) {
  const notificationBody = item.summaryZh
    || item.bodyZh?.[0]
    || item.summaryEn
    || item.bodyEn?.[0]
    || "多伦多蓝鸟发布了一篇新文章，点击查看详情。";
  return {
    validate_only: validateOnly,
    message: {
      topic: NEWS_TOPIC,
      data: {
        type: "team_news",
        teamId: TEAM_ID,
        newsId: item.id,
        newsUrl: item.url,
        title: item.titleZh || item.titleEn,
        body: String(notificationBody).replace(/\s+/g, " ").trim().slice(0, 500)
      },
      android: {
        priority: "high"
      }
    }
  };
}

async function validateFcmConfiguration() {
  const serviceAccount = readServiceAccount();
  if (!serviceAccount) throw new Error("FCM secret is not configured");
  const accessToken = await createGoogleAccessToken(serviceAccount);
  const response = await fetchWithTimeout(fcmEndpoint(serviceAccount), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(buildFcmRequest({
      id: "validation",
      titleEn: "Sports Calendar FCM validation",
      summaryEn: "Validation only; this message is not delivered.",
      url: "https://www.mlb.com/bluejays/news/fcm-validation"
    }, true))
  }, 15000);
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`FCM validation returned ${response.status}: ${details}`);
  }
  process.stdout.write("FCM validate_only request accepted.\n");
}

function reportWorkflowWarning(title, message) {
  const cleanTitle = String(title || "Warning").replace(/[\r\n]+/g, " ").slice(0, 80);
  const cleanMessage = String(message || "Unknown error").replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stderr.write(`::warning title=${cleanTitle}::${cleanMessage}\n`);
  } else {
    process.stderr.write(`${cleanTitle}: ${message}\n`);
  }
}

async function validateFcmBestEffort(validator = validateFcmConfiguration) {
  try {
    await validator();
    return true;
  } catch (error) {
    reportWorkflowWarning("FCM validation failed", error.message);
    return false;
  }
}

async function sendNotificationsBestEffort(
  items,
  sender = sendNotifications,
  reportError = (message) => process.stderr.write(message)
) {
  try {
    const result = await sender(items);
    if (result && Array.isArray(result.sentIds) && Array.isArray(result.failedIds)) return result;
    return { sentIds: items.map((item) => item.id), failedIds: [] };
  } catch (error) {
    reportError(`FCM notification skipped without blocking news update: ${error.message}\n`);
    return { sentIds: [], failedIds: items.map((item) => item.id) };
  }
}

function collectPendingNotificationItems(previousPayload, update) {
  const currentItems = Array.isArray(update?.payload?.items) ? update.payload.items : [];
  const itemsById = new Map(currentItems.map((item) => [item.id, item]));
  const previousPending = Array.isArray(previousPayload?.pendingNotificationIds)
    ? previousPayload.pendingNotificationIds
    : [];
  const newIds = Array.isArray(update?.newItems) ? update.newItems.map((item) => item.id) : [];
  return Array.from(new Set([...previousPending, ...newIds]))
    .map((id) => itemsById.get(id))
    .filter(Boolean)
    .slice(0, 20);
}

function withPendingNotificationIds(payload, failedIds) {
  const currentIds = new Set((payload?.items || []).map((item) => item.id));
  return {
    ...payload,
    pendingNotificationIds: Array.from(new Set(failedIds || []))
      .filter((id) => currentIds.has(id))
      .slice(0, 20)
  };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsignedAssertion = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedAssertion), serviceAccount.private_key).toString("base64url");
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedAssertion}.${signature}`
    })
  }, 15000);
  if (!response.ok) throw new Error(`Google OAuth returned ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google OAuth did not return an access token");
  return payload.access_token;
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const previousPayload = readPreviousPayload();
  const articlesWithBodies = await enrichArticleBodies(await fetchFeed(), previousPayload);
  const feedItems = await enrichTranslations(articlesWithBodies, previousPayload);
  const update = buildStaticNewsUpdate(previousPayload, feedItems);
  if (process.env.VALIDATE_FCM === "true") await validateFcmBestEffort();
  const pendingItems = collectPendingNotificationItems(previousPayload, update);
  if (!update.changed && !pendingItems.length) {
    process.stdout.write("Blue Jays news is already current.\n");
    return;
  }
  const delivery = await sendNotificationsBestEffort(pendingItems);
  writePayload(withPendingNotificationIds(update.payload, delivery.failedIds));
  process.stdout.write(`Updated ${path.relative(root, outputFile)} with ${update.payload.items.length} article(s).\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Blue Jays news update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchArticleContent,
  enrichArticleBodies,
  translateArticle,
  enrichTranslations,
  sendNotificationsBestEffort,
  collectPendingNotificationItems,
  withPendingNotificationIds,
  buildFcmRequest,
  validateFcmBestEffort,
  parseServiceAccount
};
