# 观赛日记 Agent 工程交接

最后核对：2026-08-28
项目目录：`D:\l\78\calendar`
仓库：`Levine-Lai/calendar-app`  
包名：`com.local.sportscalendar`

## 当前可交付状态

- 当前源码版本：`2.3.3 / versionCode 45`；Cloudflare Worker 已部署，客户端 endpoint 已指向 Worker 且已通过真实请求验证。
- 本机最新 APK：`2.3.3 / versionCode 45`。
- GitHub 最新已发布 APK：`2.3.3 / versionCode 45`。
- APK：`releases/sports-calendar-2.3.3-debug.apk`。
- APK 大小：`8,196,127` 字节。
- APK SHA-256：`B17304D64F445BDFCED1B3A02243CED5B7C5D1D904A2BE09FDF974F942438451`。
- 签名：APK Signature Scheme v2。
- 签名证书 SHA-256：`7EF83E3EC40B7BF1E9AAF551589EE73C378FC26F29202255F0466BCAB759BED0`。
- GitHub Release：`https://github.com/Levine-Lai/calendar-app/releases/tag/v2.3.3`。
- App 内远程更新已启用：`public/version.json` 发布 `2.3.3 / versionCode 45`，下载地址为 GitHub Release 页面，兼容旧版 App 打开浏览器。
- GitHub 远程资产与本机 APK 大小、SHA-256 完全一致。

## 必须遵守

1. 用户没有明确说“打包”、要求 APK/AAB 或“发布新版本到 GitHub”时，不执行 Android 打包或签名验证；“发布新版本到 GitHub”表示执行完整 APK + Release + 更新清单流程。
2. 如果源码完成但用户未要求打包，告知下一个版本号并等待指令。
3. 不执行 `git reset --hard`、`git checkout -- .`、`git clean` 等会丢弃本地工作区的命令。
4. 不提交 keystore、Firebase Admin JSON、DeepSeek Key 或其他私钥。
5. 修改后追加 `context.md`，版本变化更新 `CHANGELOG.md`。

完整规则以根目录 `AGENTS.md` 为准。

## 本次交接已补齐

- 2.3.2 移除 Web 全屏开屏动画与 Android 热启动重播逻辑；`launch-runner.gif` 现在作为左上角菜单按钮显示。
- 赛程管理与智能添加赛程的 DOM 入口用 `hidden` 暂时隐藏，相关本地解析、Cloudflare Worker、语音桥接和用户数据均保留。
- Arsenal.com 正文从 `__NEXT_DATA__.props.pageProps.article.articleBody` 抽取，正文 DOM 作为兜底；Guardian RSS 会继续尝试抓取公开文章页。内置 Arsenal 缓存已更新为完整官网正文及逐段中文翻译。
- 更新按钮把 GitHub APK 资源地址转换为 Release 页面，并通过 Android `ACTION_VIEW` 默认浏览器打开；不再使用会被部分 vivo 系统错误分流的 APK 直链/自建 chooser 组合。
- 北京时间 00:00–08:59 静默逻辑已从服务端发送、本机轮询与 FCM 接收三处删除，新闻通知恢复全天推送。

- 日历每日详情中的每场比赛都可单独删除；点击后必须二次确认。删除记录会保存在 `dismissedEventIds`，并在以后刷新已导入赛程时持续过滤同一赛事 ID，同时同步桌面组件。

