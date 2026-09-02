# 自托管 relay

`apps/relay` 是最小参考后端。它把所有供应商凭据留在服务器，通过一份稳定契约给 Web 前端提供状态、流式聊天、日程和可见心情。

## 本机开发

DeepSeek 用户推荐使用不会回显 Key 的配置命令：

```bash
npm run setup:deepseek
npm run dev:all
```

要一次配置聊天与可选 ElevenLabs / 豆包语音，使用：

```bash
npm run setup
```

向导只在交互式终端读取密钥，不接受包含 Key 的命令行参数，并把 `.env` 权限设为 `600`。
整屋向导还会把固定版本的 Engawa MCP 安装到 `.runtime/engawa`。`npm run dev:all` 检测到它后会只在 `127.0.0.1:8179` 启动侧车；relay 才能访问它，浏览器不会直连。也可以单独运行 `npm run setup:engawa`。

其他 provider 可以复制示例后手工配置：

```bash
cp apps/relay/.env.example apps/relay/.env
npm run dev:relay
```

默认监听 `127.0.0.1:8787`，只允许来自 `localhost:4173` 和 `127.0.0.1:4173` 的浏览器请求。没有可用 provider 时 relay 会启动，但前端不会把它保存为可聊天连接。

## 只用手机的订阅接入

公开前端支持“服务地址 + 订阅接入码”。服务端配置 `FUYUE_ACCESS_CODE` 后，PWA 会把接入码交换成 HttpOnly 会话，成功后不保存接入码：

```dotenv
FUYUE_ACCESS_CODE=至少十六个字符的随机接入码
```

参考实现使用单一接入码、进程内会话和十分钟失败限流，适合个人、小家庭或局域网。面向公众收费时，应把 `/v1/session/exchange` 接到正式的登录、支付、撤销和共享 Session 存储；前端契约无需改变。

### DeepSeek

只设置 Key 即可使用当前默认值：

```dotenv
FUYUE_ACTIVE_PROVIDER=deepseek
FUYUE_DEEPSEEK_API_KEY=...
```

