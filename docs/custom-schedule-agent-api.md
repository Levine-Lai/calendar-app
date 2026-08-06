# 智能赛程解析服务约定

App 会把用户输入的自然语言或语音转写文本发送到一个**自有 HTTPS 服务**。服务端再调用用户选择的 AI（例如 DeepSeek 或 OpenAI 兼容 API），这样 API Key 不会出现在 APK 或网页源码中。

## 请求

`POST` 到 `public/custom-schedule-agent-config.js` 中配置的 `endpoint`：

```json
{
  "input": "阿森纳在 8 月 26 日晚上 8 点主场打赫罗纳",
  "referenceDate": "2026-08-05T12:00:00.000Z",
  "locale": "zh-CN"
}
```

## 响应

服务只返回以下 JSON，不要返回解释性文字：

```json
{
  "schedule": {
    "date": "2026-08-26",
    "time": "20:00",
    "homeTeam": "阿森纳",
    "awayTeam": "赫罗纳",
    "orientation": "explicit-home"
  }
}
```

如果原句没有明确日期、时间或球队，保留对应字段为空字符串。App 会显示确认预览并要求补充，绝不让模型虚构信息。

## 安全要求

- 服务必须是 HTTPS，并只接受 `POST` JSON。
- API Key 只保存为服务端环境变量或 GitHub/Firebase Secret。
- 服务应限制请求频率、正文长度和响应大小，并配置仅允许 App 所需来源的 CORS。
- App 在服务不可用时会自动回退到本地规则解析；复杂口语建议在服务恢复后重新识别。

## Cloudflare Workers 部署

仓库已提供 `workers/custom-schedule-agent/` 和 GitHub Actions 工作流 `.github/workflows/deploy-custom-schedule-agent.yml`。Worker 通过 `POST /v1/parse` 调用 DeepSeek V4，并将 Key 仅作为 Cloudflare Secret 使用。

GitHub Actions 还需配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`；已有的 `CUSTOM_SCHEDULE_AI_API_KEY` 会在部署时安全写入 Worker。部署输出 `workers.dev` 地址后，再填写 `public/custom-schedule-agent-config.js` 的 `endpoint`。