- 旧交接文档基于 `2.2.9` 和已不存在的 `D:\l\78\calendar`；本文件以当前目录为准。
- 组件2已从旧 2×2 比赛详情卡片改为 4×3 最近蓝鸟新闻卡片。
- 组件2大图贴住顶部并带圆角，标题保持 19sp 两行，只显示最新一条；图片以 `fitCenter` 完整展示，不再中心裁掉边缘。
- 组件2已移除 `StackView`，Provider 直接装载最新一条新闻；图片和标题按约 5:2 分配高度，不再出现系统卡片内缩。
- 组件2每 15 分钟独立刷新，Raw/jsDelivr 并行请求并附带缓存破坏参数；主动刷新使用 expedited WorkManager，只缓存最新一条，并拒绝用较旧响应覆盖已有新内容。
- 蓝鸟新闻 GitHub Actions 先提交新闻 JSON，再等待 GitHub Raw 返回同一篇最新文章，确认可读后才发送 FCM；App 从通知进入但暂未找到文章时会按 1.5/3/5/8/12 秒自动刷新重试。
- 新闻文章只允许 MLB 官方 HTTPS 链接，图片只允许 `img.mlbstatic.com`。
- 图片和标题缓存在 App 内部目录；更新失败保留旧缓存。
- 点击组件2通过 `OPEN_TEAM_NEWS` 打开对应文章。
- 已删除 `SportsDetailWidgetService` 和旧比赛详情 item；组件1与组件2的刷新任务已解耦。
- 组件1跨日期实时快照按日期保存，切换明日/后日不会被其他日期覆盖。
- 首页偏好、三个统计框、文件导入和冗余新闻成功状态已删除。
- App 不再显示全屏奔跑 GIF；素材已改为左上角菜单按钮。
- 所有 Web 组件和文字阴影已通过全局规则移除；Android 桌面组件没有使用 elevation 阴影。
- 通知和组件进入 App 时直接处理目标页面，不再经过开屏动画或延迟计时。
- Android 原生启动页和 WebView 首帧都使用 `#C5E5F8` 纯蓝背景，原生启动图标改为透明占位，避免启动阶段闪图标或闪米色。
- ESPN 足球整季赛程最多按 45 天分段、最多 3 段并发获取；每段保留请求重试。CFA JSONP 也有重试，球队目录为空时可从赛程反推球队。
- 首页日历上方的“今日比赛”列表当前已暂时移除；桌面组件1默认显示北京时间今天，旧版默认停在明天的实例会自动迁移回今天。
- 深圳新鹏城赛程遇到 ESPN 空队徽时，会从 CFL 中超官方赛程按球队名称补齐；重庆铜梁龙和辽宁铁人另有内置官方 HTTPS 地址作为离线规则兜底。
- 首页“今日比赛”不再使用总容器或标题/数量标记；每场独立为无阴影的磨砂玻璃卡片，仅显示双方无边框队徽和比分（未开始时显示时间）。日历按周一至周日排列。
- 新闻详情按 `文章 ID + 语言` 保存滚动位置；打开另一篇文章时强制从顶部开始，回到已读文章时恢复各自位置。
- 运行 `npm.cmd run check:apis -- --attempts=3 --timeout=15000` 可检查当前全部比赛数据通道。2026-08-04 实测 39 个检查项连续 3 轮全部成功；CFL 中超队徽兜底返回 240 场，欧冠传输正常但当前赛季暂时返回 0 条。
- README 已更新到当前产品形态。
- 新闻后台 `fast-xml-parser` 已升级至 `5.10.1`，生产依赖审计为 0。
- 新闻后台间接依赖 `undici` 已由 7.28.0 升级为 7.29.0，修复 2026-08-05 审计发现的高危公告；生产依赖审计恢复为 0。
- Web 构建会排除跑步试验 GIF/精灵表，只把正式菜单按钮 GIF 放入 APK。
- Android 构建会先删除精确的旧输出 APK，避免重复签名导致包体膨胀。

## 两个桌面组件

### 组件1：关注比赛

- Provider：`MlbTodayWidgetProvider`。
- Service：`SportsWidgetService`。
- Worker：`WidgetRefreshWorker`。
- 约 4×4；初始默认北京时间今天，支持前一天、后一天、刷新和滚动列表；比赛 JSON 单次请求最多尝试三次，手动刷新会替换卡住的旧任务。
- 每个实例独立保存日期；实时比分和队徽按日期缓存。

### 组件2：最近新闻

