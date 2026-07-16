const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  TEAM_ID,
  TEAM_NAME,
  NEWS_TOPIC,
  RSS_URL,
  parseBlueJaysFeed,
  buildStaticNewsUpdate
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
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) {
    process.stdout.write(`Saved ${items.length} new article(s); FCM secret is not configured yet.\n`);
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawCredentials);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Firebase service account JSON is incomplete");
  }

  const accessToken = await createGoogleAccessToken(serviceAccount);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`;
  for (const item of items.slice(0, 5).reverse()) {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
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
              channelId: "team_news",
              tag: `team-news-${item.id}`,
              clickAction: "OPEN_TEAM_NEWS"
            }
          }
        }
      })
    }, 15000);
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`FCM returned ${response.status}: ${details}`);
    }
  }
  process.stdout.write(`Sent ${Math.min(items.length, 5)} FCM notification(s) for ${TEAM_NAME}.\n`);
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
  const feedItems = await fetchFeed();
  const update = buildStaticNewsUpdate(previousPayload, feedItems);
  if (!update.changed) {
    process.stdout.write("Blue Jays news is already current.\n");
    return;
  }
  writePayload(update.payload);
  await sendNotifications(update.newItems);
  process.stdout.write(`Updated ${path.relative(root, outputFile)} with ${update.payload.items.length} article(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`Blue Jays news update failed: ${error.message}\n`);
  process.exitCode = 1;
});
