# 观赛日记维护上下文

## 记录规则

- 每次修复、功能调整、数据源变更或打包发布后，都必须在本文末尾追加记录。
- 每个自然日使用独立的 `## YYYY-MM-DD` 标题；同一天有多次修改时，在日期下追加新的 `### 修复批次`。
- 每条记录至少包含：用户目标、问题原因、实现方案、数据兼容、涉及文件、验证结果和未解决限制。
- 不覆盖旧记录。架构发生变化时，更新“当前结构”，同时在当日记录中说明迁移原因。
- 除非用户明确要求，修改后只做 Web/Android 编译验证，不自动生成 APK。

## 当前结构

### Web 页面

- `index.html`：静态页面入口，依次加载 core、存储、图片缓存和页面控制脚本。
- `public/calendar-core.js`：无 DOM 依赖的核心规则，可在浏览器和 Node 测试中复用。
  - 管理比赛与多支关注球队的关联。
  - 迁移旧版单一 `importedTeamId` 数据。
  - 合并、解绑比赛关联。
  - 解析布尔值、月份 42 天范围和带 `TZID` 的 ICS 时间。
- `public/app.js`：页面状态、各数据源适配、导入更新、筛选、日历和组件同步。
- `public/team-news-core.js`：新闻数据校验、静态源新鲜度比较，以及 MLB 实时列表与静态正文合并。
- `public/calendar-storage.js`：IndexedDB 主存储、双快照备份、旧 v5 迁移和 localStorage 应急恢复。
- `public/calendar-image-cache.js`：远程队徽缓存、容量回收和并发任务合并。
- `public/styles.css`：桌面和移动端新粗野派布局。
- `tests/calendar-core.test.js`：核心数据规则回归测试，使用 Node 内置测试运行器。

### Web 数据模型

- `state.events` 保存去重后的比赛实体，比赛 ID 不再因为关注不同球队而复制。
- `state.followedTeams` 独立保存关注球队。
- 每场联赛导入比赛使用 `importedTeams[]` 保存多个关注球队关联。
- 旧字段 `importedTeamId`、`importedTeamName` 等继续生成，供旧版数据和原生桥接兼容；加载时会自动转成 `importedTeams[]`。
- 文件导入比赛不属于受管理的球队赛程，删除球队时不会误删文件导入内容。

### 数据源与赛季

- ESPN：NBA、MLB、欧洲足球、世界杯和中超。
- CFL 中国足球联赛官方接口：中甲、中乙。
- 中国足协：中冠。
- 欧洲跨年赛季、NBA 赛季和中国自然年赛季由函数动态解析。
- 世界杯赛期按四年周期计算；2026 固定展示 48 支参赛队，后续赛期从 ESPN 获取球队。
- 中冠赛事 ID 按年度规则生成，仍以中国足协接口的实际返回作为最终依据。

### Android App 与组件

- `SportsWidgetPlugin` + `WidgetEventStore`：比赛变化时异步写入私有原子文件，保留旧 SharedPreferences 迁移兼容。
- `MlbTodayWidgetProvider`：按组件 ID 读取所选北京时间日期，先显示本地数据，再补实时比分。
- `GameStatus`：统一原生五态比赛状态规则。
- `WidgetNetworkClient`：统一 HTTPS、响应体积、图片像素和超时限制。
- `WidgetActionReceiver`：不导出的组件内部刷新与切日入口。
- `SportsWidgetService`：只读取已经准备好的比赛和队徽缓存，不在列表回调中联网。
- `WidgetRefreshWorker`：联网时约每 15 分钟请求一次组件更新；手动刷新也进入一次性 Worker，失败最多重试 3 次。
- `TeamNewsFeed`：受限读取并解析 MLB 蓝鸟 RSS，生成与服务端一致的文章 ID。
- `TeamNewsRefreshWorker`：推送开启后每 15 分钟后台检查新闻，作为 GitHub Actions/FCM 延迟时的本地通知补偿。
- `NewsMessagingService` + `TeamNewsPushManager`：统一处理 FCM 数据消息、本地通知、文章 ID 去重、主题订阅恢复和最近检查状态。
- 实时比分保存在当日原生快照中，进程回收后仍可恢复。
- 队徽缓存在 `cacheDir/widget_logos`，最多保留 256 个；列表缓存未命中时先显示占位图，后台下载完成后再刷新。
- 桌面组件手动刷新仍是获取最新比分最直接的方式。

## 2026-06-21

### 修复批次：全项目审查问题整改

#### 用户目标

- 修复代码审查中提出的全部高、中、低优先级问题。
- 建立 `context.md`，以后每次修复都按日期记录上下文。

#### 修复内容

1. 将关注球队从比赛单值字段重构为独立 `followedTeams` 和比赛级 `importedTeams[]`，解决两支关注球队交手时后导入者覆盖前导入者的问题。
2. 增加旧数据自动迁移；共享比赛删除一支球队后仍保留另一支球队关联。
3. 导入和更新改为原子替换：完整成功才移除旧赛程；部分请求失败时只合并成功结果并保留旧赛程。
4. 新增统一 JSON 请求层，包含 15 秒超时、网络错误重试、429/5xx 指数退避。
5. ESPN 球队详情改为部分容错；单支详情失败不会让整个球队列表失败，失败结果不再缓存为空。
6. 增加球队加载请求序号，快速切换联赛时旧请求不会覆盖当前界面状态。
7. 月历数据范围改成实际可见的 42 天，月初和月末的相邻月份格子会展示比赛。
8. 组件同步从通用 `persist()` 中拆出；筛选输入、联赛选择等界面操作不再重复传输全部比赛并触发组件联网。
9. 组件比分增加当天持久化快照；组件进程重启或暂时离线时优先使用最近成功比分。
10. 队徽下载移出 `RemoteViewsFactory.getViewAt()`，改为磁盘缓存和后台预取，避免弱网时列表空白。
11. 组件列表使用赛事稳定 ID，降低更新或翻页后行内容串位的风险。
12. 加入 WorkManager，每 15 分钟在有网络时尝试刷新组件；保留 30 分钟系统组件周期和手动刷新。
13. 赛季年份集中动态解析；中甲、中乙不再写死 2026，英超不再写死 26-27 日期范围。
14. 中冠年度赛事 ID 集中到 `providerSeasonOverrides`，新赛季缺少映射时明确提示配置缺失。
15. ICS 导入支持 `TZID`；CSV 表头兼容 BOM；字符串 `false` 不再被当成已结束。
16. 外部赛事链接只允许 HTTP/HTTPS 协议。
17. 新增 `calendar-core.js` 和 5 项 Web 核心测试；Android 模板测试替换为真实比赛状态测试，并修正仪器测试包名。
18. 修复 Manifest 权限顺序、组件图片无障碍声明、API 31 组件预览资源和主题图标 monochrome 配置。
19. `package.json` 版本与 Android 2.0 对齐；Android 构建脚本从 wrapper 配置动态读取 Gradle 版本。

#### 数据兼容

- 保留 localStorage 键 `sports-fan-calendar:v5`，无需用户重新导入。
- 加载旧数据时，从每场比赛的 `importedTeamId` 推导 `importedTeams[]` 和 `followedTeams`。
- 下一次发生实际数据保存时会写入新结构。
- 原生组件桥接继续输出旧兼容字段，不要求用户删除并重新添加组件。

#### 主要文件

- `public/calendar-core.js`
- `public/app.js`
- `tests/calendar-core.test.js`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/java/com/local/sportscalendar/SportsWidgetService.java`
- `android/app/src/main/java/com/local/sportscalendar/WidgetRefreshWorker.java`
- `android/app/src/test/java/com/local/sportscalendar/WidgetGameStatusTest.java`
- `android/app/src/main/res/xml-v31/mlb_today_widget_info.xml`
- `package.json`
- `scripts/build-android.js`

#### 验证结果

- `node --check public/calendar-core.js`：通过。
- `node --check public/app.js`：通过。
- `npm test`：5 项通过。
- `npm run build:web`：通过。
- `npx cap copy android`：通过。
- Android `testDebugUnitTest lintDebug`：通过，0 error。
- 浏览器回归：旧本地赛程正常加载；月历相邻月份比赛正常显示；控制台无 error/warn。
- 本批次没有生成 APK。

#### 已知限制

- WorkManager 和 AppWidget 周期更新都是系统调度任务，vivo 省电策略可能延迟，不能承诺秒级实时；手动刷新不受周期限制。
- 中冠每年赛事 ID 由足协生成，进入新赛季后仍需要在集中映射中补一条 ID。
- 正式应用内升级仍需要稳定下载地址、签名 release APK 和版本清单服务，本批次未加入发布服务器。
- lint 剩余警告主要来自 Capacitor 模板未使用资源和历史 splash 密度资源，不影响当前功能。

## 2026-06-22

### 发布批次：2.1.0 Debug APK

#### 用户目标

- 将 2026-06-21 完成的全项目整改版本打包为可安装 APK。

#### 发布调整

- npm 项目版本从 `2.0.0` 提升到 `2.1.0`。
- Android `versionName` 提升到 `2.1.0`。
- Android `versionCode` 从 `11` 提升到 `12`，确保手机可以将其识别为新版本更新安装。

#### 打包流程

- 运行 Web 核心测试和 JavaScript 静态检查。
- 重新生成 `www/` 并同步 Capacitor Android 资源。
- 使用项目构建脚本执行 Android `assembleDebug`。
- 验证 APK 文件、大小和 SHA-256。

#### 输出

- APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 本批次为 Debug 签名包，可使用 `adb install -r` 覆盖安装旧版。

#### 验证结果

- Web 核心测试：5/5 通过。
- Android `assembleDebug`：`BUILD SUCCESSFUL`。
- 包名：`com.local.sportscalendar`。
- APK 内部版本：`versionCode 12`、`versionName 2.1.0`。
- APK 大小：`4,753,016` 字节（约 `4.53 MiB`）。
- SHA-256：`38D73D8FAE67CB98DCD90D4333EC5098A3EAE45BC0C37410B298278F590FC733`。
- APK Signature Scheme v2：验证通过，签名者数量为 1。

### 修复及发布批次：2.1.1 图标显示

#### 用户反馈

- 安装 2.1.0 后打开 App，界面图标无法正常显示。

#### 原因与兼容性判断

- APK 内 Web 资源和 `INTERNET` 权限完整，远程 HTTPS 图片源也可访问。
- 电脑页面运行在 `http://127.0.0.1`，Android Capacitor WebView 使用安全本地域；旧数据中的 HTTP 队徽可能被 vivo WebView 作为混合内容拦截。
- 2.1.0 新增的 adaptive icon `monochrome` 直接引用彩色位图，部分 vivo 主题图标实现可能将其渲染为透明或不可见。
- 联赛图标此前全部依赖远程 CDN，任何 WebView、DNS、省电或网络策略异常都会造成整组图标空白。

#### 修复方案

1. 将 14 个联赛图标下载到 `public/assets/leagues/`，随 APK 本地打包，不再依赖启动时联网。
2. 增加本地 `public/assets/icon-fallback.png`，球队或赛程队徽加载失败时自动回退，不再留下空白。
3. Web 图片地址统一规范化：`http://` 和协议相对地址升级到 HTTPS，拒绝非图片安全协议。
4. 所有动态图片增加 `referrerpolicy="no-referrer"`，减少 CDN 对 WebView 本地域来源的兼容问题。
5. 原生组件读取旧赛程时同样将 HTTP 队徽升级为 HTTPS。
6. MainActivity 显式启用 WebView 自动加载图片和网络图片。
7. 撤回 adaptive icon 中不兼容的 `monochrome` 位图配置，恢复普通和圆形启动图标。
8. 增加图片 URL 规范化测试。
9. 版本提升为 `2.1.1`，Android `versionCode` 提升为 `13`。

#### 主要文件

- `public/assets/leagues/*`
- `public/assets/icon-fallback.png`
- `public/calendar-core.js`
- `public/app.js`
- `android/app/src/main/java/com/local/sportscalendar/MainActivity.java`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`

#### 发布验证

- Web 图片检查：120 张全部加载成功，0 失败；14 个联赛图标均使用本地资源；控制台无 error/warn。
- Web 核心测试：6/6 通过；JavaScript 静态检查通过。
- Android 单元测试、lint 和 `assembleDebug`：`BUILD SUCCESSFUL`，lint 0 error。
- APK 内包含 15 个新增本地图标资源。
- 包名：`com.local.sportscalendar`。
- APK 内部版本：`versionCode 13`、`versionName 2.1.1`。
- APK 大小：`5,323,250` 字节（约 `5.08 MiB`）。
- SHA-256：`BAAF0E711066BD1B5F9902AA02DBCE0FD42C1C8176F89D1346A96E9CDAF237CA`。
- APK Signature Scheme v2：验证通过，签名者数量为 1。
- APK：`android/app/build/outputs/apk/debug/app-debug.apk`。

## 2026-06-25

### 发布批次：2.1.2 左侧抽屉布局

#### 用户目标

- 将日历之外的内容改成左侧侧边栏，默认隐藏。
- 支持点击左上角小图标打开，也支持从屏幕左缘向右滑动打开。
- 侧边栏宽度大约覆盖屏幕左半到三分之二区域。
- 调整主日历尺寸和边框，让 App 打开后第一屏优先看到日历。
- 发布 2.1.2 Debug APK。

#### 实现方案

1. `index.html` 中将品牌、赛程管理、导入、统计、偏好、文件导入全部迁移进 `#sidebar`。
2. 主工作区只保留日历标题、左上角菜单按钮、月份切换按钮和日历主体。
3. 新增 `#sidebarOverlay` 遮罩、`#menuToggle` 打开按钮和 `#sidebarClose` 关闭按钮。
4. `public/styles.css` 将 `.sidebar` 改成固定定位抽屉，桌面宽度使用 `clamp(340px, 56vw, 760px)` 且不超过 `66vw`；移动端使用 `min(86vw, 430px)`。
5. 日历主区改为全宽显示，月历列宽使用 `repeat(7, minmax(0, 1fr))`，边框和移动端日格高度进一步收紧。
6. `public/app.js` 新增侧栏开合状态、遮罩关闭、Esc 关闭、左缘右滑打开和侧栏左滑关闭。
7. 版本提升为 npm `2.1.2`，Android `versionCode 14`、`versionName 2.1.2`。