- Provider：`MatchDetailWidgetProvider`（为兼容已安装组件保留旧类名）。
- Provider 直接装载最新一条新闻，不再通过 `StackView`/RemoteViews Service 渲染；旧 `NewsWidgetService` 仅为安装兼容保留，当前布局不依赖它。
- 数据：`TeamNewsWidgetData`。
- Worker：`NewsWidgetRefreshWorker`。
- 布局：`widget_match_detail.xml`，目标 4×3。
- 每 15 分钟独立更新；网络失败保留缓存。
- 不要恢复 `SportsDetailWidgetService`。

## 左上角奔跑菜单按钮

- 原始素材：`Running- Raynaud.gif`。
- 正式素材：`public/assets/branding/launch-runner.gif`。
- 正式 GIF 素材：512×512、38 帧、3000ms、845,504 字节；由 `#menuToggle` 内的 `.menu-runner` 循环展示。
- `public/launch-animation.js` 已删除，不要恢复全屏计时器。
- Android 必需的系统启动背景：`#FBF4EA`，与首页底色一致且不显示动画图标。
- `scripts/prepare-launch-gif.py` 可复用来裁剪后续 GIF。

## 当前验证基线

- 根目录 `npm test`：29 项。
- `npm run verify:stability`：30 项。
- `npm run check:apis -- --attempts=3 --timeout=15000`：39 个检查项全部 3/3 成功。
- `firebase/functions` 的 `npm test`：23 项。
- `firebase/functions` 的 `npm audit --omit=dev`：0 个漏洞。
- Android `testDebugUnitTest`：成功。
- Android `lintDebug`：成功。
- 2.2.16 APK 的包名、版本、v2 签名、证书指纹和 SHA-256 均已核对。

## 环境

- Node/npm 已安装；PowerShell 若阻止 `npm.ps1`，使用 `npm.cmd`。
- Python 全局路径：`C:\Users\24979\AppData\Local\Programs\Python\Python314\python.exe`。
- JDK 21：`C:\Users\24979\AppData\Local\AndroidBuildTools\jdk21\jdk-21.0.12+8`。
- Android SDK：`C:\Users\24979\AppData\Local\Android\Sdk`。
- 固定 keystore 当前位于 `android/app/sports-calendar-debug.keystore`，受 `.gitignore` 保护。

## 验证顺序

```powershell
npm.cmd test
npm.cmd run verify:stability
npm.cmd run check:apis -- --attempts=3 --timeout=15000

cd firebase\functions
npm.cmd ci
npm.cmd test
npm.cmd audit --omit=dev

cd ..\..
npm.cmd run sync:android

cd android
.\gradlew.bat testDebugUnitTest lintDebug --no-daemon --console=plain
```

不要同时运行 Capacitor sync 与 Gradle，Windows 可能争用资源文件。

## 打包

只有用户明确要求后执行：

```powershell
npm.cmd run build:android
```

构建需要四个 `SPORTS_CALENDAR_*` 环境变量。`scripts/build-android.js` 会在 Gradle 前读取证书并强制比对历史 SHA-256，不匹配立即停止。

构建后必须：

1. 将 `android/app/build/outputs/apk/debug/app-debug.apk` 复制到版本化的 `releases/` 路径。
2. 用 `aapt dump badging` 检查包名、versionCode 和 versionName。
3. 用 `apksigner verify --verbose --print-certs` 检查 v2 签名与证书指纹。
4. 确认原始输出和发布副本 SHA-256 相同。
5. 把结果写入 `CHANGELOG.md` 和 `context.md`。

## 仍未完成的外部发布事项

- `2.2.16` 已有稳定公开 HTTPS APK 地址，远程 `public/version.json` 与 App 内检查更新已启用。
- 未执行真实 vivo 设备的覆盖安装、启动动画、两个组件和通知手工验收。
- 当前工作区包含多轮未提交改动；如需提交，必须整体审查后统一提交，不能只选少量文件。
