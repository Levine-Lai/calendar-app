# 观赛日记 Agent 工程交接

最后核对：2026-08-03  
项目目录：`D:\Codex\calendar-app`  
仓库：`Levine-Lai/calendar-app`  
包名：`com.local.sportscalendar`

## 当前可交付状态

- 当前源码和本机最新 APK：`2.2.14 / versionCode 36`。
- GitHub 最新已发布 APK：`2.2.14 / versionCode 36`。
- APK：`releases/sports-calendar-2.2.14-debug.apk`。
- APK 大小：`8,045,540` 字节。
- APK SHA-256：`E87511485A17F0A53EC1CE6C1727EF320632DE26F83F86F4B5EBF5FB63AFF4F6`。
- 签名：APK Signature Scheme v2。
- 签名证书 SHA-256：`7EF83E3EC40B7BF1E9AAF551589EE73C378FC26F29202255F0466BCAB759BED0`。
- GitHub Release：`https://github.com/Levine-Lai/calendar-app/releases/tag/v2.2.14`。
- App 内远程更新已启用：`public/version.json` 发布 `2.2.14 / versionCode 36`，下载地址为 GitHub Release 固定 HTTPS 资源。
- 联网实测：2.2.11/2.2.12 的 versionCode 会识别 2.2.14 为新版；2.2.14 页面点击“检查更新”显示“已是最新版本”，无控制台错误。

## 必须遵守

1. 用户没有明确说“打包”或要求 APK/AAB 时，不执行 Android 打包或签名验证。
2. 如果源码完成但用户未要求打包，告知下一个版本号并等待指令。
3. 不执行 `git reset --hard`、`git checkout -- .`、`git clean` 等会丢弃本地工作区的命令。
4. 不提交 keystore、Firebase Admin JSON、DeepSeek Key 或其他私钥。
5. 修改后追加 `context.md`，版本变化更新 `CHANGELOG.md`。

完整规则以根目录 `AGENTS.md` 为准。

## 本次交接已补齐

- 旧交接文档基于 `2.2.9` 和已不存在的 `D:\l\78\calendar`；本文件以当前目录为准。
- 组件2已从旧 2×2 比赛详情卡片改为 4×3 最近蓝鸟新闻卡片。
- 组件2大图贴住顶部并带圆角，标题保持 19sp 两行，只显示最新一条。
- 组件2每 15 分钟独立刷新，读取 GitHub Raw/jsDelivr，按发布时间缓存最新一条新闻。
- 新闻文章只允许 MLB 官方 HTTPS 链接，图片只允许 `img.mlbstatic.com`。
- 图片和标题缓存在 App 内部目录；更新失败保留旧缓存。
- 点击组件2通过 `OPEN_TEAM_NEWS` 打开对应文章。
- 已删除 `SportsDetailWidgetService` 和旧比赛详情 item；组件1与组件2的刷新任务已解耦。
- 组件1跨日期实时快照按日期保存，切换明日/后日不会被其他日期覆盖。
- 首页偏好、三个统计框、文件导入和冗余新闻成功状态已删除。
- App 启动显示 1.5 秒蓝色背景奔跑 GIF，并以 220ms 淡出。
- README 已更新到当前产品形态。
- 新闻后台 `fast-xml-parser` 已升级至 `5.10.1`，生产依赖审计为 0。
- Web 构建会排除跑步试验 GIF/精灵表，只把正式开屏 GIF 放入 APK。
- Android 构建会先删除精确的旧输出 APK，避免重复签名导致包体膨胀。

## 两个桌面组件

### 组件1：关注比赛

- Provider：`MlbTodayWidgetProvider`。
- Service：`SportsWidgetService`。
- Worker：`WidgetRefreshWorker`。
- 约 4×4；支持前一天、后一天、刷新和滚动列表。
- 每个实例独立保存日期；实时比分和队徽按日期缓存。

### 组件2：最近新闻

- Provider：`MatchDetailWidgetProvider`（为兼容已安装组件保留旧类名）。
- Service：`NewsWidgetService`，为组件提供最新一条新闻卡片。
- 数据：`TeamNewsWidgetData`。
- Worker：`NewsWidgetRefreshWorker`。
- 布局：`widget_match_detail.xml`，目标 4×3。
- 每 15 分钟独立更新；网络失败保留缓存。
- 不要恢复 `SportsDetailWidgetService`。

## 开屏动画

- 原始素材：`Running- Raynaud.gif`。
- 正式素材：`public/assets/branding/launch-runner.gif`。
- 正式 GIF 素材：512×512、38 帧、3000ms、845,504 字节；页面只展示前 1.5 秒。
- 页面计时：`public/launch-animation.js`。
- Android 启动背景：`#C5E5F8`。
- `scripts/prepare-launch-gif.py` 可复用来裁剪后续 GIF。

## 当前验证基线

- 根目录 `npm test`：29 项。
- `npm run verify:stability`：28 项。
- `firebase/functions` 的 `npm test`：23 项。
- `firebase/functions` 的 `npm audit --omit=dev`：0 个漏洞。
- Android `testDebugUnitTest`：成功。
- Android `lintDebug`：成功。
- 最终 APK 的包名、版本、v2 签名、证书指纹和 SHA-256 均已核对。

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

- `2.2.14` 已有稳定公开 HTTPS APK 地址，远程 `public/version.json` 与 App 内检查更新已启用。
- 未执行真实 vivo 设备的覆盖安装、启动动画、两个组件和通知手工验收。
- 当前工作区包含多轮未提交改动；如需提交，必须整体审查后统一提交，不能只选少量文件。