#### 数据兼容

- 未修改 localStorage key 和赛程数据结构。
- 未修改原生小组件数据同步格式。
- 更新/删除/导入按钮只是移动位置，原有事件处理函数保持不变。

#### 涉及文件

- `index.html`
- `public/styles.css`
- `public/app.js`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- 浏览器移动端 390px 验证：打开页面无横向溢出，日历首屏可见，左上角按钮可打开侧栏。
- 浏览器桌面端 1280px 验证：侧栏打开宽度约 56% 屏宽，主日历铺满页面，控制台无 error/warn。
- `npm run build:web`：通过。
- `npm run sync:android`：通过。
- Android `testDebugUnitTest lintDebug assembleDebug`：通过。
- APK 内部版本：`versionCode 14`、`versionName 2.1.2`。
- APK 大小：`5,324,094` 字节（约 `5.08 MiB`）。
- SHA-256：`FE5DFDF44515C090972C2106D074EDE1529FE9F7A13ED68007842B0FAB3C7DCE`。
- APK Signature Scheme v2：验证通过，签名者数量为 1。
- APK：`android/app/build/outputs/apk/debug/app-debug.apk`。

#### 已知限制

- 抽屉滑动为轻量手势识别，只处理明显的水平滑动；复杂手势仍交给系统桌面或浏览器滚动。
- Debug APK 仍不是正式签名发布包；手机更新继续使用覆盖安装。

## 2026-06-30

### 功能调整：未来赛季更新判断与 NFL 接入

#### 用户目标

- 更新赛程时优先面向未来赛程，自动兼容当前赛季和下一赛季。
- 解决 NBA 新赛季赛程提前公布时，手机端点击“更新”可能仍只查旧赛季的问题。
- 新增 NFL 橄榄球联赛，支持按球队导入赛程。
- 每次修改结束时明确告知当前手机端最新 APK 版本，方便后续计算下一个版本号。

#### 实现方案

1. 新增 NFL 联赛配置：`sport: "football"`、`league: "nfl"`，并加入本地联赛图标 `public/assets/leagues/nfl.png`。
2. ESPN 球队赛程导入从原来的 NBA/MLB 扩展为 NBA/MLB/NFL。
3. ESPN 球队赛程请求新增未来赛季候选：同时查询当前赛季和下一赛季。
4. NBA/NFL 使用季前赛、常规赛、季后赛三个 `seasontype`；MLB 继续使用常规赛。
5. NFL 赛季年份按开赛年份计算；1-2 月仍归属上一年 NFL 赛季，避免季后赛期间查错年份。
6. 球队更新逻辑改为只有实际拉到赛事时才替换旧赛程；若下一赛季尚未开放或未拉到赛事，则保留原内容，避免空接口清空日历。
7. 更新完成状态文案加入“未拉到新赛程并保留原内容”的提示。

#### 数据兼容

- 未修改 localStorage key。
- 未修改小组件事件字段结构；NFL 赛事会沿用 ESPN 的 `sport/league/sourceId`，小组件后续实时比分刷新可使用 `football/nfl` scoreboard。
- 未发布新 APK，手机上已安装的最新包仍是 2.1.2；本次只是源码更新。

#### 涉及文件

- `public/app.js`
- `public/assets/leagues/nfl.png`
- `www/public/app.js`
- `www/public/assets/leagues/nfl.png`
- `context.md`

#### 验证结果

- ESPN NFL 球队列表接口：2026 赛季返回 32 支球队。
- ESPN NFL 球队赛程接口：2026 常规赛示例球队返回 17 场。
- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- `npm run build:web`：通过，并将 NFL 图标同步到 `www/`。

#### 已知限制

- 只有打包并安装新 APK 后，手机 App 才会获得 NFL 和未来赛季判断逻辑；当前手机已安装版本仍是 2.1.2。
- ESPN 如果尚未公开下一赛季接口，更新会保留原赛程，而不是生成占位赛程。

## 2026-07-04

### 修复批次：2.1.3 比分展示和主客队顺序

#### 用户目标

- 修复中甲等足球比赛未开始时显示“未开始”而不是 `0 - 0` 的问题。
- 修复足球赛中状态识别不够完整的问题。
- 足球比赛按主队在左、客队在右展示；NBA、MLB、NFL 等北美项目继续保持客队在左、主队在右。
- 保持本轮不自动打包 APK。

#### 问题原因

- Web 日历弹窗已对空比分做了部分兜底，但桌面组件的主显示仍然在比分为空时显示“未开始/进行中/已结束”。
- Web 和桌面组件此前统一按客队在左、主队在右渲染，没有区分足球习惯。
- TheSportsDB 的足球状态可能出现 `1H`、`2H`、`HT`、`ET`、`Match Finished` 等文本，原来的赛中/完赛识别覆盖不完整。

#### 实现方案

1. Web 端新增按项目类型生成展示顺序的逻辑：足球 `home-away`，非足球 `away-home`。
2. Web 日历格子和当天赛事弹窗都使用同一套左右队徽顺序。
3. Web 比分展示改为始终按左右队徽顺序输出比分；空值、空字符串、`null` 字符串统一兜底为 `0`。
4. Web 足球赛中状态识别补充 `1H`、`2H`、`ET`、`half` 等文本；完赛识别补充 `Match Finished`、`AET`、`PEN`。
5. 桌面组件同步改为：足球主队 logo 放左，非足球保持客队 logo 放左；中间大字始终显示比分，空比分显示 `0 - 0`。
6. 桌面组件下方小字继续显示状态和联赛名，赛中比分仍使用红色。
7. npm 版本提升到 `2.1.3`，Android `versionCode 15`、`versionName 2.1.3`；本轮未生成 APK。

#### 数据兼容

- 未修改 localStorage key。
- 未修改已导入赛事结构；只在读取和展示时清理比分空值。
- 小组件桥接字段保持兼容，已有 `sport` 字段用于判断足球/非足球展示顺序。

#### 涉及文件

- `public/app.js`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`
- `www/public/app.js`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- `npm run build:web`：通过。
- Android `:app:compileDebugJavaWithJavac`：通过。

#### 已知限制

- 当前手机已安装的最新 APK 仍是 2.1.2；只有打包并安装后，手机端才会变成 2.1.3。
- TheSportsDB/ESPN 如果赛事源本身没有实时比分，本地只能显示 `0 - 0` 兜底，不能凭空生成真实赛果。

### 修复批次：2.1.3 桌面组件 MLB 局数信息

#### 用户目标

- 桌面组件中的棒球比赛除了比分外，补充更有参考价值的比赛进度信息。

#### 实现方案

1. 桌面组件 MLB 状态文案优先解析 ESPN 的 `Top 5th`、`Bot 8th`、`Mid 6th`、`End 7th` 等状态。
2. 显示为中文短文案：`5局上`、`8局下`、`6局中`、`7局末`。
3. 对 `Delayed`、`Postponed`、`Suspended`、`Rain` 等状态增加 `延迟`、`暂停`、`雨停` 兜底。
4. 没有棒球专属状态时，继续沿用原来的 `进行中`、`已结束` 或北京时间开赛时间。
5. 增加 Android 单元测试，覆盖 MLB 小组件局数文案。

#### 涉及文件

- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/test/java/com/local/sportscalendar/WidgetGameStatusTest.java`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- Android `:app:testDebugUnitTest`：通过。

#### 已知限制

- 局数信息依赖 ESPN 返回的状态文本；如果数据源没有提供上下半局，只能退回通用状态。
- 本轮未打包 APK，手机当前已安装版本仍是 2.1.2；源码准备版本仍是 2.1.3。

## 2026-07-06

### 发布批次：2.1.3 Debug APK

#### 用户目标

- 发布当前源码准备好的 2.1.3 新版本 APK。
- 将此前未打包的 2.1.3 修复和功能一起交付到可安装包。

#### 本版包含

1. 左侧抽屉式侧边栏布局。
2. 新增 NFL 联赛和本地 NFL 联赛图标。
3. NBA/MLB/NFL 球队更新时同时尝试当前赛季和下一赛季，避免新赛季提前公布时抓不到。
4. 更新赛程时只有实际拉到赛事才替换旧赛程，空接口会保留原内容。
5. 足球比赛按主队在左、客队在右展示；NBA、MLB、NFL 继续客队在左、主队在右。
6. 未开始或无比分的比赛统一以 `0 - 0` 兜底。
7. 桌面组件同步修复比分、主客队顺序和足球状态识别。
8. 桌面组件 MLB 补充局数信息，例如 `5局上`、`8局下`、`6局中`、`7局末`。
9. App logo 候选图资源加入项目，用于后续正式替换启动图标。

#### 发布流程

- 运行 Web 静态检查和核心测试。
- 同步 Capacitor Android 资源。
- 使用 Gradle 执行 `testDebugUnitTest lintDebug assembleDebug`。
- 验证 APK 文件、内部版本、应用名、签名和 SHA-256。

#### 输出

- APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 包名：`com.local.sportscalendar`
- 应用名：`观赛日记`
- 内部版本：`versionCode 15`、`versionName 2.1.3`
- APK 大小：`6,890,541` 字节（约 `6.57 MiB`）
- SHA-256：`93A5D01D0CE36EB508AEB1254AC9D0AEE4E377C5717F8CCB62D5E549B276D3C9`
- APK Signature Scheme v2：验证通过，签名者数量为 1。

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- `npm run sync:android`：通过。
- Android `testDebugUnitTest lintDebug assembleDebug`：`BUILD SUCCESSFUL`。
- `aapt dump badging`：确认包名、`versionCode 15`、`versionName 2.1.3` 和应用名 `观赛日记`。
- `apksigner verify --verbose`：验证通过。

#### 已知限制

- 本包仍是 Debug 签名 APK，适合个人测试和覆盖安装，不是应用商店发布签名。
- 手机需要安装这份 2.1.3 APK 后，才能获得 NFL、新赛季更新判断、比分顺序和 MLB 组件信息等新功能。

## 2026-07-07

### 修复批次：2.1.4 中国职业联赛实时比分与赛中状态

#### 用户目标

- 修复中乙比分不够实时的问题。
- 修复比赛进行中比分没有变红的问题。
- 检查所有联赛的数据刷新和状态识别链路。
- 本轮只修源码和网页资源，不自动打包 APK。

#### 问题原因

- 中甲/中乙原先使用 TheSportsDB v1 赛程接口；该接口能返回赛程和赛果，但赛中状态与比分更新并不稳定。
- TheSportsDB 的真正 livescore 属于 v2 premium API，免费 `123` key 无法直接使用。
- 旧状态识别只覆盖了部分 ESPN/TheSportsDB 文本，遗漏了 `Played`、`Playing`、`Q1/Q2`、`IN5`、`BT`、分钟进度等状态。
- 老版本已导入的中乙球队使用 TheSportsDB 英文球队 ID；如果直接切到官方 CFL 中文 ID，更新时会按 ID 匹配失败。

#### 实现方案

1. 将中超、中甲、中乙的新导入和更新切换到中国足球职业联赛联合会官方 CFL 接口：
   - 中超：`CSL`
   - 中甲：`CL1`
   - 中乙：`CL2`
2. 新增 CFL 赛季发现与整季赛程抓取逻辑，使用当前 active 赛季的 `tournament_calendar_id` 拉取 `matches/page`。
3. 新增 CFL 赛事标准化：
   - 比分优先读取 `total_home_score` / `total_away_score`。
   - `ft_*`、`ht_*` 作为兜底。
   - 队徽读取官方 `home_contestant_icon` / `away_contestant_icon`。
   - 足球继续按主队 logo 在左、客队 logo 在右展示。
4. 桌面组件新增 `dataSource: "cfl"` 刷新链路，组件刷新时会重新请求 CFL 官方赛程并更新比分、状态和队徽。
5. 扩展 Web 与 Android 组件的通用状态识别：
   - 赛中：`Playing`、`1H`、`2H`、`HT`、`ET`、`BT`、`P`、`OT`、`Q1-Q4`、`IN1-IN9`、分钟进度等。
   - 完赛：`Played`、`FT`、`AET`、`AOT`、`PEN`、`Final`、`Match Finished`、`已结束`、`完场` 等。
6. TheSportsDB 老数据兼容补充 `strProgress`，避免旧导入赛事在有进度文本时仍被当作未开始。
7. 球队匹配逻辑改为先按 ID 匹配，失败后继续按中英文队名匹配，保证旧 TheSportsDB 导入的中乙球队点击“更新”后能迁移到 CFL 官方赛程。
8. 源码版本提升到 `2.1.4`，Android `versionCode` 提升到 `16`；本轮未生成 APK。

#### 涉及文件

