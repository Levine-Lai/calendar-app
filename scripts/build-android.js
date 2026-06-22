const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const androidDir = path.join(root, "android");

function findCachedGradle() {
  const wrapperProperties = fs.readFileSync(
    path.join(androidDir, "gradle", "wrapper", "gradle-wrapper.properties"),
    "utf8"
  );
  const version = wrapperProperties.match(/gradle-([\d.]+)-bin\.zip/)?.[1];
  if (!version) {
    return null;
  }
  const distsDir = path.join(os.homedir(), ".gradle", "wrapper", "dists");
  if (!fs.existsSync(distsDir)) {
    return null;
  }

  const candidates = [];
  for (const distName of fs.readdirSync(distsDir)) {
    if (!distName.startsWith(`gradle-${version}-bin`)) {
      continue;
    }

    const distPath = path.join(distsDir, distName);
    for (const hashDir of fs.readdirSync(distPath)) {
      const gradleBat = path.join(
        distPath,
        hashDir,
        `gradle-${version}`,
        "bin",
        "gradle.bat"
      );
      if (fs.existsSync(gradleBat)) {
        candidates.push(gradleBat);
      }
    }
  }

  return candidates[0] || null;
}

const gradleCommand = findCachedGradle() || path.join(androidDir, "gradlew.bat");
const result = spawnSync(
  gradleCommand,
  ["assembleDebug", "--no-daemon", "--console=plain"],
  {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32"
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
