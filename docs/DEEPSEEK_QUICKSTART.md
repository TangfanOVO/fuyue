# DeepSeek 快速开始

这条路径让 API Key 留在本机 relay，浏览器只连接 `http://127.0.0.1:8787`。Key 不进入 LocalStorage、IndexedDB、导出文件、前端构建或 Git。

## 从零开始

1. 安装 Node.js 22.12+。
2. 下载或克隆公开仓，进入项目目录。
3. 安装依赖：

   ```bash
   npm install
   ```

4. 配置 Key：

   ```bash
   npm run setup:deepseek
   ```

   在提示后粘贴从 DeepSeek 平台创建的完整 API Key，再按回车。终端只显示圆点，不回显 Key。脚本只更新 DeepSeek 相关变量，不会抹掉 `.env` 中其他 relay 设置。

5. 启动前端与 relay：

   ```bash
   npm run dev:all
   ```

6. 打开 `http://localhost:4173`，进入“模型连接 → 本机 API”，点“连接本机 DeepSeek”。状态应显示 `DeepSeek V4 Flash`。
7. 回到聊天，发送一句不含隐私的测试文本。回复完整结束后，双方原文才写入同一份 LocalData 账本。

## 模型选择

默认使用 `deepseek-v4-flash`：

```bash
npm run setup:deepseek
```

切换到 `deepseek-v4-pro`：

```bash
npm run setup:deepseek -- --model deepseek-v4-pro
```

DeepSeek 官方当前把 OpenAI-compatible base URL 写为 `https://api.deepseek.com`，聊天接口为 `/chat/completions`，模型为 `deepseek-v4-flash` 与 `deepseek-v4-pro`。参见 [Your First API Call](https://api-docs.deepseek.com/quick_start/pricing-details-usd/) 和 [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)。本仓默认值于 2026-08-22 复核；将来官方改名时，只需更新 `.env` 的 `FUYUE_DEEPSEEK_MODEL` 和必要的 base URL，不必重写前端。

## 检查配置

```bash
npm run doctor:relay
```

它只显示 provider、模型和 base URL，不显示 Key。`apps/relay/.env` 应为当前系统用户可读写的 `600` 权限，并已被 `.gitignore` 排除。

## 常见错误

- “没有找到本机 relay”：确认 `npm run dev:all` 仍在运行；不要在手机上把 `127.0.0.1` 当成电脑。
- “没有配置可聊天的模型”：重新运行 `npm run setup:deepseek`，再重启 `dev:all`。
- “provider 拒绝了服务端凭据”：Key 不正确、被撤销或未生效；在 DeepSeek 平台重新生成后再次配置。
- “provider 账户余额不足”：在 DeepSeek 平台检查余额或充值。
- “请求过于频繁”或“当前繁忙”：原话已保存在本地，可用聊天错误条的“放回输入框”稍后重试。
- 浏览器跨域失败：本机前端应使用 `localhost:4173` 或 `127.0.0.1:4173`。远程部署必须在 `FUYUE_ALLOWED_ORIGINS` 写入确切 HTTPS Origin。

## 手机使用

手机无法连接电脑以外的 `127.0.0.1`。要在手机 PWA 使用自己的 DeepSeek Key，需要把 relay 部署在电脑、NAS 或 HTTPS 服务器，并按 [自托管说明](./SELF_HOSTING.md) 设置严格 Origin 和鉴权；普通手机用户可以使用符合 relay 契约的“服务地址 + 接入码”。前端不会要求用户把供应商 Key 填进网页。