- `public/app.js`
- `www/public/app.js`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/test/java/com/local/sportscalendar/WidgetGameStatusTest.java`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。
- `npm run build:web`：通过，已同步到 `www/`。

#### 已知限制

- 本轮没有自动打包 APK；手机已安装的最新发布版仍是 `2.1.3`。
- 当前源码准备版本为 `2.1.4`，下次打包会生成 `versionCode 16`、`versionName 2.1.4`。
- CFL 官方接口能提供中超/中甲/中乙官方赛程、赛果和可能的赛中状态；如果官方接口本身未在比赛过程中更新比分，本地无法凭空生成真实赛中比分。
- TheSportsDB v2 livescore 需要 premium API key；当前项目仍不内置付费 key。

### 修复批次：2.1.4 桌面组件空白区域点击进入 App

#### 用户目标

- 点击桌面组件空白处也能进入 App。
- 保持刷新、上翻、下翻按钮的原有独立行为。
- 本轮不自动打包 APK。

#### 问题原因

- `widget_root` 已经绑定了打开 App 的点击事件，但比赛列表 `ListView` 固定高度覆盖了大部分内容区。
- 当今日只有 0-2 场比赛时，`ListView` 内部剩余空白不是实际列表 item，触摸不会传回根布局，因此点击空白处没有反应。

#### 实现方案

1. 小组件列表工厂最少返回 3 行，和组件可视窗口保持一致。
2. 如果真实比赛不足 3 行，补透明空白行。
3. 空白行不显示队徽、时间、比分、联赛文字，但保留 `setOnClickFillInIntent`，点击后使用列表模板打开 App。
4. 修复空白行的稳定 ID，避免少于 3 场比赛时 `getItemId` 越界。

#### 涉及文件

- `android/app/src/main/java/com/local/sportscalendar/SportsWidgetService.java`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `context.md`

#### 验证结果

- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- 这次只修改源码，没有生成新的 APK；手机已安装的最新发布版仍是 `2.1.3`。

### 功能批次：2.1.4 桌面组件2 单场详细卡片

#### 用户目标

- 新增第二个桌面组件。
- 之前的 4x4 今日比赛列表命名为“组件1”。
- 新组件命名为“组件2”，体积为 2x2。
- 组件2 一次只显示一场比赛，比赛信息比组件1更详细。
- 组件2 支持通过滑动切换不同比赛。
- 本轮不自动打包 APK。

#### 实现方案

1. 新增 `MatchDetailWidgetProvider`，作为独立 AppWidget provider 注册到 Android。
2. 新增 `SportsDetailWidgetService`，为组件2提供单场比赛卡片数据。
3. 组件2 使用 Android `StackView` 作为桌面小组件集合控件，每个 item 是一场比赛，桌面上可滑动切换。
4. 新增 2x2 widget provider 配置：
   - `targetCellWidth="2"`
   - `targetCellHeight="2"`
   - `minWidth="110dp"`
   - `minHeight="110dp"`
5. 组件2详细卡片展示：
   - 左右队徽
   - 左右队名
   - 北京时间开赛时间
   - 比分
   - 比赛状态
   - 联赛名
   - 场馆/城市（有数据时显示）
6. 组件2复用组件1的今日比赛缓存、实时比分刷新、队徽缓存和状态识别逻辑，避免两个组件数据不一致。
7. 修改周期刷新调度：只要组件1或组件2任意一个存在，就保留 15 分钟刷新；两个组件都移除后才取消。
8. Web 同步给小组件的数据新增 `venue`、`city` 字段，用于组件2详细展示。
9. Widget picker 文案调整：
   - `观赛日记 组件1`
   - `观赛日记 组件2`

#### 涉及文件

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/local/sportscalendar/MatchDetailWidgetProvider.java`
- `android/app/src/main/java/com/local/sportscalendar/SportsDetailWidgetService.java`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/res/layout/widget_match_detail.xml`
- `android/app/src/main/res/layout/widget_detail_game_item.xml`
- `android/app/src/main/res/drawable/widget_detail_card_background.xml`
- `android/app/src/main/res/xml/match_detail_widget_info.xml`
- `android/app/src/main/res/xml-v31/match_detail_widget_info.xml`
- `android/app/src/main/res/values/strings.xml`
- `public/app.js`
- `www/public/app.js`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `npm test`：6 项通过。
- `npm run build:web`：通过，已同步到 `www/`。
- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- Android 桌面小组件不能实现网页那种完全自定义手势；组件2使用系统支持的 `StackView` 切换卡片，具体滑动手感会受 vivo 桌面启动器影响。
- 本轮没有打包 APK；手机已安装的最新发布版仍是 `2.1.3`，当前源码准备版仍为 `2.1.4`。

### 文档批次：用户版版本更迭说明

#### 用户目标

- 按此前对话内容整理一份简洁易懂的版本更迭说明。
- 文档面向使用用户，而不是开发调试记录。
- 以后每次更新版本都要继续维护这份 md 文件。

#### 实现方案

1. 新增 `CHANGELOG.md`。
2. 按版本整理：
   - `2.1.4` 源码准备中，未发布。
   - `2.1.3` 已发布。
   - `2.1.2` 已发布。
   - `2.1.1` 已发布。
   - `2.1.0` 已发布。
   - 早期静态网页阶段。
3. 将技术实现细节改写成用户能理解的功能变化。
4. 在文档顶部标明当前手机端最新发布版和当前源码准备版。

#### 涉及文件

- `CHANGELOG.md`
- `context.md`

### 发布批次：2.1.4 Debug APK

#### 用户目标

- 发布当前 2.1.4 新版本 APK。
- 将 2.1.4 源码中已经完成的修复、数据源调整和组件2功能交付成可安装包。

#### 本版包含

1. 中超、中甲、中乙切换到 CFL 官方赛程数据源。
2. 修复中乙比分更新不及时、赛中比分不变红的问题。
3. 扩展所有联赛的赛中/完赛状态识别。
4. 桌面组件空白区域点击可进入 App。
5. 原 4x4 桌面组件命名为“观赛日记 组件1”。
6. 新增 2x2 桌面组件“观赛日记 组件2”，一次显示一场比赛，可滑动切换，并展示更详细信息。
7. 组件1 和组件2 共用关注比赛数据、比分刷新和队徽缓存。
8. 新增用户版版本更迭说明 `CHANGELOG.md`，并补齐 2.1.0 之前版本记录。

#### 发布流程

- 运行 Web 静态检查和核心测试。
- 同步 Capacitor Android 资源。
- 使用 Gradle 执行 Android 构建、单元测试和 lint。
- 验证 APK 文件、内部版本、应用名、签名和 SHA-256。
- 将 `CHANGELOG.md` 中 2.1.4 状态改为已发布。

#### 输出

- APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 包名：`com.local.sportscalendar`
- 应用名：`观赛日记`
- 内部版本：`versionCode 16`、`versionName 2.1.4`
- APK 大小：`6,901,177` 字节（约 `6.58 MiB`）
- SHA-256：`26E02121ECB51866B7409FC37BDBC4F31D249EA29155F2B60596424D1A25C571`
- APK Signature Scheme v2：验证通过，签名者数量为 1。

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- `npm run build:android`：`BUILD SUCCESSFUL`。
- Android `:app:testDebugUnitTest :app:lintDebug`：`BUILD SUCCESSFUL`。
- `aapt dump badging`：确认包名、`versionCode 16`、`versionName 2.1.4` 和应用名 `观赛日记`。
- `apksigner verify --verbose`：验证通过。

#### 已知限制

- 本包仍是 Debug 签名 APK，适合个人测试和覆盖安装，不是应用商店发布签名。
- 安装这份 2.1.4 APK 后，手机端才会获得 CFL 数据源、组件2、组件空白区域点击进入 App 等新功能。

## 2026-07-08

### 修复批次：2.1.5 桌面启动图标外框

#### 用户目标

- 修复新版本测试中桌面图标又显示为默认图标和外框的问题。
- 本轮只修源码，不自动打包 APK。

#### 问题原因

- Android `mipmap-anydpi-v26` 目录仍保留 Capacitor 默认 adaptive icon XML。
- Android 8.0 及以上系统会优先使用 adaptive icon，导致 vivo 桌面继续显示默认白底外框和前景图层。
- 普通密度目录里的 `ic_launcher.png` 也仍是默认 Capacitor 图标。

#### 实现方案

1. 使用此前生成的卡通蓝色 App logo 作为启动图标源图。
2. 重新生成 `mipmap-mdpi`、`mipmap-hdpi`、`mipmap-xhdpi`、`mipmap-xxhdpi`、`mipmap-xxxhdpi` 下的：
   - `ic_launcher.png`
   - `ic_launcher_round.png`
   - `ic_launcher_foreground.png`
3. 删除 `mipmap-anydpi-v26/ic_launcher.xml` 和 `mipmap-anydpi-v26/ic_launcher_round.xml`，避免系统优先使用 adaptive icon 分层配置。
4. 源码版本提升到 `2.1.5`，Android `versionCode 17`、`versionName 2.1.5`；本轮未生成 APK。
5. `CHANGELOG.md` 新增 `2.1.5` 源码准备记录。

#### 涉及文件

- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`
- `CHANGELOG.md`
- `context.md`

#### 验证结果

- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- 本轮没有自动打包 APK；手机已安装的最新发布版仍是 `2.1.4`。
- 需要打包并安装 2.1.5 APK 后，手机桌面图标才会更新。

### 修复批次：2.1.5 桌面组件行卡片和队徽可见性

#### 用户目标

- 修复桌面组件中比赛行只显示文字，球队 logo 和浅色卡片框都不显示的问题。
- 本轮只修源码，不自动打包 APK。

#### 问题原因

- 组件1为了“少于三场时空出剩余行”，会渲染空白行。
- 空白行会把比赛行背景设置为透明，并把左右队徽设置为不可见。
- Android 桌面组件的 `ListView`/`RemoteViews` 会复用 item 视图；真实比赛行此前没有显式恢复背景和队徽可见性，所以部分桌面启动器会把空白行状态带到真实比赛行。

#### 实现方案

1. `renderGame` 渲染真实比赛前，先恢复 `widget_row_background` 卡片背景。
2. `renderGame` 和 `renderEmpty` 都显式恢复左右队徽为 `View.VISIBLE`。
3. `setLogo` 在设置缓存队徽或占位队徽前，也会把对应 `ImageView` 设为可见。
4. 新增 `widget_blank_game_item.xml`，补位空白行使用独立透明布局，不再复用真实比赛行布局。
5. `SportsWidgetService` 将集合视图类型数量改为 2，让 Android 桌面组件区分“比赛行”和“空白行”。
6. 所有联赛和赛事来源的组件比赛展示最终都会走 `renderGame`，因此 MLB、NBA、NFL、世界杯、中超/中甲/中乙等真实比赛行都会强制恢复卡片背景和队徽可见性。
7. `CHANGELOG.md` 的 `2.1.5` 源码准备记录补充本次桌面组件修复。

#### 涉及文件

- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/java/com/local/sportscalendar/SportsWidgetService.java`
- `android/app/src/main/res/layout/widget_blank_game_item.xml`
- `CHANGELOG.md`
- `context.md`

#### 验证结果

- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- 本轮没有自动打包 APK；手机已安装的最新发布版仍是 `2.1.4`。
- 需要打包并安装 2.1.5 APK 后，手机桌面组件才会获得本次修复。

### 文档批次：补充分拆 2.1.0 之前版本

#### 用户目标

- `2.1.0` 之前的版本也需要分开记录。
- 仍保持面向使用用户、简洁易懂。

#### 实现方案

1. 将原来的“早期静态网页阶段”拆分为：
   - `2.0.0` App 打包准备版。
   - `1.7.0` 桌面小组件初版。
   - `1.6.0` Android App 初步包装。
   - `1.5.0` 赛程管理增强。
   - `1.4.0` 更多联赛与数据源。
   - `1.3.0` 日历与比赛详情。
   - `1.2.0` 球队导入与队徽。
   - `1.1.0` 界面和移动端优化。
   - `1.0.0` 静态网页初版。
2. 保留 `2.1.0` 之后已发布版本的原有结构。
3. 对未单独发布 APK 的早期阶段，用标题说明其性质，避免和已发布 APK 混淆。

#### 涉及文件

- `CHANGELOG.md`
- `context.md`

## 2026-07-09

### 发布批次：2.1.5 Debug APK

#### 用户目标

- 发布当前 2.1.5 新版本 APK。
- 将 2.1.5 中的桌面启动图标修复、桌面组件队徽/卡片框修复一起交付成可安装包。

#### 本版包含

1. 修复 vivo 桌面图标显示成默认 Capacitor 图标和外框的问题。
2. 将启动图标替换为观赛日记卡通蓝色 App logo。
3. 移除 Android adaptive icon XML，避免系统优先使用旧的分层图标。
4. 修复桌面组件比赛行的队徽和浅色卡片框偶尔不显示的问题。
5. 新增 `widget_blank_game_item.xml`，补位空白行使用独立透明布局。
6. 组件真实比赛行强制恢复卡片背景和队徽可见性，覆盖所有联赛和赛事来源。

#### 发布流程

- 运行 Web 静态检查和核心测试。
- 执行 `npm run build:android` 同步 Web 资源并生成 Debug APK。
- 运行 Android `testDebugUnitTest` 和 `lintDebug`。
- 验证 APK 文件、内部版本、应用名、联网权限、桌面组件声明、签名和 SHA-256。
- 确认 APK 中包含 `widget_blank_game_item.xml`，且不再包含 `mipmap-anydpi-v26/ic_launcher.xml`。
- 将 `CHANGELOG.md` 中 2.1.5 状态改为已发布。

#### 输出

- APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 包名：`com.local.sportscalendar`
- 应用名：`观赛日记`
- 内部版本：`versionCode 17`、`versionName 2.1.5`
- APK 大小：`7,263,244` 字节（约 `6.93 MiB`）
- SHA-256：`144772E59893483775E9FAAB14F1C9E1F76CACAB23F39B6876494343744848D4`
- APK Signature Scheme v2：验证通过，签名者数量为 1。

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：6 项通过。
- `npm run build:android`：`BUILD SUCCESSFUL`。
- Android `:app:testDebugUnitTest :app:lintDebug`：`BUILD SUCCESSFUL`。
- `aapt dump badging`：确认包名、`versionCode 17`、`versionName 2.1.5`、应用名 `观赛日记`、`INTERNET` 权限和 `app-widget` 声明。
- `apksigner verify --verbose`：验证通过。
- `aapt list`：确认 APK 包含 `res/layout/widget_blank_game_item.xml`，不包含旧的 `mipmap-anydpi-v26/ic_launcher.xml`。

#### 已知限制

- 本包仍是 Debug 签名 APK，适合个人测试和覆盖安装，不是应用商店发布签名。
- 手机需要安装这份 2.1.5 APK 后，才能获得桌面图标和桌面组件显示修复。

### 修复批次：2.1.6 未来比赛误显示进行中

#### 用户目标

- 修复未来比赛在日历详情弹窗中被误显示为“进行中”的问题。
- 同步避免桌面组件出现同类误判。
- 本轮只修源码，不自动打包 APK。

#### 问题原因

- Web 与 Android 状态识别里都把 `07:10`、`7:10 PM` 一类时间文本当成了实时状态。
- ESPN 等数据源的未来赛事可能会把开赛时间放进 status 文本，导致未来比赛被误判为进行中。
- 旧逻辑只看 `statusState` 和 status 文本，没有把“比赛开始时间仍在未来”作为硬性兜底。

#### 实现方案

1. 在 `public/calendar-core.js` 新增可测试的共享状态判断：
   - `isEventLive`
   - `isEventFinished`
   - `isEventFuture`
   - `isLiveStatusText`
   - `isFinishedStatusText`
2. Web 日历弹窗改为复用 `CalendarCore.isEventLive` 和 `CalendarCore.isEventFinished`。
3. 未来开赛时间超过当前时间 5 分钟时，强制不显示为进行中。
4. 移除纯时间格式对“进行中”的触发，`07:10`、`7:10 PM` 不再被识别为 live。
5. Android 桌面组件同步加入未来时间兜底，并移除纯时间格式 live 识别。
6. 源码版本提升到 `2.1.6`，Android `versionCode 18`、`versionName 2.1.6`；本轮未生成 APK。
7. `CHANGELOG.md` 新增 `2.1.6` 源码准备记录。

#### 涉及文件

- `public/calendar-core.js`
- `public/app.js`
- `www/public/calendar-core.js`
- `www/public/app.js`
- `tests/calendar-core.test.js`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/test/java/com/local/sportscalendar/WidgetGameStatusTest.java`
- `package.json`
- `package-lock.json`
- `android/app/build.gradle`
- `CHANGELOG.md`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：7 项通过。
- `npm run build:web`：通过，已同步到 `www/`。
- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- 本功能批次完成时尚未打包；随后已在同日发布为 `2.1.6`。
- 当前源码准备版本为 `2.1.6`，下次发布可从 2.1.6 打包。

