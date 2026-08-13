# 观赛日记

“观赛日记”是一款本地优先的个人体育赛程 Android App，也可以作为静态网页运行。它支持多联赛球队赛程导入、比赛状态与比分刷新、月历浏览、多伦多蓝鸟中英文新闻，以及两个 Android 桌面组件。

当前发布版为 `2.3.2 / versionCode 44`。

## 主要功能

- 选择联赛和球队，一次导入该球队当前可确定的全部赛程。
- 月历按北京时间展示比赛；点击日期查看详情并刷新当天比分。
- 支持 NBA、NFL、MLB、英超、西甲、意甲、德甲、法甲、欧冠、英冠、中超、中甲、中乙、中冠和世界杯。
- 未开始、进行中、已结束、延期、取消使用统一状态规则；进行中比分显示为红色。
- 主界面分别展示最新一篇多伦多蓝鸟和阿森纳新闻；新闻列表和详情支持位置稳定的 English/中文切换。
- 阿森纳新闻由 GitHub Actions 定时读取 Arsenal.com 官方文章 Sitemap 与 The Guardian 阿森纳 RSS，并抓取公开文章页的完整正文；单源异常时沿用旧缓存，不接入付费来源。
- 新闻通过官方 Sitemap/RSS、GitHub Raw、jsDelivr、APK 内置缓存、Android WorkManager 和 Firebase FCM 等多通道更新。
- 本地数据保存在 IndexedDB，并保留限量应急备份；无需账号。
- 左上角使用奔跑 GIF 作为菜单按钮；App 启动时不再显示全屏奔跑动画。

“赛程管理”和“智能添加赛程”当前暂时隐藏入口，底层数据与实现仍保留，可在后续版本直接恢复。新闻通知当前全天允许推送。

已删除旧版“我的偏好”、统计框、文件导入和隐藏已结束比赛筛选。升级后旧偏好不会继续暗中筛选赛程。

## 桌面组件

Android 版提供两个组件：

1. “观赛日记 组件1”：约 4×4，默认显示北京时间今天的关注比赛，支持前一天、后一天、手动刷新和列表滚动。每个组件实例独立保存日期，队徽和实时比分按日期缓存；比分 API 会自动重试，手动刷新会替换卡住的旧任务。
2. “观赛日记 组件2”：4×3，只显示最新一篇蓝鸟新闻的大图和标题。图片区约占总高度七分之五，保持完整画面并使用顶部圆角；点击打开对应文章。组件并行读取 Raw/CDN、拒绝用旧响应覆盖新缓存，每 15 分钟独立检查更新。

vivo 可能延迟系统组件刷新。需要允许后台联网，并将电池策略设置为“不限制”。

## 本地运行

直接打开项目根目录的 `index.html`，或运行任意静态文件服务器。Web 构建命令：

```powershell
npm install
npm run build:web
```

构建结果位于 `www/`。

## 开发验证

```powershell
npm test
npm run verify:stability
npm run check:apis -- --attempts=3 --timeout=15000
npm run build:web
npm run sync:android
```

新闻后台测试：

```powershell
cd firebase\functions
npm install
npm test
```

Android JVM 测试和 Lint 应在 Web 资源同步完成后串行执行，避免 Windows 文件争用：

```powershell
cd android
.\gradlew.bat testDebugUnitTest lintDebug
```

## Android 打包

项目禁止自动生成新的 Debug 签名。Debug 和 Release 构建都必须显式提供固定签名环境变量：

- `SPORTS_CALENDAR_KEYSTORE`
- `SPORTS_CALENDAR_STORE_PASSWORD`
- `SPORTS_CALENDAR_KEY_ALIAS`
- `SPORTS_CALENDAR_KEY_PASSWORD`

生成 Debug APK：

```powershell
npm run build:android
```

原始输出位于 `android/app/build/outputs/apk/debug/app-debug.apk`，发布副本保存到 `releases/`。每次发布都必须核对包名、`versionCode`、`versionName`、签名证书和 APK SHA-256。

只有用户明确说“打包”或要求生成 APK/AAB 时才执行打包。

## 新闻服务配置

GitHub Actions 需要以下 Repository Secrets：

- `FIREBASE_SERVICE_ACCOUNT_JSON`：Firebase Admin 服务账号，用于发送 FCM。
- `DEEPSEEK_API_KEY`：用于生成 `titleZh`、`summaryZh` 和 `bodyZh`。

Secrets 不得进入网页、APK、新闻 JSON、日志或 Git。`android/app/google-services.json` 仅用于 Android FCM 客户端注册，不是 Admin 私钥。

新闻翻译参考位于 `firebase/functions/translation-reference.json`。

## 应用内更新

左侧菜单底部提供“检查更新”，只在用户点击时读取远程 `version.json`。发布顺序必须是先上传 GitHub Release APK，再把远程清单切到新版本，避免用户看到无法下载的更新。

发布新版本时需要同步：

1. `package.json` 和根 lockfile。
2. `firebase/functions/package.json` 和 lockfile。
3. `android/app/build.gradle`。
4. `public/update-config.js`。
5. `index.html` 的静态资源缓存版本。
6. Android 网络 User-Agent。
7. `CHANGELOG.md` 和 `context.md`。

## 数据源

- NBA、NFL、MLB 和多数欧洲足球赛事：ESPN。
- 中超、中甲、中乙：CFL 官方接口；中超同时作为 ESPN 缺失队徽的官方兜底来源。
- 中冠：中国足协数据接口。
- 蓝鸟新闻：MLB 官方 RSS/AMP，以及 GitHub Raw/jsDelivr 静态新闻数据。

外部数据源没有正式 SLA。字段发生变化时，应优先修复数据归一层，不把供应商字段直接扩散到 UI。

`check:apis` 会同时检查当前启用的 ESPN 日赛程、球队目录和代表性球队赛程，以及 CFL 中超队徽兜底/中甲/中乙和中国足协中冠接口。ESPN 足球整季赛程按最多 45 天分段、最多 3 段并发获取，每段保留重试；CFA JSONP 同样保留重试，避免一次长响应或短暂网络波动让整季赛程消失。欧冠在 ESPN 尚未发布当季确认赛程时可能返回 0 条，这属于上游数据尚未开放，不等同于连接失败。

## 项目记录

- `AGENTS.md`：协作规则和打包边界。
- `context.md`：完整开发上下文、验证结果和兼容说明。
- `CHANGELOG.md`：面向用户的版本变化。
- `AGENT_HANDOFF.md`：当前工程交接状态。

每次修改都应更新 `context.md`；版本变化同步维护 `CHANGELOG.md`。
