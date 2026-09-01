import { loadConfig } from "../apps/relay/dist/config.js";

try {
  const config = loadConfig(process.env);
  console.log(`Relay：${config.host}:${config.port}`);
  if (!config.providers.length) {
    console.error("没有可用 provider。DeepSeek 用户先运行：npm run setup:deepseek");
    process.exitCode = 1;
  } else {
    for (const provider of config.providers) console.log(`${provider.id === config.activeProviderId ? "✓" : "·"} ${provider.label} · ${provider.model} · ${provider.baseUrl}`);
    console.log("凭据已读取；Key 未回显。运行 npm run dev:all 后在赴约里连接本机 relay。");
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : "Relay 配置无效");
  process.exitCode = 1;
}