## 2026-07-10

### 功能批次：2.1.6 图片加载、App 图标、标题框和组件日期切换

#### 用户目标

- 修复点进 App 后图片加载太慢的问题。
- App logo 改为用户提供的像素小人，并在四个角落加入足球、篮球、棒球和橄榄球元素。
- “体育迷日历”标题框去掉其他元素，只保留这五个字。
- 桌面组件支持切换日期查看关注比赛。
- 本轮只修源码，不自动打包 APK。

#### 实现方案

1. Web 图片加载：
   - `renderImage` 为远程图片添加 `loading="lazy"`、`decoding="async"`。
   - 新增本地 data URL 图片缓存，远程队徽加载成功后尝试缓存到 `localStorage`。
   - 下次打开 App 时，缓存命中的队徽优先从本地读取。
   - 缓存设定为最多 120 张、约 4MB，并自动清理旧图。
2. Android WebView：
   - 开启 DOM Storage。
   - 使用默认 WebView 缓存策略。
   - 保持自动加载图片，并允许网络图片。
   - Android M 及以上开启 offscreen pre-raster，减少页面进入后的首屏绘制等待。
3. App 图标：
   - 使用用户提供的像素小人图片生成 `public/assets/branding/app-logo-runner-v2.png`。
   - 四角新增足球、篮球、棒球和橄榄球元素。
   - 重新生成 `mipmap-mdpi`、`mipmap-hdpi`、`mipmap-xhdpi`、`mipmap-xxhdpi`、`mipmap-xxxhdpi` 下的启动图标资源。
4. 标题框：
   - 删除侧边栏标题中的 `SC` 标识和英文副标题。
   - 标题框只保留 `体育迷日历`。
5. 桌面组件：
   - 组件1顶部按钮改为前一天/后一天。
   - 新增 `selected_day_offset` 偏移量，保存在 `sports_widget` SharedPreferences。
   - 组件1列表读取所选日期的关注比赛，而不是固定读取今天。
   - 组件2复用同一份所选日期数据，跟随组件1切换日期。
   - 当前日期仍按北京时间计算。

#### 涉及文件

- `index.html`
- `public/styles.css`
- `public/app.js`
- `www/index.html`
- `www/public/styles.css`
- `www/public/app.js`
- `public/assets/branding/app-logo-runner-v2.png`
- `www/public/assets/branding/app-logo-runner-v2.png`
- `android/app/src/main/java/com/local/sportscalendar/MainActivity.java`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/java/com/local/sportscalendar/SportsDetailWidgetService.java`
- `android/app/src/main/res/layout/widget_mlb_today.xml`
- `android/app/src/main/res/drawable/ic_widget_chevron_left.xml`
- `android/app/src/main/res/drawable/ic_widget_chevron_right.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `CHANGELOG.md`
- `context.md`

#### 验证结果

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：7 项通过。
- `npm run build:web`：通过，已同步到 `www/`。
- Android `:app:testDebugUnitTest`：`BUILD SUCCESSFUL`。

#### 已知限制

- Android 桌面小组件不支持网页式自由横向手势，本轮使用系统稳定支持的左右日期按钮实现日期切换。
- 首次打开时远程队徽仍需要下载；缓存命中后再次打开会更快。
- 部分第三方图片源如果禁止 CORS fetch，本地缓存会跳过，但原始 `<img>` 加载路径仍可用。
- 本功能批次完成时尚未打包；随后已在同日发布为 `2.1.6`。

### 发布批次：2.1.6 APK

#### 发布内容

- 将当前源码正式打包为观赛日记 `2.1.6`。
- Android `versionCode` 为 `18`，`versionName` 为 `2.1.6`。
- APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。

#### 发布验证

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：7 项通过。
- `npm run build:android`：`BUILD SUCCESSFUL`。
- Android `:app:testDebugUnitTest`：9 项通过，0 失败。
- Android `:app:lintDebug`：`BUILD SUCCESSFUL`，无阻断发布错误。
- APK 包名：`com.local.sportscalendar`。
- APK 应用名：`观赛日记`。
- APK v2 签名验证：通过（Android Debug 签名）。
- APK 大小：`7,380,680` 字节。
- APK SHA-256：`C6DF920C718BD914B68DF9EDACE5955C03B8B7CCF468EB7F079E143A84D2405E`。

#### 版本状态

- 手机端最新发布版本：`2.1.6`。
- 当前源码准备版本：`2.1.6`（与已发布版本一致）。

## 2026-07-11

### 修复批次：2.1.7 启动性能、弹窗刷新、组件切日和中超实时比分

#### 用户反馈

- 日历日期弹窗打开、关闭或刷新时部分队徽闪烁。
- App 启动仍会先显示白色，等待 1—2 秒才完整出现。
- 历史比赛先显示旧 `0 - 0` 或旧状态，再跳到当前赛果。
- 桌面组件日期按钮偶尔需要点击两三次，希望加入三个圆点导航并尝试左右滑动。
- 中超比赛进行中不更新比分，组件刷新按钮也没有效果。

#### 根因

- 弹窗刷新和全局 `render()` 会重建日历与弹窗的全部 `<img>` 节点，触发队徽重新解码。
- Android 原启动图为白色 Capacitor 默认页，WebView 初始背景也是白色。
- 弹窗先展示本地旧记录，再异步请求比分，并在完成后整页重绘。
- 组件日期切换与网络比分刷新共用单线程执行器；CFL 请求超时会堵住后续日期点击。
- 旧日期网络任务完成后可能按新日期键写入显示缓存，覆盖用户刚切换的日期。
- CFL 中超 API 在本轮检查中持续超时；ESPN `chn.1` 同日接口能返回实时分钟、状态和比分。

#### 实现

1. Web 弹窗与图片：
   - 弹窗比分刷新改为按 `data-event-id` 原位更新文字，不再重建队徽节点或整个月历。
   - 当前月份队徽在空闲时预加载；弹窗队徽使用 eager/high priority 加载并写入宽高。
   - 同一天刷新请求合并，60 秒内复用最新结果，避免重复网络请求。
   - 启动后后台刷新今天和昨天的已关注比赛。
   - 对尚未验证且已经开赛的旧 `0 - 0`，刷新期间显示“正在同步”。
2. App 启动：
   - 新增浅米色 `launch_screen` 与 `splash_background`。
   - Android SplashScreen 使用当前 App 图标，并在结束后进入无 ActionBar 主题。
   - WebView 和 HTML 首屏背景同步设置为 `#FBF4EA`，消除白色闪屏反差。
3. 桌面组件日期：
   - 日期偏移写入后立即读取本地比赛并刷新组件，后台再拉取实时比分。
   - 网络任务固定自己的日期键，用户切日后旧任务不得覆盖新日期。
   - 顶部前后日期按钮点击宽度增加到 `30dp`。
   - 底部新增过去、今天、未来三个圆点，可点左/右继续切日，点中间回到今天。
4. 中超数据：
   - Web 中超由 CFL 切换为 ESPN `soccer/chn.1`，赛季范围固定按自然年。
   - 加入 2026 中超 16 支球队的中英文别名，旧 CFL 中文球队点击一次“更新”即可迁移。
   - 球队缩写改为精确匹配，避免 `CHE` 等短字符串误命中其他球队。
   - 迁移和比分刷新时保留旧记录中的非空队徽，避免 ESPN 暂缺队徽时退回通用图标。
   - Android 组件对旧 CFL 中超记录直接使用 ESPN 按双方球队匹配实时比赛，并跳过超时的 CFL 中超请求。

#### 验证

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：7 项通过。
- `npm run build:web`：通过，已同步到 `www/`。
- Android `:app:testDebugUnitTest`：11 项通过，0 失败。
- Android `:app:lintDebug`：`BUILD SUCCESSFUL`。
- 本地浏览器实测：中超 16 支球队正常加载；成都蓉城旧数据更新后为正确的 30 场；比分弹窗刷新前后队徽图片源保持一致；移动端布局正常；控制台 0 错误。
- ESPN `chn.1` 同日数据验证：能返回中超进行中分钟、实时比分和完赛状态。

#### 限制与版本状态

- Android 桌面组件基于 `RemoteViews`，vivo 启动器会优先接管水平手势，因此无法保证网页式自由左右滑动；本版使用更大的前后按钮和三个圆点实现稳定切日。
- 功能开发完成时未自动打包；随后已按用户要求发布为 `2.1.7`。
- 当前源码与最新发布版本均为 `2.1.7`，Android `versionCode 19`。

### 发布批次：2.1.7 APK

#### 发布内容

- 将本轮启动性能、弹窗刷新、组件切日和中超实时比分修复正式发布为 `2.1.7`。
- Android `versionCode` 为 `19`，`versionName` 为 `2.1.7`。
- APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。

#### 发布验证

- `node --check public/app.js`：通过。
- `node --check public/calendar-core.js`：通过。
- `npm test`：7 项通过。
- Android `:app:testDebugUnitTest`：11 项通过，0 失败。
- Android `:app:lintDebug`：`BUILD SUCCESSFUL`。
- `npm run build:android`：`BUILD SUCCESSFUL`。
- APK 包名：`com.local.sportscalendar`。
- APK 应用名：`观赛日记`。
- APK v2 签名验证：通过（Android Debug 签名）。
- APK 大小：`7,389,044` 字节。
- APK SHA-256：`4D11C68A012273C7DF8577C26FDA1E434FF920031DAB8CAEDD4CA5F9983DC6CC`。

#### 版本状态

- 手机端最新发布版本：`2.1.7`。
- 当前源码准备版本：`2.1.7`（与已发布版本一致）。
- 下一版本号建议使用 `2.1.8`。

## 2026-07-12

### 修复批次：2.1.8 全项目 1-19 稳定性重构

#### 用户目标

- 修复 2.1.7 代码审查列出的全部 19 项稳定性、安全、性能和工程问题。
- 写一份非开发者也能理解的逐项修复报告。
- 按既有约定只修改和验证，不自动生成 APK。

#### 根因

- 功能快速增加后，Web 页面、第三方数据源、组件刷新和存储职责集中在少数大文件中。
- AppWidgetProvider 使用普通线程执行长网络任务，广播结束后可能被系统终止。
- 状态规则依赖宽泛字符串匹配，中国足协数据又缺少明确赛中字段，导致赛中/完赛误判。
- Web 和组件都使用单个大 JSON 字符串存储，没有可靠备份、容量边界和恢复流程。
- 早期仓库直接提交了依赖目录与构建产物，导致版本差异噪声很大。

#### 实现

1. Web 状态改为未开始、进行中、已结束、延期、取消五态；数据合并保留已有非空比分、队徽和字段。
2. 新增 `calendar-storage.js`，使用 IndexedDB 的 meta/events 分离存储，并保留最近两份快照；旧 v5 自动迁移。
3. 文件导入限制为 5 MB、10000 场和前后 10 年；颜色只接受十六进制，URL 只接受 HTTPS。
4. 启动时延迟球队列表和比分刷新；月份队徽预热限制为 24 张、4 并发。
5. 全球队更新改为联赛 3 并发、球队 4 并发；单请求最多 2 次、10 秒超时，失败保留旧赛程。
6. 世界杯赛期按四年周期计算；中冠赛事 ID 按年度生成。
7. Android 手动/自动刷新统一交给 WorkManager；失败进入重试并保存更新时间或错误状态。
8. 新增 `GameStatus`、`WidgetNetworkClient`、`WidgetEventStore` 和 `WidgetActionReceiver`，拆分状态、网络、存储和内部广播职责。
9. 原生 JSON 限制 5 MB；队徽限制 2 MB 和 1600 万像素，按目标尺寸采样解码。
10. 组件日期、显示缓存和数据服务按 `appWidgetId` 隔离；组件2继续独立读取今天比赛。
11. 删除未使用 FileProvider，关闭备份/设备迁移，禁止 WebView 混合 HTTP 内容。
12. 正式构建要求独立签名环境变量，开启 R8 压缩与资源收缩；Debug 流程保持不变。
13. 新增 `.gitignore`，从 Git 索引移除 `node_modules` 与生成后的 `www`。

#### 数据兼容

- Web 旧 `sports-fan-calendar:v5` 数据保留并自动迁移，损坏记录不会被直接删除。
- 组件仍可读取旧 `events_json`，App 下一次同步后写入 `files/widget/events.json` 原子文件。
- 升级后的组件日期默认回到今天，此后各组件独立记忆日期。

#### 涉及文件

