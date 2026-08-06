# Cloudflare Worker: 智能赛程代理

此 Worker 是 App 与 DeepSeek V4 之间的唯一代理。它只接受受限来源的 `POST /v1/parse`，限制正文、响应、超时和每客户端频率；DeepSeek Key 只保存在 Cloudflare Secret 中。

## 首次部署

1. 在 GitHub Actions Secrets 中配置部署所需的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；现有的 `CUSTOM_SCHEDULE_AI_API_KEY` 用于 DeepSeek。
2. 安装依赖并验证：`npm ci`、`npm test`、`npm run check`。
3. 执行最新版 `npx wrangler@latest deploy --secrets-file .dev.vars`，或使用仓库中的 GitHub Actions 工作流。
4. Cloudflare 部署输出 `https://<worker>.<account>.workers.dev` 后，将 `public/custom-schedule-agent-config.js` 的 `endpoint` 设置为该域名加 `/v1/parse`。

Cloudflare Worker 的 Secret 名称为 `CUSTOM_SCHEDULE_AI_API_KEY`，值应与 DeepSeek API Key 相同。不要提交 `.dev.vars`，也不要把密钥写入 `wrangler.toml`。
