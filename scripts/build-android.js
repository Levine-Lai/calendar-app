const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const androidDir = path.join(root, "android");
const releaseBuild = process.argv.includes("--release");
const expectedSignerSha256 =
  "7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0";

const required = [
  "SPORTS_CALENDAR_KEYSTORE",
  "SPORTS_CALENDAR_STORE_PASSWORD",
  "SPORTS_CALENDAR_KEY_ALIAS",
  "SPORTS_CALENDAR_KEY_PASSWORD"
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  process.stderr.write(
    `为避免覆盖安装时发生签名冲突，Debug 和 Release 均必须使用原始固定签名。\n`
      + `缺少环境变量：${missing.join(", ")}\n`
      + `需要证书 SHA-256：${expectedSignerSha256.toUpperCase()}\n`
  );
  process.exit(1);
}
if (!fs.existsSync(process.env.SPORTS_CALENDAR_KEYSTORE)) {
  process.stderr.write("SPORTS_CALENDAR_KEYSTORE 指向的签名文件不存在\n");
  process.exit(1);
}

function verifySigningIdentity() {
  const javaHome = process.env.JAVA_HOME || "";
  const keytool = javaHome
    ? path.join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool")
    : "keytool";
  const result = spawnSync(
    keytool,
    [
      "-list",
      "-v",
      "-keystore",
      process.env.SPORTS_CALENDAR_KEYSTORE,
      "-storepass:env",
      "SPORTS_CALENDAR_STORE_PASSWORD",
      "-alias",
      process.env.SPORTS_CALENDAR_KEY_ALIAS
    ],
    {
      encoding: "utf8",
      env: process.env,
      windowsHide: true
    }
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error || result.status !== 0) {
    process.stderr.write("无法读取签名文件，请检查 keystore、密码和别名\n");
    process.exit(1);
  }
  const fingerprint = output.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1]
    ?.replaceAll(":", "")
    .toLowerCase();
  if (fingerprint !== expectedSignerSha256) {
    process.stderr.write(
      `签名证书不匹配，已停止打包。\n`
        + `需要：${expectedSignerSha256.toUpperCase()}\n`
        + `实际：${(fingerprint || "无法识别").toUpperCase()}\n`
    );
    process.exit(1);
  }
}

verifySigningIdentity();

const outputApk = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  releaseBuild ? "release" : "debug",
  releaseBuild ? "app-release.apk" : "app-debug.apk"
);
if (fs.existsSync(outputApk)) {
  fs.rmSync(outputApk);
}

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
  [releaseBuild ? "assembleRelease" : "assembleDebug", "--no-daemon", "--console=plain"],
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