- `public/app.js`
- `public/calendar-core.js`
- `public/calendar-storage.js`
- `public/calendar-image-cache.js`
- `android/app/src/main/java/com/local/sportscalendar/GameStatus.java`
- `android/app/src/main/java/com/local/sportscalendar/WidgetNetworkClient.java`
- `android/app/src/main/java/com/local/sportscalendar/WidgetEventStore.java`
- `android/app/src/main/java/com/local/sportscalendar/WidgetActionReceiver.java`
- `android/app/src/main/java/com/local/sportscalendar/MlbTodayWidgetProvider.java`
- `android/app/src/main/java/com/local/sportscalendar/WidgetRefreshWorker.java`
- `android/app/src/main/AndroidManifest.xml`
- `.gitignore`
- `docs/2.1.8-stability-fix-report.md`

#### 验证

- JavaScript 四个脚本语法检查通过。
- Web 单元测试 12 项通过，包含状态边界、空字段合并、颜色校验和损坏存储恢复。
- Android JVM 测试 15 项通过，包含延期状态、中冠赛中比分判断和多组件日期键隔离。
- Android `lintDebug` 构建成功，警告由 41 条降至 26 条，无 Error/Fatal。
- `npm audit`：92 个依赖，0 个已知漏洞。
- `npm run sync:android` 成功，新 Web 模块已同步到 Android assets。
- NBA、MLB、NFL、英超、世界杯、中超、中甲/中乙和中冠数据源均实际返回 HTTP 200。
- Release 构建守卫在缺少签名环境变量时按预期拒绝构建。
- `git ls-files node_modules` 与 `git ls-files www` 均为 0。
- `npm run verify:stability`：19/19 项完成证据通过。

#### 限制与版本状态

- vivo 对 15 分钟周期任务仍可能因系统省电策略延后，这是 Android 调度限制；手动刷新现在使用可靠的一次性 Worker。
- 中冠接口没有明确赛中状态字段时采用开赛后 4 小时窗口判断，真实比分仍以官方数据为准。
- 本轮未连接真机，组件多实例和后台回收仍需要安装后做最终真机验收。
- 功能修复完成时未自动生成 APK；随后已按用户要求发布为 `2.1.8`。

### 发布批次：2.1.8 APK

#### 发布内容

- 将 1-19 项稳定性、安全、性能和工程修复正式打包为 `2.1.8`。
- Android `versionCode` 为 `20`，`versionName` 为 `2.1.8`。
- APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。

#### 发布验证

- `npm run build:android`：`BUILD SUCCESSFUL`。
- APK 包名：`com.local.sportscalendar`。
- APK 应用名：`观赛日记`。
- APK v2 签名验证：通过（Android Debug 签名）。
- APK 大小：`7,397,005` 字节。
- APK SHA-256：`6335875EEB449F044C5A6569D9F2192B0A371023F0FCAEF9DAE80793B173E58F`。

#### 版本状态

- 最新已发布 APK：`2.1.8`。
- 当前源码版本：`2.1.8`（与 APK 一致）。
- 下一版本号建议使用 `2.1.9`。

### 开发批次：2.1.9 侧边栏检查更新

#### 用户目标

- 在左拉列表最下面新增“检查更新”组件。
- 用户主动点击后连接远程版本清单，判断手机是否已有新版本。
- 本轮不自动生成 APK。

#### 结构与实现

1. `index.html` 在侧边栏末尾新增应用更新面板，包含当前版本、状态、检查按钮、更新说明和下载按钮。
2. `public/app-update.js` 负责远程清单校验、HTTPS 地址限制、版本号比较、64 KB 响应上限、8 秒超时和双地址容错。
3. `public/update-config.js` 集中保存当前 App 版本和远程清单地址，避免更新服务配置散落在页面逻辑中。
4. `public/version.json` 作为发布清单模板；每次发布必须填写最新 `versionCode`、`versionName`、APK 下载地址和用户可读说明。
5. `public/app.js` 只在用户点击“检查更新”时发起请求，避免增加启动耗时；返回新版时使用 DOM 文本节点渲染说明，避免远程内容被当成 HTML 执行。
6. Android `SportsWidgetPlugin` 新增 HTTPS 外部地址打开方法，由系统浏览器承接 APK 下载；普通 App 仍需用户在系统安装器中确认安装。
7. 源码版本提升为 npm `2.1.9`、Android `versionCode 21` 和 `versionName 2.1.9`。
8. `CHANGELOG.md` 新增 `2.1.9（开发中）`，明确手机已发布版和源码准备版的区别。

#### 发布约束

- `public/version.json` 必须部署到 `public/update-config.js` 配置的远程地址，检查更新才会在已安装 App 中生效。
- 当前清单的 `apkUrl` 为空，因为 `2.1.9` 已在本地打包但尚未上传固定 HTTPS 地址；发现更高版本但地址为空时，界面会明确显示“下载地址尚未发布”。
- APK 覆盖更新仍要求包名一致、签名一致且 `versionCode` 更高；检查更新组件不会绕过 Android 安装规则。

#### 验证

- `node --check`：`public/app.js`、`public/app-update.js` 和 `public/update-config.js` 均通过。
- `npm test`：16 项全部通过，其中 4 项覆盖版本比较、HTTPS 下载地址限制、备用服务和非法清单。
- `npm run build:web`：通过，`www/` 中包含更新模块和清单文件。
- `npm run sync:android`：通过，更新页面资源已复制到 Android assets。
- Android `:app:compileDebugJavaWithJavac`：`BUILD SUCCESSFUL`，原生系统浏览器打开方法编译通过。
- 本地浏览器使用 390x844 移动端视口验证：侧边栏更新面板位于内容最底部，宽度 `298.39px`、侧边栏宽度 `335.39px`，无横向溢出。
- 点击“检查更新”后按钮进入加载状态并可恢复；因为远程仓库尚未部署 `public/version.json`，当前返回“版本服务返回 404”，控制台无 JavaScript 错误。

#### 版本状态

- 手机端最新已发布 APK：`2.1.8`。
- 当前源码准备版本：`2.1.9`，Android `versionCode 21`。
- 本轮未生成 APK；下一次打包应发布为 `2.1.9`。

### 修复批次：2.1.9 历史比分、存储容量与组件日期控制

#### 用户反馈

- 打开过去比赛时，比分区域显示 `[object Object] - [object Object]`。
- 侧边栏出现 `localStorage ... exceeded the quota` 英文技术错误。
- 桌面组件底部圆点和日期切换交互冗余，希望只保留更大、更容易点击的左右按钮。
- 刷新时间应与右侧刷新按钮放在一起，并在本轮直接发布新版。

#### 根因

1. ESPN 部分赛事的 `score` 从字符串变为包含 `displayValue`、`value` 等字段的对象；Web 和 Android 旧逻辑直接转字符串，最终渲染成对象文字。
2. IndexedDB 主存储成功后，代码仍尝试把整份赛程及其上一份副本写入约 5 MB 限额的 `localStorage`。大赛程超过容量时，备用写入异常被外层逻辑错误描述为主存储失败。
3. 组件日期按钮、刷新时间和刷新按钮混排在同一行，底部圆点又重复提供日期动作，导致点击目标偏小且关系不清楚。

#### 修复结构

1. `calendar-core.js` 新增统一比分规范化，支持字符串、数字、嵌套 `displayValue/value/score/total/points` 对象，并拒绝对象占位文字。
2. 旧赛程加载时同步迁移比分字段；无法恢复的对象比分清除更新时间，过去比赛会先显示“正在同步”，不再展示错误对象或伪造赛果。
3. Android 组件端加入相同的 JSON 比分提取和旧数据保护，ESPN 实时更新也不再直接使用 `optString(score)`。
4. `calendar-storage.js` 将 IndexedDB 和 `localStorage` 结果分别判断：只要主存储成功，备用副本过大就静默跳过；备用快照限制为 125 万字符，并避免同时保存两份超大副本。
5. App 不再把浏览器原始存储异常写入用户界面；主存储与备用存储同时失败时仅在开发控制台保留通用告警。
6. 组件1删除三个日期圆点、回到今天动作及无用图标资源；比赛列表使用剩余高度。
7. 前后日期按钮扩大到 `38x34dp`，间隔增加到 `10dp`；刷新时间和 `30x30dp` 刷新按钮组成独立右侧区域。

#### 回归验证

- Web 自动测试增加对象比分和备用存储容量用例，目前 18 项全部通过。
- Android JVM 测试和 `lintDebug` 均 `BUILD SUCCESSFUL`。
- Android 资源编译确认删除圆点后没有残留 ID、字符串或 drawable 引用。

### 发布批次：2.1.9 APK

#### 发布内容

- 将侧边栏检查更新、历史比分对象修复、存储容量修复和桌面组件工具栏调整正式发布为 `2.1.9`。
- Android `versionCode` 为 `21`，`versionName` 为 `2.1.9`。
- APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。

#### 发布验证

- `npm test`：18 项全部通过。
- Android `:app:testDebugUnitTest` 与 `:app:lintDebug`：`BUILD SUCCESSFUL`。
- `npm run build:android`：`BUILD SUCCESSFUL`。
- APK 包名：`com.local.sportscalendar`。
- APK 应用名：`观赛日记`。
- APK v2 签名验证：通过（Android Debug 签名）。
- APK 大小：`7,400,187` 字节。
- APK SHA-256：`EC2A946D5FDE831099C016A56680A876A7716B17AC3DBB3B101C4F2ECC38833B`。

#### 版本状态

- 手机端最新已发布版本：`2.1.9`。
- 当前源码版本：`2.1.9`（与 APK 一致）。
- 下一版本号建议使用 `2.1.10`。

## 2026-07-16

### 修改批次：2.1.10 单人物应用图标

#### 用户目标

- App logo 直接使用此前提供的像素跑步小人。
- 不再保留足球、篮球、棒球、橄榄球或其他装饰元素。
- 图标修改本身不改变页面、日历和桌面组件。

#### 实现

1. 从项目保留的高清像素小人母图中提取原人物，不重新生成或重画角色。
2. 新增 `public/assets/branding/app-logo-runner-only.png`，构图仅包含浅蓝背景与像素小人。
3. 同步替换 `mipmap-mdpi` 到 `mipmap-xxxhdpi` 的普通、圆形和 foreground 图标，共 15 个资源。
4. 保持已有非 adaptive icon 方案，避免 vivo 再额外显示旧图标外框。
5. 源码准备版本提升为 npm `2.1.10`、Android `versionCode 22` 和 `versionName 2.1.10`。

#### 版本状态

- 手机端最新已发布 APK：`2.1.9`。
- 当前源码准备版本：`2.1.10`，本轮未生成 APK。

#### 验证

- `1024x1024` 单人物母图已目视确认，仅包含浅蓝背景和像素小人。
- `mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi` 的 15 个启动图标均生成成功，尺寸分别为 `48/72/96/144/192px`。
- `192x192` 实际图标已目视检查，没有球类、文字、圆点或额外边框。
- `npm test`：18 项全部通过。
- `npm run sync:android`：通过，Web 版本信息已同步。
- Android `:app:processDebugResources`：`BUILD SUCCESSFUL`。
- npm、Android 和检查更新配置均一致为 `2.1.10 / versionCode 22`。

### 修改批次：2.1.10 桌面组件空比赛状态

#### 用户目标

- 所选日期没有关注比赛时，不显示“今日暂无”“打开 App 导入赛程”或占位队徽。
- 顶部日期、前后日期和刷新控件继续显示，比赛区域保持空白。

#### 根因

1. 组件 1 的列表适配器最少返回 3 行，零场比赛时仍把第一行作为提示卡渲染。
2. 组件 2 的列表适配器在零场比赛时也会强制返回 1 行占位内容。

#### 实现

1. 两个组件在零场比赛时统一返回 0 条列表内容，不再创建任何提示卡。
2. 删除两套“今日暂无”占位渲染方法，避免后续刷新再次显示旧内容。
3. 组件 1 有比赛时继续保持原有规则：1 至 3 场占用固定三行，超过三场可继续翻动查看。
4. 增加空状态及非空行数回归测试，覆盖 0、1、3、4 场比赛。

#### 版本状态

- 手机端最新已发布 APK：`2.1.9`。
- 当前源码准备版本：`2.1.10`，本轮未生成 APK。

#### 验证

- Web 自动测试 18 项全部通过。
- Android JVM 测试 18 项全部通过，新增用例确认零场比赛时两个组件均返回零行。
- Android `lintDebug`：`BUILD SUCCESSFUL`。
- 组件 1 的非空行数测试确认原规则不变：1 至 3 场保持三行，4 场返回四行。
- `npm run sync:android`：通过，修改后的 Web 资源已同步到 Android 工程。

## 2026-07-16

### 修改批次：2.2.1 多伦多蓝鸟中文新闻与准实时推送

#### 用户目标

- 在 App 内查看多伦多蓝鸟主队新闻，并由 DeepSeek 翻译为中文。
- 新新闻可以准实时推送到手机，点击通知打开对应 MLB 原文。
- 本轮完成开发和版本升级，但不自动打包 APK；同时提供清晰的 API 部署位置。

#### 数据与系统结构

1. Firebase 定时函数 `pollBlueJaysNews` 每 5 分钟读取官方 RSS：`https://www.mlb.com/bluejays/feeds/news/rss.xml`。
2. 新文章的标题和短摘要由 DeepSeek 翻译，API Key 通过 Firebase Secret `DEEPSEEK_API_KEY` 注入，不进入网页、APK 或仓库。
3. 翻译结果写入 Firestore；首次执行只建立最近新闻基线，避免安装后集中推送旧新闻。
4. 公开只读函数 `blueJaysNewsApi` 向 App 返回最多 30 条中文新闻；App 使用十分钟本地缓存，并支持手动刷新和断网回退。
5. Android 通过 FCM 固定主题 `toronto_blue_jays_news_zh` 接收推送；用户可在侧边栏开启或关闭，Android 13 及以上会请求通知权限。
6. 点击推送后只允许打开 HTTPS 的 `mlb.com` 官方链接，网页和 Android 原生层都执行来源校验。

#### 主要文件

