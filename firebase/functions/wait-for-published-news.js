const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const localFile = path.join(root, "public", "news", "blue-jays.json");
const endpoint = "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(fetchImpl = fetch) {
  const expected = JSON.parse(fs.readFileSync(localFile, "utf8"));
  const expectedId = expected.items?.[0]?.id || "";
  const expectedUpdatedAt = expected.updatedAt || "";
  if (!expectedId || !expectedUpdatedAt) throw new Error("Local news cache has no publication marker");

  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("published_check", `${Date.now()}-${attempt}`);
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: { accept: "application/json", "cache-control": "no-cache" }
      });
      if (!response.ok) throw new Error(`GitHub Raw returned ${response.status}`);
      const published = await response.json();
      if (published.updatedAt === expectedUpdatedAt && published.items?.[0]?.id === expectedId) {
        process.stdout.write(`Published news cache is ready: ${expectedId}\n`);
        return true;
      }
      lastError = new Error("GitHub Raw still serves the previous news cache");
    } catch (error) {
      lastError = error;
    }
    if (attempt < 11) await wait(3000);
  }
  throw lastError || new Error("Published news cache did not become ready");
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Published news readiness check failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
