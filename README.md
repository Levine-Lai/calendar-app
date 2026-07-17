# 体育迷日历

一个本地静态页面版的个人体育赛程日历。内置 NBA、MLB、英超 26-27，以及中超、中甲、中乙、中冠等足球赛程导入，支持上传 `.ics`、`.csv`、`.json`。

## 打开

直接双击 `index.html`，或在浏览器中打开这个文件：

```text
D:\l\78\calendar\index.html
```

## Android App 打包

这个项目已经接入 Capacitor，可以把静态页面打包成 Android App，应用名为“观赛日记”。

```powershell
npm install
npm run build:android
```

Debug APK 输出位置：

```text
D:\l\78\calendar\android\app\build\outputs\apk\debug\app-debug.apk
```

连接 vivo 手机并开启 USB 调试后，可以用 adb 安装：

```powershell
adb devices -l
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## 开发验证

```powershell
npm test
npm run build:web
npm run sync:android
```

每次修复的背景、结构变化、兼容方式和验证结果记录在 [`context.md`](context.md)。后续修改必须按日期追加记录。

## 应用内检查更新

左拉菜单底部提供“检查更新”。App 只在用户点击时读取 `public/update-config.js` 配置的远程 `version.json`，不会在启动时自动联网检查。

发布新版本时需要同步修改：

1. `package.json` 的版本号。
2. `android/app/build.gradle` 的 `versionCode` 和 `versionName`。
3. `public/update-config.js` 中 App 自身的版本号。
4. `public/version.json` 中最新版本、HTTPS 下载地址和更新说明。
5. 将 `public/version.json` 上传到配置的远程地址后，旧版 App 才能发现新版本。

远程清单示例：

```json
{
  "versionCode": 22,
  "versionName": "2.2.0",
  "apkUrl": "https://example.com/sports-calendar-2.2.0.apk",
  "notes": ["修复比分刷新", "优化组件显示"],
  "force": false
}
```

## 桌面小组件

Android 版内置一个 4x4 桌面小组件。小组件读取你在 App 里已经导入的关注赛程，并按北京时间筛选“今天”的比赛。画面固定显示三行；当天超过三场时可上下滑动，也可用箭头每次精确翻动一场。组件先显示本地赛程，再在联网时后台补充实时比分和队徽缓存；系统大约每 15 分钟尝试刷新一次，实际时间可能受 vivo 省电策略影响。

使用流程：

1. 安装新版 APK。
2. 打开“观赛日记”。
3. 选择联赛和球队，导入这支球队的赛程。
4. 回到桌面添加“观赛日记”小组件。
5. 如果小组件已经在桌面上，重新打开 App 或再次导入/刷新赛程会同步更新小组件。

## 功能

- 从联赛预设导入球队赛程，英超支持 26-27 整季范围，并加入中超、中甲、中乙、中冠。
- 导入前先选择具体球队，一次只能选择并导入一支球队，不再默认导入整个联赛。
- 通过关键词关注球队，例如 `Lakers, Arsenal, Dodgers`。
- 按月份翻页的日历视图。
- 隐藏已结束比赛。
- 本地浏览器保存，不需要账号。
- 新粗野派界面：粗边框、硬阴影、高对比色块。

## 文件导入格式

CSV 表头示例：

```csv
title,start,league,venue,broadcast,url
Lakers at Warriors,2026-01-01T03:00:00Z,NBA,Chase Center,ESPN,https://example.com
```

JSON 示例：

```json
[
  {
    "title": "Arsenal at Liverpool",
    "start": "2026-01-01T20:00:00Z",
    "league": "英超",
    "venue": "Anfield"
  }
]
```

## 数据说明

NBA、MLB、英超和中超等联赛读取 ESPN；中甲、中乙读取 TheSportsDB；中冠读取中国足协官网 2026 赛程。所有内置联赛均按当前赛季读取全部已确定比赛，不需要手动选择日期范围。

多伦多蓝鸟新闻由 GitHub Actions 每 15 分钟读取 MLB 官方 RSS，并集中抓取最近 20 篇文章的英文正文后更新 `public/news/blue-jays.json`。App 启动、回到前台、网络恢复及保持打开期间都会自动同步，并同时尝试 jsDelivr、GitHub Raw 和 Android 原生网络。Firebase 仅用于可选的 FCM 主题通知，不需要 Blaze 或 Firestore；FCM 失败不会阻断新闻文件更新。

2.2.4 的完整安装、GitHub、Firebase、vivo 后台权限、应用内更新和正式签名配置见 `docs/2.2.4-release-configuration.md`。

## 导入流程

1. 选择联赛。
2. 等球队区加载该赛季参赛球队。
3. 选择一支球队。
4. 点击“导入该球队全部赛程”。
5. 顶部“更新”会一次刷新所有已关注球队的完整已确定赛程。
6. 右侧月份日历会显示这些球队的比赛。