- Web 新闻界面与逻辑：`index.html`、`public/styles.css`、`public/app.js`。
- Web 数据边界：`public/team-news-core.js`、`public/team-news-config.js`。
- Firebase 后端：`firebase/functions/index.js`、`firebase/functions/news-core.js`。
- Android 推送：`TeamNewsPushManager.java`、`NewsMessagingService.java`、`SportsWidgetPlugin.java`、`MainActivity.java`。
- 部署说明：`docs/2.2.1-news-deployment.md`。

#### 安全与稳定性

- RSS 和 API 响应设置超时、体积上限、条数上限及字段长度上限。
- 新闻原文只接受 MLB 官方 HTTPS 域名，远程内容以 DOM 文本节点渲染，不将 HTML 直接注入页面。
- Firestore 客户端规则默认拒绝全部读写，只有云函数 Admin SDK 可以访问数据。
- 推送主题固定在原生代码中，网页不能传入任意主题进行订阅。
- Firebase 配置和本机项目选择已加入 `.gitignore`；DeepSeek Key 只存云端 Secret。

#### 版本状态

- npm、Android、App 更新配置统一为 `2.2.1 / versionCode 23`。
- 手机端最新已发布 APK 仍为 `2.1.9`。
- 当前源码准备版本为 `2.2.1`，本轮未生成 APK。

#### 验证与限制

- Web 新闻数据测试覆盖 URL 白名单、排序、去重和 API 参数限制。
- Firebase 测试覆盖 RSS 解析、MLB 链接白名单和 DeepSeek JSON 结果校验。
- FCM 依赖 Google Play 服务；无 GMS 或限制后台运行的 vivo 机型上，新闻列表仍可用，但通知可能需要后续接入 vivo 官方推送。
- Firebase Functions 定时任务需要 Blaze 方案；DeepSeek 翻译会产生对应 API 用量费用。
- Firebase Admin 的 Google Cloud 传递依赖在 npm 审计中仍报告 8 个 moderate UUID 告警；当前代码不调用相关 UUID v3/v5/v6 Buffer 路径，且强制修复会引入不兼容版本，因此保留上游修复等待并记录为残余风险。

#### 最终验证

- Web：21 项自动测试全部通过，新增 3 项新闻数据边界测试。
- Firebase Functions：语法检查通过，3 项 RSS、链接白名单和翻译格式测试全部通过。
- Android：JVM 单元测试、原生 Java 编译和 `lintDebug` 全部成功；新增测试确认通知只能打开 MLB 官方 HTTPS 链接。
- Capacitor：`npm run sync:android` 成功，新闻脚本、样式和蓝鸟队徽均已同步到 Android assets。
- 稳定性验证：20 项检查全部通过；版本检查已由旧的硬编码 `2.1.8` 改为自动比较 npm、Android 和更新清单。
- 移动端实测：`390x844` 视口下侧边栏完整落在屏幕内，新闻面板及弹窗无横向溢出，全部本地图片请求成功。

### 修改批次：2.2.1 英文新闻优先上线

#### 用户目标

- 暂不调用 DeepSeek API，先用 MLB 官方英文原文跑通 Firebase 新闻链路。
- 用户刚创建 Firebase 项目，需要一份从 Android App 注册到云函数部署的逐步说明。

#### 实现

1. 删除云函数中的 `DEEPSEEK_API_KEY` Secret、翻译请求和翻译结果解析逻辑。
2. Firestore 和公开 API 统一使用 `titleEn`、`summaryEn`，App 直接显示英文标题与摘要。
3. FCM 推送主题由 `toronto_blue_jays_news_zh` 改为 `toronto_blue_jays_news_en`，Android 与网页配置同步更新。
4. 更新部署文档，加入 Firebase Android App、Firestore、Blaze、CLI、函数部署和 API 回填的完整步骤。
5. 版本仍为开发中的 `2.2.1 / versionCode 23`，本轮不生成 APK。

#### 验证

- Web 21 项测试全部通过，新闻测试已改为英文标题与摘要。
- Firebase Functions 语法检查和 3 项 RSS/API 测试通过，源码扫描确认不存在 DeepSeek 请求、Secret 或旧中文新闻字段。
- `npm run sync:android` 成功，英文主题与 Web 资源已同步到 Android。
- Android JVM 测试和 Java 编译成功，本轮未生成 APK。

#### Firebase 部署进度

- 用户已创建 Firebase 项目并将 `google-services.json` 放入 `android/app/`。
- 本地校验确认 JSON 有效、Android 包名为 `com.local.sportscalendar`、文件已被 Git 忽略。
- Android `:app:processDebugGoogleServices` 执行成功，Firebase Android 配置已可被构建系统识别。
- 下一步：在 Firebase Console 创建 Firestore Database。

### 修改批次：2.2.1 GitHub Actions 免费新闻后端

#### 决策背景

- 用户不希望为 Firebase 绑定 Blaze 结算账号。
- 项目仓库 `Levine-Lai/calendar-app` 为公开仓库，可以免费使用标准 GitHub Actions。
- Firestore 已创建，但免费方案不再依赖它。

#### 实现

1. 移除 Firebase Cloud Functions、Scheduler 和 Firestore 规则配置。
2. 新增 `.github/workflows/blue-jays-news.yml`，在每小时第 7、22、37、52 分运行，避开整点拥堵。
3. 将新闻任务改为 `update-static-news.js`：读取 MLB RSS、限制 1 MB 响应、解析最多 20 条新闻，并原子写入 `public/news/blue-jays.json`。
4. 只有新闻内容变化时才改动 JSON 和产生 Git 提交，避免每 15 分钟制造无意义提交。
5. 第一次建立数据时不推送旧新闻；后续只推送新 ID，单次最多 5 条。
6. Firebase 服务账号只从 GitHub Secret `FIREBASE_SERVICE_ACCOUNT_JSON` 读取，私钥不进入仓库。
7. App 新闻地址改为 GitHub Raw 静态 JSON，主题保持英文版 `toronto_blue_jays_news_en`。
8. 当前仍为开发中的 `2.2.1 / versionCode 23`，本轮不生成 APK。

#### 验证

- 本地首次抓取成功生成 20 条官方英文新闻；第二次运行识别为无变化，不重复改写文件。
- 新闻任务 5 项测试全部通过，覆盖 RSS 解析、官方链接限制、初次静默建库及后续新文章识别。
- 新闻任务依赖精简为 `fast-xml-parser`；FCM 改用 OAuth 2.0 + HTTP v1，`npm audit` 为 0 漏洞。
- GitHub Actions YAML 解析成功，工作流具有 5 分钟超时、写入权限和串行并发保护。
- Web 21 项测试、20 项稳定性检查和 Capacitor Android 同步均通过。

#### 用户配置进度

- GitHub 仓库已开启 Actions `Read and write permissions`。
- Firebase Admin SDK 服务账号私钥已生成，并保存为 GitHub Actions Secret `FIREBASE_SERVICE_ACCOUNT_JSON`。
- 私钥内容未进入工作区；提交前扫描未发现 `private_key` 或 PEM 私钥材料。
- 下一步：将 2.2.1 源码和工作流发布到 GitHub `main`，再手动运行第一次任务。

### 发布批次：2.2.1 GitHub 工作流与 APK

#### 部署结果

- 源码和免费新闻工作流已提交并推送到 GitHub `main`，提交为 `82b8459`。
- GitHub Actions 手动运行 `29481436975` 成功，分支和提交均匹配；公网英文新闻 JSON 可正常访问。
- Android 构建已读取 `google-services.json`，`processDebugGoogleServices` 成功执行。

#### APK 验收

- 产物：`releases/sports-calendar-2.2.1-debug.apk`。
- 文件大小：`9,267,070` 字节。
- 包名：`com.local.sportscalendar`。
- 内部版本：`versionCode 23`、`versionName 2.2.1`。
- 权限包含网络、Android 13+ 通知和 FCM 接收；包内确认存在英文新闻 JSON 与新闻配置。
- 包内新闻数据共 20 条：北京时间 7 月 14 日 4 条、15 日 7 条、16 日 4 条，最近三天合计 15 条；另保留 7 月 13 日 5 条作为历史缓冲。
- APK v2 签名验证通过，使用与本机历史 Debug 构建相同用途的 Android Debug 签名。
- SHA-256：`CC5E13AFC8719EDAA249711F34768B85D0A679476EA0C72FC4CA5B36B0107276`。

#### 当前版本

- 手机端最新发布版本：`2.2.1`。
- 当前源码版本：`2.2.1 / versionCode 23`。
- 下一版本建议使用 `2.2.2 / versionCode 24`。

### 修改批次：2.2.2 新闻正文下拉与全屏界面

#### 用户目标

- 新闻不只显示标题，点击后直接在 App 内下拉查看英文正文，不再跳转 MLB 浏览器页面。
- 新闻界面使用 100% 屏幕空间。

#### 实现结构

1. GitHub 继续只保存 RSS 标题和官方链接，避免在公开仓库复制整篇版权正文。
2. Android 新增 `fetchMlbArticle` 原生方法，把官方新闻 URL 转换为 `www.mlb.com/amp/news/{slug}.html`。
3. 原生层限制 MLB HTTPS 域名、重定向目标、15 秒读取超时和 768 KB 响应上限。
4. WebView 使用 `DOMParser` 读取 AMP `<article>` 的直接正文段落，仅通过 `textContent` 渲染，不加载广告、脚本、视频或页面导航。
5. 正文仅在首次展开时请求，并在当前 App 会话内按新闻 ID 缓存；再次展开无需重新联网。
6. 通知打开对应新闻时会定位卡片并自动展开正文。
7. 新闻弹窗改为 `100vw × 100dvh` 全屏布局，并兼容顶部、底部安全区。

#### 版本状态

- 手机端最新已发布 APK：`2.2.1 / versionCode 23`。
- 当前源码准备版本：`2.2.2 / versionCode 24`，本轮不自动打包。

#### 最终验证

- Web 自动化测试 21 项全部通过，稳定性检查 20 项全部通过。
- 新闻任务 5 项测试全部通过，生产依赖审计为 0 个漏洞。
- Android JVM 单元测试与 `lintDebug` 全部通过，原生正文请求方法可以正常编译。
- 使用 MLB 官方 AMP 原文实测提取到 25 个正文段落，并成功过滤视频回退文字、广告和页面导航。
- `390x844` 手机视口实测：新闻页严格占满整个屏幕，无横向溢出，展开正文正常，侧边栏不会从边缘漏出。

### 发布批次：2.2.2 Debug APK

#### 构建结果

- 构建命令：`npm run build:android`，Gradle `assembleDebug` 执行成功。
- APK：`releases/sports-calendar-2.2.2-debug.apk`。
- 文件大小：`9,268,722` 字节。
- 包名：`com.local.sportscalendar`。
- 版本：`versionCode 24`、`versionName 2.2.2`。
- 应用名：`观赛日记`，包含 Android 联网权限。
- APK Signature Scheme v2 验证通过，签名证书 SHA-256 为 `7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0`。
- APK 文件 SHA-256：`D7F1F2AEBF4C2741B4CBBDA0F7DB35D049D1413C80500FDB40FC2A3C1AB33A9A`。

#### 发布边界

- 当前已生成本地可安装 APK，但尚未上传公开下载地址。
- `public/version.json` 暂时保持远程已发布版本 `2.2.1`，避免旧版 App 检测到无法下载的更新；上传 APK 后再更新远程清单。

## 2026-07-21

### 修改批次：2.2.7 新闻中英文双页

#### 用户目标

- 推送已经显示中文，但 App 新闻窗口仍显示英文；希望新闻界面顶部可以在“中文”和“English”两个页面之间切换。

#### 实现结构

1. 新闻窗口顶部新增符合 `tablist/tab/tabpanel` 语义的“中文 / English”分段页签，支持触摸点击和键盘左右方向键。
2. `team-news-core.js` 新增统一的本地化内容选择函数：English 页严格使用英文，中文页优先使用中文并对尚未翻译的文章回退英文。
3. 标题、摘要、展开正文、窗口标题、更新时间和空状态随当前语言切换。
4. 正文缓存键增加语言前缀，避免在两个页面间切换时复用错误语言的段落。
5. 语言偏好使用独立的小型 `localStorage` 键保存；写入失败只影响跨会话记忆，不影响当前页面切换。
6. 页签使用浅蓝选中态和低饱和背景，移动端减小边框与高度，不挤占正文阅读空间。
7. 源码版本更新为 `2.2.7 / versionCode 29`，并同步更新网页缓存版本、更新检查配置和 Android 网络 User-Agent。

#### 涉及文件

- `index.html`
- `public/app.js`
- `public/team-news-core.js`
- `public/styles.css`
- `public/update-config.js`
- `tests/team-news.test.js`
- `package.json`、`package-lock.json`
- `firebase/functions/package.json`、`firebase/functions/package-lock.json`
- `android/app/build.gradle`
- `android/app/src/main/java/com/local/sportscalendar/WidgetNetworkClient.java`
- `CHANGELOG.md`
- `context.md`

#### 验证与限制

- Web 自动化测试 26 项全部通过，新增中英文对应字段选择和中文缺失时英文回退测试。
- 稳定性检查 20 项全部通过；测试发现并修正了更新检查 `versionCode` 未同步到 29 的问题。
- 新闻任务测试 20 项全部通过。
- Android `testDebugUnitTest` 与 `lintDebug` 成功完成。
- 浏览器安全策略禁止直接打开本地 `file://` 页面，因此本轮未生成自动化页面截图；HTML 结构、移动端 CSS、脚本语法和 Android 编译均已验证。
- 手机端最新已生成 APK 仍为 `2.2.6 / versionCode 28`；当前源码为 `2.2.7 / versionCode 29`，本轮按约定不自动打包。

## 2026-07-22

### 修复批次：新闻推送可靠性与诊断

#### 用户反馈

- 新闻内容能够更新且推送已经是中文，但通知仍不稳定，有时完全收不到。

#### 线上证据与根因

