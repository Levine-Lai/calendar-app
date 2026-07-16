const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const provider = read("android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java");
const worker = read("android/app/src/main/java/com/local/sportscalendar/WidgetRefreshWorker.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const app = read("public/app.js");
const core = read("public/calendar-core.js");
const gradle = read("android/app/build.gradle");
const packageJson = require(path.join(root, "package.json"));
const versionManifest = JSON.parse(read("public/version.json"));
const updateConfig = read("public/update-config.js");
const currentVersionCode = Number(updateConfig.match(/currentVersionCode:\s*(\d+)/)?.[1]);

const tracked = (folder) => execFileSync("git", ["ls-files", folder], { cwd: root, encoding: "utf8" }).trim();
const checks = [
  ["01 WorkManager即时刷新", provider.includes("enqueueImmediateRefresh") && !provider.includes("EXECUTOR.execute")],
  ["02 Worker失败重试", worker.includes("Result.retry()") && worker.includes("Result.failure()")],
  ["03 中冠赛中状态", provider.includes("applyCfaStatus") && provider.includes("TimeUnit.HOURS.toMillis(4)")],
  ["04 数据备份恢复", fs.existsSync(path.join(root, "public/calendar-storage.js")) && !app.includes("localStorage.removeItem(storageKey")],
  ["05 动态赛季", app.includes("getWorldCupYear") && app.includes("`${year}0410`")],
  ["06 延迟启动任务", app.includes("requestIdleCallback") && app.includes(".slice(0, 24)")],
  ["07 并行更新限流", app.includes("mapLimit(leagueEntries, 3") && app.includes("mapLimit(leagueTeams, 4")],
  ["08 五态状态模型", core.includes("postponed") && core.includes("canceled") && core.includes("classifyEventStatus")],
  ["09 刷新时间与错误", provider.includes("widget_refresh_status") && app.includes("lastSuccessAt")],
  ["10 网络与图片上限", read("android/app/src/main/java/com/local/sportscalendar/WidgetNetworkClient.java").includes("MAX_IMAGE_PIXELS")],
  ["11 分离与原子存储", fs.existsSync(path.join(root, "android/app/src/main/java/com/local/sportscalendar/WidgetEventStore.java"))],
  ["12 每组件独立日期", provider.includes("selectedDayOffsetKey(appWidgetId)")],
  ["13 移除过宽FileProvider", !manifest.includes("FileProvider") && manifest.includes('android:allowBackup="false"')],
  ["14 禁止混合内容", read("android/app/src/main/java/com/local/sportscalendar/MainActivity.java").includes("MIXED_CONTENT_NEVER_ALLOW")],
  ["15 内部组件Receiver", manifest.includes('android:name=".WidgetActionReceiver"') && manifest.includes('android:exported="false"')],
  ["16 导入安全限制", app.includes("maxImportBytes") && app.includes("maxImportEvents") && core.includes("sanitizeColor")],
  ["17 正式签名流程", gradle.includes("signingConfigs") && gradle.includes("shrinkResources true")],
  ["18 职责模块拆分", ["calendar-storage.js", "calendar-image-cache.js"].every((file) => fs.existsSync(path.join(root, "public", file)))],
  ["19 仓库生成物清理", fs.existsSync(path.join(root, ".gitignore")) && !tracked("node_modules") && !tracked("www")],
  [
    "20 版本配置一致",
    gradle.includes(`versionName "${packageJson.version}"`)
      && updateConfig.includes(`currentVersionName: "${packageJson.version}"`)
      && Number.isInteger(currentVersionCode)
      && gradle.includes(`versionCode ${currentVersionCode}`)
      && Number(versionManifest.versionCode) > 0
  ]
];

const failures = checks.filter(([, passed]) => !passed);
checks.forEach(([name, passed]) => process.stdout.write(`${passed ? "PASS" : "FAIL"} ${name}\n`));
if (failures.length) process.exit(1);
