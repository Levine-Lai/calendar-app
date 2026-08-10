# 阿森纳新闻 GitHub Actions 使用说明

## 自动更新链路

1. `Update Arsenal news` 每小时在第 12、42 分钟运行，也可以在 Actions 页面手动运行。
2. 更新脚本并行读取阿森纳官方文章 Sitemap 和 Guardian 阿森纳 RSS。
3. 任一来源失败时保留该来源上一次成功缓存；只有两个来源同时失败时任务才失败，已发布 JSON 不会被覆盖。
4. 新数据写入 `public/news/arsenal.json`，Action 只提交这个文件。
5. App 依次使用 GitHub Raw、jsDelivr CDN、本地 APK 内置 JSON，因此短暂断网或单个服务异常不会让新闻页空白。

## 首次启用

1. 将本次源码提交并推送到 `main`。
2. 打开仓库的 `Actions` 页面，进入 `Update Arsenal news`。
3. 点击 `Run workflow`，选择 `main` 后运行。
4. 等待任务显示绿色完成，并确认 `public/news/arsenal.json` 出现机器人提交。

不需要新增 GitHub Token：工作流使用仓库自带的 `GITHUB_TOKEN`，并且只申请 `contents: write`。

`DEEPSEEK_API_KEY` 是可选 Secret。仓库中已经配置时会自动生成中文标题和摘要；没有配置时，英文新闻和原文链接仍会正常更新，App 中文页会回退显示英文。

## 故障判断

- `Arsenal.com source unavailable`：官网 Sitemap 或文章页暂时不可用，任务会继续使用 Guardian RSS 和上一次官网缓存。
- `Guardian RSS source unavailable`：Guardian Feed 暂时不可用，任务会继续使用阿森纳官网和上一次 Guardian 缓存。
- 两种警告同时出现：任务失败但不提交文件，App 继续使用 GitHub/CDN/本地旧缓存。
- `git push` 冲突：蓝鸟和阿森纳工作流已共用 `team-news-updates` 并发组，正常情况下会排队而不是同时推送。