1. 检查 GitHub Actions 最近 89 次定时运行：配置目标为每 15 分钟，实际平均间隔约 `92.1` 分钟，最大间隔约 `220.1` 分钟。GitHub 免费定时任务存在排队和漏触发，不能作为严格实时调度器。
2. 云端原逻辑在 FCM 发送失败后仍提交新文章 JSON；下一轮根据文章 ID 判定为旧文章，因此失败通知不会重试。
3. 云端批量发送遇到第一条错误会直接停止，后续同批文章没有发送机会；一次最多取 5 条，未处理文章也没有待办状态。
4. Android 本地逻辑在调用系统通知之前就写入去重 ID，并提前推进 RSS 游标；通知权限、频道或系统调用失败时也会永久跳过该文章。
5. `TeamNewsRefreshWorker` 连续重试三次后返回 `Result.failure()`；周期 WorkManager 进入终止状态后不再执行，通常要等 App 再次打开才重新建立任务。
6. App 只显示推送开关状态，没有持久记录 FCM 主题订阅是否成功；测试通知在频道关闭时仍可能提示“已发送”。

#### 修复结构

1. 新闻 JSON 新增可选的 `pendingNotificationIds` 待重试队列；新文章与历史失败 ID 合并、去重并限制为当前 20 篇以内。
2. FCM 每条消息最多即时重试三次，采用 1 秒、2 秒退避；HTTP 5xx、429 和网络异常可重试，仍失败则保留到下次 Actions 运行。
3. 单条失败不再阻断同批其他消息；每次最多发送 5 条，其余文章继续保留在队列中。
4. Android 先检查系统通知权限、App 总通知开关和 `team_news` 频道，再提交系统通知；提交成功后才记录去重 ID。
5. 本地 RSS 游标移动到全部通知处理成功之后；部分成功、部分失败时，成功文章由去重表保护，失败文章在下一轮继续尝试。
6. 新闻周期 Worker 第三次失败后结束当前周期但返回成功，确保 WorkManager 仍安排下一周期，而不是永久停止。
7. FCM 订阅成功状态持久化；App 启动、Token 更新和后台检查时会对失败订阅继续恢复。
8. 侧栏新闻状态新增最近通知时间、FCM 恢复状态、通知频道状态和后台错误详情；每次打开侧栏重新读取。
9. 测试通知只有在系统实际接受通知后才返回成功，否则明确提示权限或频道关闭。

#### 验证结果与边界

- 新闻任务测试由 20 项增加到 22 项并全部通过，覆盖失败队列保留、移除过期 ID、新文章合并去重。
- Web 自动化测试 26 项全部通过。
- 稳定性检查由 20 项增加到 22 项，新增“新闻后台任务持续运行”和“FCM 失败通知持久重试”门禁。
- Android `testDebugUnitTest` 与 `lintDebug` 成功完成。
- FCM HTTP 200 只能证明 Firebase 接受消息，不能证明 vivo 一定弹窗；勿扰模式、系统级省电和用户关闭频道仍由手机系统决定。
- 免费 GitHub Actions 的触发延迟无法仅靠代码消除；本次修复目标是“晚到后仍能补发、不因一次失败永久丢失”。要实现稳定的分钟级抓取，需要后续迁移到有 SLA 的云端定时器。
- 手机端最新已生成 APK 仍为 `2.2.6 / versionCode 28`；当前源码保持 `2.2.7 / versionCode 29`，本轮不自动打包。

## 2026-07-21

### 修复批次：新闻通知正文兜底

#### 用户目标

- 修复新新闻推送只显示标题、没有正文的问题。

#### 问题原因

- MLB RSS 的部分文章没有 `summary`；当前 20 篇数据中有 4 篇属于这种情况。
- `2.2.5` 的 Android 本地 RSS 检查直接把摘要作为通知正文，空摘要会生成只有标题的系统通知。
- 云端 FCM 原本只在中英文摘要之间回退，没有使用已经抓取并翻译好的正文段落。

#### 实现方案与兼容性

1. 云端 FCM 和 Android 本地通知统一采用正文选择顺序：中文摘要、中文正文首段、英文摘要、英文正文首段、固定中文提示。
2. 通知正文压缩连续空白并限制为 500 个字符，避免异常长段落影响系统通知布局。
3. Android 通知同时设置折叠正文、展开大文本标题与正文、锁屏可见内容，保证常规通知和展开通知都有文字。
4. 不修改新闻 JSON 数据结构；旧新闻、英文兜底和未翻译文章继续兼容。

#### 涉及文件

- `firebase/functions/update-static-news.js`
- `firebase/functions/test/update-static-news.test.js`
- `android/app/src/main/java/com/local/sportscalendar/TeamNewsPushManager.java`
- `android/app/src/main/java/com/local/sportscalendar/NewsMessagingService.java`
- `CHANGELOG.md`
- `context.md`

#### 验证结果与发布状态

- 新闻任务测试 20 项全部通过，新增“摘要为空时使用正文首段”和“任何情况下正文不为空”回归测试。
- Web 自动化测试 24 项全部通过。
- Android `testDebugUnitTest` 与 `lintDebug` 成功完成。
- 当前源码仍为 `2.2.6 / versionCode 28`，本轮未自动打包；手机端最新已生成 APK 仍为 `2.2.5 / versionCode 27`。

### 发布批次：2.2.6 Debug APK

#### 构建与验收

- 执行 `npm run build:android`，Capacitor Web 资源同步和 Gradle `assembleDebug` 均成功。
- APK：`releases/sports-calendar-2.2.6-debug.apk`。
- 文件大小：`9,415,162` 字节。
- 包名：`com.local.sportscalendar`。
- 版本：`versionCode 28`、`versionName 2.2.6`。
- APK Signature Scheme v2 验证通过；签名证书 SHA-256 为 `7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0`，与此前 Debug APK 一致，可覆盖安装并保留本地数据。
- APK 文件 SHA-256：`F704EC96438FB26C332D6F9E65966045DDB7B0D50B6AE0726048CB513CF74184`。

#### 发布状态

- 手机端最新已生成 APK 与当前源码均为 `2.2.6 / versionCode 28`。
- `public/version.json` 仍保持已有远程版本配置；本次发布为本地 APK 文件，尚未配置公开 HTTPS 下载地址。

### 修改批次：2.2.6 DeepSeek 中文新闻与推送

#### 用户目标

- 使用已经加入 GitHub Actions 的 `DEEPSEEK_API_KEY`，将多伦多蓝鸟英文新闻翻译成中文后推送到手机。
- 为模型提供球队、棒球术语和翻译风格参考，提高专有名词与比赛语境的准确度。
- API 失败时不能阻断新闻抓取、正文保存或英文通知兜底。

#### 实现结构

1. 新增 `firebase/functions/translation-reference.json`，集中维护 30 支 MLB 球队中文名、常用棒球术语和翻译规则。
2. 新增 `translation-core.js`，构建稳定的 DeepSeek 系统提示词、JSON 请求、来源哈希和严格输出校验。
3. DeepSeek 使用固定 HTTPS 端点和默认模型 `deepseek-v4-flash`；Key 只从进程环境读取，并只放入 Authorization 请求头。
4. 翻译结果包含 `titleZh`、`summaryZh`、`bodyZh`、模型、时间与英文来源哈希；中文正文必须和英文正文段落一一对应，否则整篇翻译视为失败。
5. 已翻译文章只有在标题、摘要或正文英文内容变化后才重新翻译；相同来源直接复用，避免定时任务重复计费。
6. API 的单篇失败只记录不含密钥的诊断并保留英文，新闻 JSON 与其他文章仍继续更新。
7. FCM 数据消息优先使用中文标题和摘要，缺少中文时使用英文；App 列表、摘要和正文采用同样的中文优先规则。
8. Android 本地 RSS 通知发现新文章后先读取 GitHub Raw 中文数据，避免本地英文通知先到而压制后续中文 FCM；静态数据超过一小时仍不可用时使用英文兜底。
9. 工作流加入 `DEEPSEEK_API_KEY` Secret，超时由 5 分钟调整为 20 分钟，支持首次补齐最多 20 篇正文翻译。

#### 安全与稳定性

- DeepSeek API Key 不进入 Git、APK、Web 资源、新闻 JSON 或测试日志。
- DeepSeek 响应必须为 JSON 对象，中文标题必须含中文字符，正文段落数量必须匹配；空响应、非法 JSON 和截断均拒绝写入。
- API 对 429 和服务端错误执行有限重试；认证、余额或参数错误立即回退英文。
- MLB 原文 URL、静态新闻 URL、响应大小、文本长度和 Android JSON 解析仍受原有白名单与上限保护。

#### 验证

- Web 自动测试 24 项全部通过，包含中文字段清洗和实时 RSS 与静态中文数据合并。
- 新闻任务测试 18 项全部通过，包含术语参考、JSON 校验、来源哈希、Key 不进入请求正文、中文 FCM 与英文回退。
- 稳定性检查 20 项全部通过。
- Android `testDebugUnitTest` 与 `lintDebug` 成功；首次运行受前一次超时任务残留文件锁影响，原命令重新执行后完整通过。
- 本地浏览器连接未能访问桌面进程启动的测试端口，因此本轮视觉验收以现有 UI 无结构改动和自动化 DOM 数据测试为准。
- GitHub Actions 运行 `29795172789` 在约 4 分半钟内成功完成，证明 `DEEPSEEK_API_KEY`、账户余额、`deepseek-v4-flash`、JSON 输出和 Firebase 校验均可用。
- 机器人提交 `a8cc521` 已写回 20 篇中文标题、20 篇中文正文和 16 篇中文摘要；另外 4 篇 MLB 源文章没有摘要，程序保持为空而不编造内容。
- 20 篇中文正文的段落数量全部与英文正文一致，新闻 JSON 为 `318,642` 字节，仍低于 App 的 1 MB 响应上限。
- 样例标题 `Key takeaways: Rays 7, Blue Jays 1` 翻译为“重点回顾：光芒 7-1 蓝鸟”，比分和球队术语保持正确。

#### 版本状态

- 手机端最新已生成 APK：`2.2.5 / versionCode 27`。
- 当前源码准备版本：`2.2.6 / versionCode 28`，按约定不自动打包。
- 在线 DeepSeek 翻译与写回已经通过；下一次定时任务会直接复用这 20 篇结果，只翻译新文章或来源发生变化的文章。

## 2026-07-17

### 发布批次：2.2.5 Debug APK

#### 构建结果

- 执行 `npm run build:android`，Capacitor Web 资源同步与 Gradle `assembleDebug` 均成功。
- APK：`releases/sports-calendar-2.2.5-debug.apk`。
- 文件大小：`9,338,570` 字节。
- 包名：`com.local.sportscalendar`。
- 版本：`versionCode 27`、`versionName 2.2.5`。
- APK Signature Scheme v2 验证通过，签名证书 SHA-256 为 `7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0`。
- APK 文件 SHA-256：`ABF0A426B831DA9F62E60638ECB905A1AEAA4E44D521B4D78A8FC7A9DE6B3604`。

#### 包内验收

- 应用名“观赛日记”、联网、通知、网络状态、开机恢复和 FCM 接收权限均存在。
- `NewsMessagingService` 与 Firebase Messaging Service 已合并到 Manifest。
- APK 内 Web 资源为 `2.2.5`，包含“测试通知”入口及新的新闻源选择逻辑。
- 内置蓝鸟新闻共 20 篇，20 篇均包含英文正文。
- 新闻后台更新采用 FCM 高优先级数据消息与 Android WorkManager 直接检查 MLB RSS 两条通道，并按文章 ID 去重。

#### 发布边界

- 本次生成的是使用历史相同 Debug 证书签名的可覆盖安装 APK，可保留现有 App 数据。
- 未连接 vivo 真机，因此通知展示、系统电池限制和后台调度仍需安装后用“测试通知”与最近检查时间进行最终真机验收。
- `public/version.json` 继续保留 `2.2.1` 和空下载地址；在 APK 上传到稳定的公开 HTTPS 地址前，不向旧版 App 发布不可下载的更新提示。

## 2026-07-17

### 修改批次：2.2.5 新闻实时性与通知双通道修复

#### 用户反馈

- 安装 2.2.4 并完成 Firebase 配置后，没有收到新新闻通知，App 内新闻也没有实时更新。

#### 现场证据与根因

1. GitHub Actions 工作流虽然配置为每 15 分钟，但 2026-07-17 实际计划运行约每 1.5 至 2 小时一次；免费计划调度出现明显延迟和漏跑，不能作为唯一实时源。
2. GitHub Raw 新闻已更新到 `2026-07-17T13:53:55.290Z`，最新文章发布时间为 `2026-07-17T01:04:02.000Z`；jsDelivr 仍停留在 `2026-07-17T01:12:34.174Z` 和更旧文章。
3. 旧版使用 `Promise.any` 选择最快响应，6 秒返回的陈旧 jsDelivr 会早于约 18 秒返回的新 GitHub Raw，因此 App 会主动采用旧数据。
4. 最新 Actions 运行 `29585738863` 成功且提交了新 JSON，但公开 GitHub API 不允许读取完整作业日志，无法证明真实 FCM 发送结果；此前只证明 `validate_only` 接受消息。
5. 当前电脑未连接 vivo 手机，`adb devices -l` 为空，无法读取手机的 FCM 主题订阅、通知权限和 WorkManager 状态。

#### 修复结构

1. Android 新增受 512 KB 上限和严格 MLB HTTPS 地址限制的 RSS 读取器，使用禁用 DOCTYPE/外部实体的 XML 解析器读取最近 20 条新闻。
2. App 启动及前台刷新直接请求 MLB RSS；静态 GitHub Raw/jsDelivr 只用于补充已集中抓取的正文。
3. 静态源不再“最快响应优先”，改为比较最新文章发布时间和数据更新时间，陈旧 CDN 不会覆盖新数据。
4. 新增 `TeamNewsRefreshWorker`，推送开启时以 WorkManager 每 15 分钟直连 MLB RSS；首次运行建立基线，此后发现新文章时创建本地系统通知。
5. FCM 改为高优先级 data-only 消息，前后台均进入 `NewsMessagingService`；本地 Worker 与 FCM 共享最多 50 个文章 ID 的去重记录。
6. App 启动自动恢复 FCM 主题订阅、周期任务和一次立即检查；关闭推送时同时取消周期与立即任务。
7. 即使 Google 服务订阅失败，本地 WorkManager 通知仍保持开启，新闻同步不再只有单点通道。
8. 新闻面板新增“测试通知”，并显示后台最近检查时间或失败状态，方便区分手机权限、后台网络与远程 FCM 问题。
9. 服务端 FCM 数据包含标题、摘要、文章 ID 和 MLB URL，由 App 统一构造通知和点击行为。