默认 base URL 为 `https://api.deepseek.com`，模型为 `deepseek-v4-flash`。也可显式设置 `FUYUE_DEEPSEEK_MODEL=deepseek-v4-pro`。当前值于 2026-08-22 依据 [DeepSeek Your First API Call](https://api-docs.deepseek.com/quick_start/pricing-details-usd/) 复核。

### OpenAI Responses API

官方 OpenAI 端点使用 Responses API：

```dotenv
FUYUE_ACTIVE_PROVIDER=openai-compatible
FUYUE_OPENAI_BASE_URL=https://api.openai.com/v1
FUYUE_OPENAI_API_KEY=...
FUYUE_OPENAI_MODEL=当前账号可用的模型名
```

只有官方 `https://api.openai.com/v1` 会选择 Responses 适配器；自定义 base URL 使用 OpenAI-compatible Chat Completions 适配器。

### 其他 OpenAI-compatible

至少填写：

```dotenv
FUYUE_ACTIVE_PROVIDER=openai-compatible
FUYUE_OPENAI_BASE_URL=https://provider.example/v1
FUYUE_OPENAI_API_KEY=...
FUYUE_OPENAI_MODEL=...
```

适配器使用常见的 `POST /chat/completions` SSE 形状。自托管推理服务是否兼容，以它当前的文档与实测为准。

### Gemini

至少填写：

```dotenv
FUYUE_ACTIVE_PROVIDER=gemini
FUYUE_GEMINI_API_KEY=...
FUYUE_GEMINI_MODEL=...
```

适配器使用 Google 当前的 Interactions SSE 接口；模型名由部署者填写，因此升级模型不需要重写前端。参考 [Gemini Streaming interactions](https://ai.google.dev/gemini-api/docs/streaming)。

### Anthropic Messages

```dotenv
FUYUE_ACTIVE_PROVIDER=anthropic
FUYUE_ANTHROPIC_API_KEY=...
FUYUE_ANTHROPIC_MODEL=当前账号可用的模型名
```

### GLM、Qwen、Kimi 与 OpenRouter 预设

这四类预设已包含当前默认 base URL 和模型别名。填一枚 Key 即会出现在 status；发布者仍应在实际使用前对照供应商当前官方文档，并可用 `MODEL` / `BASE_URL` 覆盖：

```dotenv
FUYUE_ACTIVE_PROVIDER=glm
FUYUE_GLM_API_KEY=...
FUYUE_GLM_MODEL=...

# 同理可使用 FUYUE_QWEN_*、FUYUE_KIMI_* 或 FUYUE_OPENROUTER_*
```

多个 provider 可以同时配置，`GET /v1/status` 会显示全部；`FUYUE_ACTIVE_PROVIDER` 决定当前使用哪一个，修改后重启 relay。

ChatGPT 或 Google AI 消费订阅不是这里的 API Key，不要把浏览器 Cookie 或账号 Token 填入 `.env`。

## 日程与可见心情

`FUYUE_LIFE_FILE` 可以指向 JSON 数组，字段遵循 `GET /v1/life/overview` 契约。`FUYUE_MOOD_FILE` 可以指向一份可见心情 JSON 或返回空值；非空快照必须同时包含 `updatedAt` 和可审计的非空 `sourceLabel`。relay 只读这两个文件，不会扫描日历、聊天或私人目录。

## 远程部署

### 只用手机：Render 按钮

README 的 **Deploy relay to Render** 会从根目录 `Dockerfile` 只构建 `packages/core` 和 `apps/relay`。Render 首次创建时会要求填写 `FUYUE_ACCESS_CODE` 与 `FUYUE_DEEPSEEK_API_KEY`；它们是运行时 Secret，不会写进仓库或镜像。

成功后复制 Render 的 HTTPS 地址，在赴约“模型连接 → 手机服务”中输入地址和同一个接入码。容器不持有 LocalData；它休眠或重启不会删除手机里的聊天、记忆或人设，但进程内的 HttpOnly 会话会失效，需重新用接入码连接。

iPhone / iPad 的 LocalData 位于安装 PWA 所使用的网站 Origin 对应的浏览器存储，不在 Render。平台提供的 HTTPS 域名就能使用，并非必须购买自有域名；但不要随意从 GitHub Pages 换到另一个域名，因为不同 Origin 会看到不同的本地资料库。清除网站数据、删除对应浏览器资料或系统回收存储仍可能造成丢失，长期使用应定期导出完整 `fuyue-portable` 备份。

默认只允许 `https://tangfanovo.github.io` 这个 Origin。如果部署者使用自己 fork 后的 Pages 或自定义网站，必须把 Render 里的 `FUYUE_ALLOWED_ORIGINS` 改成自己网站的 Origin（只到域名，不带路径和末尾斜杠）。

参考服务器只提供可选的单接入码会话，不是公众账号系统。公网部署必须满足：

1. relay 放在带登录或单点鉴权的 HTTPS 反向代理后面。
2. 只把自己的前端 Origin 写入 `FUYUE_ALLOWED_ORIGINS`。
3. 反向代理关闭响应缓冲，保留 SSE。
4. 密钥只进入服务端 Secret / 环境变量，不进入镜像、仓库、浏览器或日志。
5. 完成以上配置后，才设置 `FUYUE_RELAY_HOST=0.0.0.0` 与 `FUYUE_TRUSTED_PROXY=1`。

`FUYUE_TRUSTED_PROXY=1` 只是显式安全确认，不会替你实现鉴权。没有真实鉴权代理时不要把端口暴露到公网。

## Web / PWA

```bash
npm run build -w @fuyue/web
```

把 `apps/web/dist` 部署到支持 SPA 回退的 HTTPS 静态站点。Service Worker 不拦截 `/v1/*`，避免把状态、日程或心情缓存成旧数据。安装后的离线壳仍能使用 IndexedDB；模型请求在离线时会显示可恢复错误。

GitHub fork 可在 Actions 手动运行 **Deploy PWA to GitHub Pages**，也会在推送到 `main` 时自动触发。首次需在仓库 Settings → Pages 将 Source 设为 GitHub Actions；不想自动部署时，应先删除或关闭 workflow 的 `push` 触发。该 workflow 先运行全部测试，然后部署静态 PWA；它不部署 relay，也不会将 `.env` 或供应商 Key 放进 Pages 产物。
