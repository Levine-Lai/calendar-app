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

## 桌面小组件

Android 版内置一个 4x4 桌面小组件。小组件读取你在 App 里已经导入的关注赛程，并按北京时间筛选“今天”的比赛。画面固定显示三行；当天超过三场时可上下滑动，也可用箭头每次精确翻动一场。

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

NBA、MLB、英超和中超等联赛读取 ESPN；中甲、中乙读取 TheSportsDB；中冠读取中国足协官网 2026 赛程。球队列表会根据选定日期范围中的真实比赛扫描生成。

## 导入流程

1. 选择联赛。
2. 选择开始和结束日期。
3. 等球队区扫描出这个日期范围内有比赛的球队。
4. 选择一支球队。
5. 点击“导入所选球队赛程”。
6. 右侧月份日历会显示这些球队的比赛。