#### 数据兼容与安全

- 沿用原有 `enabled` 推送偏好，覆盖安装后会自动为已开启用户安排后台任务，不要求重新选择球队或导入数据。
- 后台首次读取只建立最近文章基线，不会把已有 20 篇旧新闻一次性推送。
- XML 禁止 DOCTYPE、外部实体和 XInclude；RSS 限制为 MLB 固定 HTTPS 地址和 512 KB。
- 新闻 ID 使用与服务端一致的文章 URL SHA-256，FCM 与本地 Worker 可以跨通道去重。

#### 涉及文件

- 新增：`TeamNewsFeed.java`、`TeamNewsRefreshWorker.java`。
- Android：`TeamNewsPushManager.java`、`NewsMessagingService.java`、`SportsWidgetPlugin.java`、`WidgetNetworkClient.java`、`MainActivity.java`。
- Web：`app.js`、`team-news-core.js`、`team-news-config.js`、`styles.css`、`index.html`。
- 服务端：`firebase/functions/update-static-news.js` 及测试。

#### 验证

- Web 自动化测试由 22 项增加到 24 项，新增“陈旧 CDN 不得胜出”和“RSS 标题合并静态正文”回归测试，全部通过。
- 新闻任务测试 12 项通过，FCM `validate_only` 用例已改为高优先级数据消息。
- Android JVM 测试与 `lintDebug` 成功，新增 MLB RSS 排序/过滤和 XXE 拒绝测试。
- 390x844 手机视口中侧栏无横向溢出，新增按钮和推送开关完整显示；页面展示 GitHub Raw 最新文章，控制台无错误。
- MLB RSS 现场返回 RFC 822 时间格式，与 Android 解析器测试格式一致。
- 提交 `fd60f94` 触发的 GitHub Actions 运行 `29589382377` 成功完成，FCM 高优先级数据消息 `validate_only` 无 warning/error 注释。

#### 未解决限制

- Android WorkManager 的 15 分钟是最短请求周期，不保证精确准点；vivo 省电策略仍可能延迟后台执行。
- FCM 与本地后台检查都依赖手机联网。强制停止 App 后，Android 会暂停后台任务，直到用户再次打开 App。
- 本轮没有连接真机，真实通知显示需要安装下一版后使用“测试通知”验收。

#### 版本状态

- 手机端最新已生成 APK：`2.2.4 / versionCode 26`。
- 当前源码准备版本：`2.2.5 / versionCode 27`，本轮按约定不自动打包。

### 修改批次：2.2.4 自动新闻同步与 FCM 推送修复

#### 用户反馈

- `2.2.3` 点击新闻页右上角同步按钮提示“同步内容超时”。
- 希望不点击按钮也能持续抓取新新闻。
- 希望 MLB 发布新文章时由系统通知直接推送到 vivo 手机。

#### 根因

1. App 只在启动时发现缓存超过 10 分钟才自动请求，保持打开和从后台恢复时没有继续检查。
2. WebView 新闻请求只有 10 秒超时且只使用 GitHub Raw；国内网络抖动时容易失败。
3. FCM 使用原始 HTTP v1 REST 请求，但 Android 通知字段误写为 `channelId`、`clickAction`；官方 REST 模型要求 `channel_id`、`click_action`。
4. 首次建立新闻基线没有新文章，所以此前成功运行并未真正验证 FCM 消息体；第一次出现新文章时才暴露格式问题。

#### 修复结构

1. 新闻配置增加 jsDelivr 与 GitHub Raw 两个 HTTPS 地址，Web 端以 25 秒上限并行请求，最快有效响应优先。
2. Android 插件新增 `fetchTeamNews`，原生请求具有 12 秒连接、25 秒读取和 1 MB 响应上限。
3. 原生层只允许本项目固定的 GitHub Raw 与 jsDelivr 新闻路径，并再次校验重定向目标。
4. App 每次启动均静默同步；保持前台时每 5 分钟同步，回到前台超过 2 分钟或网络恢复时立即同步。
5. 自动同步失败时保留缓存且不显示红色错误；用户主动点击同步时继续显示明确错误。
6. FCM 消息体改用 REST 字段 `channel_id` 与 `click_action`，继续使用高优先级和 `team_news` 通知频道。
7. 新闻脚本发布触发的 Actions 会发送 `validate_only` 请求，验证 OAuth、Firebase 权限和完整消息格式，但不会实际投递测试通知。
8. 新文章的真实推送仍为尽力发送；即使 Firebase 临时失败，新闻 JSON 也会继续更新。

#### 时效说明

- GitHub Actions 计划每 15 分钟检查一次 MLB RSS，免费计划可能有数分钟调度延迟。
- App 自动同步周期为 5 分钟，因此通常在 MLB 发布后约 5–20 分钟看到正文或收到推送，属于准实时而非秒级实时。
- vivo 系统仍可能因省电策略延迟 FCM；需要允许通知、自启动并将电池策略设为不限制。

#### 版本状态

- 手机端最新已生成 APK：`2.2.3 / versionCode 25`。
- 当前源码准备版本：`2.2.4 / versionCode 26`，本轮按约定不自动打包。

#### 线上验证补充

1. 提交 `4371011` 触发的 GitHub Actions 运行 `29551166994` 成功完成新闻更新，证明 MLB 抓取和正文发布链路可用。
2. `validate_only` 检查发现现有 GitHub Secret 可解析为 JSON，但缺少 Firebase 管理员服务账号必需字段，因此当前推送还不能实际发送。
3. 服务账号读取增加原始 JSON、二次引号包裹 JSON 和 Base64 JSON 三种格式兼容，并专门识别误用 Android `google-services.json` 的情况。
4. 诊断消息只输出缺失字段或文件类型，不输出项目值、邮箱和私钥内容。
5. 提交 `007ec6f` 触发的 Actions 运行 `29551318960` 成功完成；精确诊断确认 GitHub Secret 当前放入的是 Android 客户端 `google-services.json`，不是 Firebase Admin 服务账号 JSON。
6. 本机 Downloads、Desktop、Documents、OneDrive 与 `D:\Downloads` 只找到 `C:\Users\Administrator\Downloads\google-services.json`，未找到包含 `type=service_account`、`client_email` 和 `private_key` 的管理员文件，因此不能在不重新生成私钥的情况下替用户修正 GitHub Secret。
7. 新闻抓取、正文发布和 App 自动同步不受该 Secret 问题影响；只有新文章 FCM 系统通知暂时不可用。
8. 用户已于 2026-07-17 替换 GitHub Secret；通过工作流文件的无行为变更注释触发一次新的 `validate_only` 线上复验。
9. GitHub Actions 运行 `29552048767` 于 2026-07-17 成功完成，作业 `87796506022` 无任何 warning/error 注释；由于验证失败路径一定会创建 warning，这证明新服务账号的 OAuth、FCM 权限和消息格式均已通过校验。
10. 本次校验使用 `validate_only`，不会产生测试通知；下一篇新文章出现时才会向已订阅 `toronto_blue_jays_news_en` 主题的设备发送真实通知。

### 发布批次：2.2.4 Debug APK

#### 构建结果

- 构建命令：`npm run build:android`，Gradle `assembleDebug` 成功。
- APK：`releases/sports-calendar-2.2.4-debug.apk`。
- 文件大小：`9,331,282` 字节。
- 包名：`com.local.sportscalendar`。
- 版本：`versionCode 26`、`versionName 2.2.4`。
- APK Signature Scheme v2 验证通过，签名证书 SHA-256 为 `7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0`。
- APK 文件 SHA-256：`91BDE81F9FB6C6FA211ED7AC0232FBB90F54A784F33EF85098C6ACF1EE36B0A1`。

#### 验收

1. Web 自动化测试 22 项、稳定性检查 20 项和新闻任务测试 12 项全部通过；新闻任务生产依赖审计为 0 个漏洞。
2. Android `testDebugUnitTest` 与 `lintDebug` 成功，Gradle 没有新增 Lint 问题。
3. APK 清单确认应用名“观赛日记”、联网、通知和开机恢复权限存在，Firebase Messaging Service 已合并。
4. APK 内版本资源为 `2.2.4`，包含 5 分钟前台自动同步逻辑；20 篇蓝鸟新闻全部带英文正文。
5. Firebase Admin Secret 已通过 GitHub Actions 运行 `29552048767` 的 OAuth、FCM 权限和 `validate_only` 消息校验。

#### 发布边界

- 当前为与历史安装包使用同一 Android Debug 证书的本地可安装 APK，可覆盖安装并保留 App 数据。
- 尚未配置 APK 的公开 HTTPS 下载地址，因此 `public/version.json` 暂时保持远程已发布版本 `2.2.1`，避免旧版 App 检测到无法下载的更新。
- 完整运行与发布配置记录在 `docs/2.2.4-release-configuration.md`。

## 2026-07-17

### 修改批次：2.2.3 新闻正文集中同步与 Actions 失败隔离

#### 用户反馈

- `2.2.2` 手机端点击新闻后无法拉取 MLB 原文。
- GitHub Actions 从出现新文章后持续失败，QQ 邮箱每隔一段时间收到失败通知。
- 希望正文可以一次同步到 App，而不是每次点击时再由手机单独读取。

#### 排查证据

1. GitHub 公共 API 显示工作流最后一次成功运行是 `29500596461`，随后从 `29509863384` 到 `29546490936` 连续失败。
2. 失败作业均在 `Fetch MLB news and send new-item notifications` 步骤退出；checkout、Node 和依赖安装均成功。
3. 本地实测 MLB RSS 与 AMP 正文均返回 HTTP 200，当前 RSS 相比仓库数据新增 2 篇文章。
4. 首次建库时不会把已有文章视为新文章，所以此前的成功运行没有真正发送 FCM；连续失败恰好从首次出现新文章后开始。
5. 未登录的 GitHub Actions 页面不提供完整私有作业日志，因此无法确认 FCM 返回的具体状态码；修复按“任何 FCM 错误均不得阻断新闻数据更新”的边界处理。

#### 修复结构

1. 新闻任务把 MLB 官方链接转换为 AMP 地址，以 4 路并发抓取缺少正文的文章。
2. 使用 Cheerio 结构化解析 `<article>` 的直接段落、标题、引用和列表项，过滤视频回退文字、广告与导航。
3. 每篇正文限制为 120 段、40,000 字符和 768 KB HTML；已有正文直接复用，避免每 15 分钟重复抓取。
4. `public/news/blue-jays.json` 新增 `bodyEn` 段落数组；当前 20 篇全部成功，共 456 段，文件大小 `151,669` 字节。
5. App 新闻数据上限由 256 KB 调整为 1 MB，并对正文段落再次执行数量、单段和总长度校验。
6. App 展开新闻时优先直接显示已经同步的 `bodyEn`；只有旧缓存没有正文时才尝试 Android 原生 MLB 请求。
7. FCM 改为尽力发送：失败只记录日志，新闻 JSON 仍会提交，工作流保持成功，避免重复失败邮件和数据长期停滞。
8. Actions `checkout` 与 `setup-node` 升级到 v5，消除 Node 20 弃用警告。
9. 移动端预览发现浏览器仍命中旧 `team-news-core.js` 缓存；`index.html` 为全部本地 CSS/JS 增加 `v=2.2.3` 参数，确保 App 升级时加载新资源。
10. 工作流增加受路径限制的 `push` 触发器；只有新闻工作流或 worker 代码变化时立即验证，机器人只更新新闻 JSON 时不会递归触发。

#### 版本状态

- 手机端最新已生成 APK：`2.2.2 / versionCode 24`。
- 当前源码准备版本：`2.2.3 / versionCode 25`，本轮按约定不自动打包。

#### 验证

- Web 自动化测试 22 项全部通过，稳定性检查 20 项全部通过。
- 新闻任务测试 8 项全部通过，包括 AMP 解析和“FCM 失败不阻断更新”回归测试。
- 新闻任务生产依赖审计为 0 个漏洞。
- Android JVM 测试和 `lintDebug` 成功，Web 资源已同步到 Android 工程。
- 实际新闻任务完成 20 篇正文抓取，20 篇均包含正文，没有单篇失败。
- GitHub Raw 远程数据复验为 20 篇、20 篇均有正文；第一篇包含 8 个正文段落。
- 在全新浏览器存储与 `390x844` 手机视口中，App 一次同步 20 篇新闻，点击第一篇立即展开 8 段正文，没有调用 Android 原生 MLB 后备请求。
- 修复后的 GitHub Actions 推送验证运行 `29547405912` 已完成，事件为 `push`，结论为 `success`，运行约 15 秒。

### 发布批次：2.2.3 Debug APK

#### 构建结果

- 构建命令：`npm run build:android`，Gradle `assembleDebug` 执行成功。
- APK：`releases/sports-calendar-2.2.3-debug.apk`。
- 文件大小：`9,330,762` 字节。
- 包名：`com.local.sportscalendar`。
- 版本：`versionCode 25`、`versionName 2.2.3`。
- APK Signature Scheme v2 验证通过，签名证书 SHA-256 为 `7ef83e3ec40b7bf1e9aaf551589ee73c378fc26f29202255f0466bcab759bed0`。
- APK 文件 SHA-256：`5CC8A5CC909ABBC6D69E246371429394F456BDFC7A2C65A9E3D2596495D3968F`。

#### 包内验收

- 包内新闻 JSON 共 20 篇，20 篇均带有 `bodyEn` 正文。
- 包内 `index.html` 已引用 `team-news-core.js?v=2.2.3`，不会继续命中旧新闻模块缓存。
- Android 联网权限和应用名“观赛日记”均存在。

#### 发布边界

- 当前已生成本地可安装 APK，但尚未上传公开下载地址。
- `public/version.json` 暂时保持远程已发布版本 `2.2.1`，避免旧版 App 检测到无法下载的更新；上传 APK 后再更新远程清单。
