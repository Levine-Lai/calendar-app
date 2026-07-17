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
  normalizeMlbUrl,
  toMlbAmpUrl,
  extractMlbArticleParagraphs
} = require("./news-core");

const root = path.resolve(__dirname, "..", "..");
const outputFile = path.join(root, "public", "news", "blue-jays.json");

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

async function fetchArticleBody(item) {
  const articleUrl = toMlbAmpUrl(item.url);
  if (!articleUrl) return [];
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
  const paragraphs = extractMlbArticleParagraphs(bytes.toString("utf8"));
  if (!paragraphs.length) throw new Error("MLB article did not contain readable paragraphs");
  return paragraphs;
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
    const previousBody = normalizeArticleParagraphs(previousItems.get(item.id)?.bodyEn);
    if (previousBody.length) return { ...item, bodyEn: previousBody };
    try {
      const bodyEn = await fetchArticleBody(item);
      process.stdout.write(`Fetched article body: ${item.titleEn}\n`);
      return { ...item, bodyEn };
    } catch (error) {
      process.stderr.write(`Article body skipped for ${item.titleEn}: ${error.message}\n`);
      return { ...item, bodyEn: [] };
    }
  });
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
  if (!items.length) return;
  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    process.stdout.write(`Saved ${items.length} new article(s); FCM secret is not configured yet.\n`);
    return;
  }

  const accessToken = await createGoogleAccessToken(serviceAccount);
  const endpoint = fcmEndpoint(serviceAccount);
  for (const item of items.slice(0, 5).reverse()) {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildFcmRequest(item))
    }, 15000);
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`FCM returned ${response.status}: ${details}`);
    }
  }
  process.stdout.write(`Sent ${Math.min(items.length, 5)} FCM notification(s) for ${TEAM_NAME}.\n`);
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
  return {
    validate_only: validateOnly,
    message: {
      topic: NEWS_TOPIC,
      notification: {
        title: item.titleEn,
        body: item.summaryEn || "The Toronto Blue Jays published a new story."
      },
      data: {
        type: "team_news",
        teamId: TEAM_ID,
        newsId: item.id,
        newsUrl: item.url
      },
      android: {
        priority: "high",
        notification: {
          channel_id: "team_news",
          tag: `team-news-${item.id}`,
          click_action: "OPEN_TEAM_NEWS"
        }
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
    await sender(items);
    return true;
  } catch (error) {
    reportError(`FCM notification skipped without blocking news update: ${error.message}\n`);
    return false;
  }
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const previousPayload = readPreviousPayload();
  const feedItems = await enrichArticleBodies(await fetchFeed(), previousPayload);
  const update = buildStaticNewsUpdate(previousPayload, feedItems);
  if (process.env.VALIDATE_FCM === "true") await validateFcmBestEffort();
  if (!update.changed) {
    process.stdout.write("Blue Jays news is already current.\n");
    return;
  }
  writePayload(update.payload);
  await sendNotificationsBestEffort(update.newItems);
  process.stdout.write(`Updated ${path.relative(root, outputFile)} with ${update.payload.items.length} article(s).\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Blue Jays news update failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchArticleBody,
  enrichArticleBodies,
  sendNotificationsBestEffort,
  buildFcmRequest,
  validateFcmBestEffort,
  parseServiceAccount
};
