# 只用手机时怎样接模型

PWA 可以完全在手机上安装，LocalData、人物、原文、记忆、导入和导出都不需要电脑。模型连接分四种：

## 1. Android APK 原生直连，适合只有安卓手机的 BYOK 用户

APK 和 PWA 使用同一份前端。Android 多一层原生密钥桥：使用者在“模型连接 → Android 直连”选择供应商和模型，再粘贴 API Key。内置 DeepSeek、GLM、Qwen、Kimi 与 OpenRouter 预设，只有高级兼容服务需要自己填地址。Key 加密保存在 Android Keystore 管理的本机安全边界，不进入 WebView 持久状态或 LocalData 导出。详见 [Android APK](./ANDROID.md)。

## 2. 自建 relay，推荐给开发者

用户在电脑、NAS、云函数或服务器运行 `apps/relay`，用服务端环境变量保存 Gemini 或 OpenAI-compatible API Key。前端只保存 relay URL。

DeepSeek 已有安全首用命令：`npm run setup:deepseek`。它适合先在电脑完成配置和试聊；若手机也要访问，再把 relay 放到手机能访问的 HTTPS 地址。手机里的 `127.0.0.1` 指手机自身，不是运行 relay 的电脑。

## 3. 浏览器直接填供应商 API Key，不作为生产功能

把 Key 输入本地 PWA 在技术上不等于把它藏起来。运行中的前端、恶意依赖、浏览器扩展或 XSS 都可能读到 Key；不同供应商还可能拒绝浏览器 CORS。Google 与 OpenAI 的官方文档都明确要求生产 Web / Mobile 应把 Key 放在服务端：

- [Gemini API key security](https://ai.google.dev/gemini-api/docs/api-key)
- [OpenAI API authentication](https://platform.openai.com/docs/api-reference/authentication)

因此 PWA 不提供供应商 Key 输入框。若采用者坚持实验浏览器直连，应把它标为高风险、默认只保存到本次会话、限制 Key 权限和额度，并接受它无法跨供应商稳定工作的事实。

## 消费订阅不是 API 订阅

ChatGPT Plus、Gemini Advanced 等消费订阅通常不包含可供第三方 PWA 调用的 API 额度。赴约不会接管账号 Cookie 或模拟官方客户端。
