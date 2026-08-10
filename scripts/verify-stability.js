const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const provider = read("android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java");
const worker = read("android/app/src/main/java/com/local/sportscalendar/WidgetRefreshWorker.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const app = read("public/app.js");
const styles = read("public/styles.css");
const storage = read("public/calendar-storage.js");
const core = read("public/calendar-core.js");
const gradle = read("android/app/build.gradle");
const packageJson = require(path.join(root, "package.json"));
const versionManifest = JSON.parse(read("public/version.json"));
const updateConfig = read("public/update-config.js");
const androidBuild = read("scripts/build-android.js");
const newsWorker = read("android/app/src/main/java/com/local/sportscalendar/TeamNewsRefreshWorker.java");
const newsPushManager = read("android/app/src/main/java/com/local/sportscalendar/TeamNewsPushManager.java");
const newsMessagingService = read("android/app/src/main/java/com/local/sportscalendar/NewsMessagingService.java");
const newsUpdater = read("firebase/functions/update-static-news.js");
const mainActivity = read("android/app/src/main/java/com/local/sportscalendar/MainActivity.java");
const index = read("index.html");
const launchAnimation = read("public/launch-animation.js");
const customScheduleCore = read("public/custom-schedule-core.js");
const customScheduleConfig = read("public/custom-schedule-agent-config.js");
const customScheduleWorker = read("workers/custom-schedule-agent/src/index.js");
const customScheduleWorkerConfig = read("workers/custom-schedule-agent/wrangler.toml");
const teamNewsConfig = read("public/team-news-config.js");
const arsenalNews = JSON.parse(read("public/news/arsenal.json"));
const launchScreen = read("android/app/src/main/res/drawable/launch_screen.xml");
const androidStyles = read("android/app/src/main/res/values/styles.xml");
const androidColors = read("android/app/src/main/res/values/colors.xml");
const webBuild = read("scripts/build-web.js");
const newsWidgetProvider = read("android/app/src/main/java/com/local/sportscalendar/MatchDetailWidgetProvider.java");
const newsWidgetWorker = read("android/app/src/main/java/com/local/sportscalendar/NewsWidgetRefreshWorker.java");
const newsWidgetData = read("android/app/src/main/java/com/local/sportscalendar/TeamNewsWidgetData.java");
const widgetNetworkClient = read("android/app/src/main/java/com/local/sportscalendar/WidgetNetworkClient.java");
const newsWidgetInfoLegacy = read("android/app/src/main/res/xml/match_detail_widget_info.xml");
const newsWidgetInfo = read("android/app/src/main/res/xml-v31/match_detail_widget_info.xml");
const newsWidgetLayout = read("android/app/src/main/res/layout/widget_match_detail.xml");
const newsWidgetItemLayout = read("android/app/src/main/res/layout/widget_news_item.xml");
const newsWidgetService = read("android/app/src/main/java/com/local/sportscalendar/NewsWidgetService.java");
const arsenalNewsUpdater = read("firebase/functions/update-arsenal-news.js");
const arsenalNewsCore = read("firebase/functions/arsenal-news-core.js");
const arsenalNewsWorkflow = read(".github/workflows/arsenal-news.yml");
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
  ],
  [
    "21 新闻后台任务持续运行",
    newsWorker.includes("Result.retry()")
      && !newsWorker.includes("Result.failure()")
      && newsPushManager.includes("wasNotificationRemembered")
  ],
  [
    "22 FCM失败通知持久重试",
    newsUpdater.includes("pendingNotificationIds")
      && newsUpdater.includes("collectPendingNotificationItems")
      && newsUpdater.includes("failedIds")
  ],
  [
    "23 新闻三级阅读与官方图片",
    app.includes("renderHomeTeamNews")
      && app.includes("openTeamNewsArticle")
      && app.includes("normalizeNewsImageUrl")
      && styles.includes(".team-news-article-page")
      && newsUpdater.includes("extractMlbArticleImage")
  ],
  [
    "24 手机新闻排版与返回",
    styles.includes(".home-news-list .team-news-card-media")
      && styles.includes("aspect-ratio: 4 / 3")
      && styles.includes("grid-auto-rows: max-content")
      && app.includes("bindTeamNewsBackGestures")
      && app.includes("SportsCalendarHandleBack")
      && !app.includes("已自动同步")
      && mainActivity.includes("window.SportsCalendarHandleBack")
  ],
  [
    "25 多日期组件图标与首页精简",
    provider.includes("root.put(dayKey, snapshot)")
      && !provider.includes("cacheDetailWidgetGames(context);\n        MatchDetailWidgetProvider.refreshAllViews")
      && !read("index.html").includes("我的偏好")
      && !read("index.html").includes("文件导入")
      && !read("index.html").includes('id="teamNewsPanelStatus"')
  ],
  [
    "26 固定签名身份守卫",
    androidBuild.includes("expectedSignerSha256")
      && androidBuild.includes("7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0")
      && androidBuild.includes("签名证书不匹配，已停止打包")
      && androidBuild.includes("fs.rmSync(outputApk)")
      && gradle.includes("debug {")
      && gradle.includes("signingConfig signingConfigs.release")
  ],
  [
    "27 launch animation duration and background",
    index.includes('id="launchAnimation"')
      && index.includes("public/assets/branding/launch-runner.gif")
      && launchAnimation.includes("const splashDurationMs = 1500")
      && launchAnimation.includes("window.SportsCalendarLaunch")
      && launchAnimation.includes("if (running) return completion")
      && styles.includes(".launch-animation.is-closing")
      && androidColors.includes("#C5E5F8")
      && !launchScreen.includes("@mipmap/ic_launcher")
      && androidStyles.includes("@drawable/splash_transparent_icon")
      && mainActivity.includes("playLaunchThenHandleIntent")
      && mainActivity.includes("launch.play().then(done,done)")
      && mainActivity.includes("public void onResume()")
      && mainActivity.includes("playLaunchOnResume = true")
      && fs.existsSync(path.join(root, "public/assets/branding/launch-runner.gif"))
      && webBuild.includes("prototypeBrandingPattern")
  ],
  [
    "28 组件2新闻大图与独立刷新",
    newsWidgetInfo.includes('android:targetCellWidth="4"')
      && newsWidgetInfo.includes('android:targetCellHeight="3"')
      && newsWidgetInfo.includes('android:minHeight="188dp"')
      && newsWidgetInfoLegacy.includes('android:minHeight="188dp"')
      && newsWidgetLayout.includes('android:id="@+id/news_widget_image"')
      && newsWidgetLayout.includes('android:scaleType="fitCenter"')
      && newsWidgetLayout.includes('android:layout_height="0dp"')
      && newsWidgetLayout.includes('android:layout_weight="2"')
      && newsWidgetLayout.includes('android:textSize="19sp"')
      && newsWidgetProvider.includes("NewsWidgetRefreshWorker.class")
      && newsWidgetProvider.includes("setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)")
      && newsWidgetProvider.includes("TeamNewsWidgetData.loadImage")
      && newsWidgetProvider.includes("openArticlePendingIntent")
      && !newsWidgetProvider.includes("setRemoteAdapter")
      && newsWidgetProvider.includes("15,")
      && newsWidgetWorker.includes("TeamNewsWidgetData.fetchRecent()")
      && newsWidgetData.includes("MAX_ITEMS = 1")
      && newsWidgetData.includes("Executors.newFixedThreadPool")
      && newsWidgetData.includes("executor.invokeAll(tasks, 12, TimeUnit.SECONDS)")
      && newsWidgetData.includes("img.mlbstatic.com")
      && newsWidgetData.includes('open("public/public/news/blue-jays.json")')
      && widgetNetworkClient.includes("float scale = Math.min(")
      && !widgetNetworkClient.includes("Bitmap.createBitmap(scaled")
      && manifest.includes('android:name=".NewsWidgetService"')
      && !manifest.includes("SportsDetailWidgetService")
      && !fs.existsSync(path.join(
        root,
        "android/app/src/main/java/com/local/sportscalendar/SportsDetailWidgetService.java"
      ))
  ],
  [
    "29 无阴影与比赛 API 韧性",
    styles.includes("box-shadow: none !important")
      && styles.includes("text-shadow: none !important")
      && app.includes("maxEspnScheduleRangeDays = 45")
      && app.includes("fetchEspnScheduleChunks")
      && app.includes("mapLimit(chunks, 3")
      && app.includes("deriveTeamsFromEvents")
      && app.includes("fetchJsonpOnce")
      && packageJson.scripts?.["check:apis"] === "node scripts/check-sports-apis.js"
      && fs.existsSync(path.join(root, "scripts/check-sports-apis.js"))
  ],
  [
    "30 首页隐藏今日比赛、周一日历、组件明日默认与中超队徽兜底",
    !index.includes('id="todayGamesList"')
      && !index.includes('id="todayGamesCount"')
      && app.includes("function renderTodayGames()")
      && app.includes("function renderHomeTodayGame(event)")
      && app.includes('const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]')
      && core.includes("((start.getDay() + 6) % 7)")
      && provider.includes("DEFAULT_SELECTED_DAY_OFFSET = 1")
      && provider.includes("defaultSelectedDayOffset()")
      && app.includes("fetchCslOfficialLogoLookup")
      && app.includes('cflCompetitionCode: "CSL"')
      && app.includes("cslKnownLogoFallbacksById")
      && read("scripts/check-sports-apis.js").includes('["中超队徽兜底", "CSL"]')
  ],
  [
    "31 新闻文章独立滚动位置记忆",
    app.includes("articleScrollPositions: new Map()")
      && app.includes("function rememberActiveTeamNewsScrollPosition()")
      && app.includes("function restoreActiveTeamNewsScrollPosition()")
      && app.includes("teamNewsState.activeTeamId")
      && app.includes("restoreActiveTeamNewsScrollPosition()")
  ],
  [
    "32 智能自定义赛程与安全语音入口",
    index.includes('id="customScheduleInput"')
      && app.includes("function previewCustomSchedule()")
      && app.includes("function confirmCustomSchedule()")
      && app.includes("startSpeechRecognition")
      && customScheduleCore.includes("function parseScheduleDescription")
      && customScheduleConfig.includes('endpoint: "https://sports-calendar-schedule-agent.nbafantasy.workers.dev/v1/parse"')
      && manifest.includes("android.permission.RECORD_AUDIO")
      && read("android/app/src/main/java/com/local/sportscalendar/SportsWidgetPlugin.java").includes("SpeechRecognizer")
  ],
  [
    "33 Cloudflare DeepSeek 智能赛程代理",
    customScheduleWorker.includes("https://api.deepseek.com/chat/completions")
      && customScheduleWorker.includes("CUSTOM_SCHEDULE_AI_API_KEY")
      && customScheduleWorker.includes("CUSTOM_SCHEDULE_LIMITER.limit")
      && customScheduleWorkerConfig.includes('required = ["CUSTOM_SCHEDULE_AI_API_KEY"]')
  ],
  [
    "34 北京时间新闻推送静默时段",
    newsUpdater.includes("function isBeijingQuietHours")
      && newsUpdater.includes("Beijing quiet hours are active")
      && newsPushManager.includes("TimeZone.getTimeZone(\"Asia/Shanghai\")")
      && newsPushManager.includes("if (isBeijingQuietHours())")
      && newsMessagingService.includes("TeamNewsPushManager.isBeijingQuietHours()")
  ],
  [
    "35 日历双击删除与系统下载浏览器",
    index.includes('id="deleteEventModal"')
      && index.includes('id="deleteEventConfirm"')
      && app.includes("function handleDayEventDeleteTap(event)")
      && app.includes("function confirmDayEventDelete()")
      && app.includes("dismissedEventIds")
      && storage.includes("dismissedEventIds")
      && !app.includes("day-modal-event-delete")
      && read("android/app/src/main/java/com/local/sportscalendar/SportsWidgetPlugin.java").includes("Intent.createChooser")
      && read("android/app/src/main/java/com/local/sportscalendar/SportsWidgetPlugin.java").includes("getActivity().startActivity(chooser)")
  ],
  [
    "36 阿森纳双语新闻框架与无点击高亮切换",
    index.includes('id="homeArsenalNewsList"')
      && index.includes('id="openArsenalNewsBtn"')
      && teamNewsConfig.includes('teamId: "arsenal"')
      && teamNewsConfig.includes('bundledUrl: "public/news/arsenal.json"')
      && arsenalNews.teamId === "arsenal"
      && arsenalNews.items.length >= 3
      && app.includes('renderHomeTeamNews("arsenal"')
      && app.includes("function openExternalNewsUrl")
      && styles.includes("-webkit-tap-highlight-color: transparent")
      && styles.includes(".team-news-language-tab:hover")
      && styles.includes("transform: none")
      && styles.includes(".team-news-original-link")
  ],
  [
    "37 阿森纳双源自动更新、本地队徽与快速缓存",
    teamNewsConfig.includes('logoUrl: "public/assets/teams/arsenal.png"')
      && fs.existsSync(path.join(root, "public/assets/teams/arsenal.png"))
      && arsenalNewsUpdater.includes("Promise.allSettled")
      && arsenalNewsUpdater.includes('teamId: "arsenal"')
      && arsenalNewsCore.includes("https://www.arsenal.com/sitemaps/articles/1/sitemap.xml")
      && arsenalNewsCore.includes("https://www.theguardian.com/football/arsenal/rss")
      && arsenalNewsWorkflow.includes("schedule:")
      && arsenalNewsWorkflow.includes("npm run update:arsenal --prefix firebase/functions")
      && arsenalNewsWorkflow.includes("team-news-updates")
      && app.includes("collectFastNewsResults")
  ]
];

const failures = checks.filter(([, passed]) => !passed);
checks.forEach(([name, passed]) => process.stdout.write(`${passed ? "PASS" : "FAIL"} ${name}\n`));
if (failures.length) process.exit(1);
