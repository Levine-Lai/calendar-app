# 观赛日记维护上下文

## 记录规则

- 每次修复、功能调整、数据源变更或打包发布后，都必须在本文末尾追加记录。
- 每个自然日使用独立的 `## YYYY-MM-DD` 标题；同一天有多次修改时，在日期下追加新的 `### 修复批次`。
- 每条记录至少包含：用户目标、问题原因、实现方案、数据兼容、涉及文件、验证结果和未解决限制。
- 不覆盖旧记录。架构发生变化时，更新“当前结构”，同时在当日记录中说明迁移原因。
- 除非用户明确要求，修改后只做 Web/Android 编译验证，不自动生成 APK。

## 当前结构

### Web 页面

- `index.html`：静态页面入口，先加载 `public/calendar-core.js`，再加载 `public/app.js`。
- `public/calendar-core.js`：无 DOM 依赖的核心规则，可在浏览器和 Node 测试中复用。
  - 管理比赛与多支关注球队的关联。
  - 迁移旧版单一 `importedTeamId` 数据。
  - 合并、解绑比赛关联。
  - 解析布尔值、月份 42 天范围和带 `TZID` 的 ICS 时间。
- `public/app.js`：页面状态、各数据源适配、导入更新、筛选、日历和组件同步。
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
- TheSportsDB：中甲、中乙。
- 中国足协：中冠。
- 欧洲跨年赛季、NBA 赛季和中国自然年赛季由函数动态解析。
- 中冠的年度赛事 ID 无法从年份可靠推导，集中保存在 `providerSeasonOverrides`；进入新赛季时只需在此处新增映射，未配置时会明确报错，不会返回旧赛季。

### Android App 与组件

- `SportsWidgetPlugin`：仅在比赛数据变化时把 Web 数据写入原生 SharedPreferences。
- `MlbTodayWidgetProvider`：读取北京时间今日比赛，先显示本地数据，再补实时比分。
- `SportsWidgetService`：只读取已经准备好的比赛和队徽缓存，不在列表回调中联网。
- `WidgetRefreshWorker`：联网时约每 15 分钟请求一次组件更新；Android/vivo 仍可能根据省电策略延迟执行。
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
