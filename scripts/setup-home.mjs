import { chmod, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { upsertEnvContent } from "./setup-deepseek.mjs";

const target = resolve("apps/relay/.env");
const chatPresets = {
  deepseek: { label: "DeepSeek", key: "FUYUE_DEEPSEEK_API_KEY", modelKey: "FUYUE_DEEPSEEK_MODEL", model: "deepseek-v4-flash" },
  openai: { label: "OpenAI", key: "FUYUE_OPENAI_API_KEY", modelKey: "FUYUE_OPENAI_MODEL", model: "gpt-5.4" },
  gemini: { label: "Gemini", key: "FUYUE_GEMINI_API_KEY", modelKey: "FUYUE_GEMINI_MODEL", model: "gemini-2.5-flash" },
  anthropic: { label: "Anthropic", key: "FUYUE_ANTHROPIC_API_KEY", modelKey: "FUYUE_ANTHROPIC_MODEL", model: "claude-sonnet-4-6" },
  glm: { label: "智谱 GLM", key: "FUYUE_GLM_API_KEY", modelKey: "FUYUE_GLM_MODEL", model: "glm-4.5-flash" },
  qwen: { label: "通义千问", key: "FUYUE_QWEN_API_KEY", modelKey: "FUYUE_QWEN_MODEL", model: "qwen-plus" },
  kimi: { label: "Kimi", key: "FUYUE_KIMI_API_KEY", modelKey: "FUYUE_KIMI_MODEL", model: "moonshot-v1-8k" },
  openrouter: { label: "OpenRouter", key: "FUYUE_OPENROUTER_API_KEY", modelKey: "FUYUE_OPENROUTER_MODEL", model: "openai/gpt-4.1-mini" },
};

export function homeConfigUpdates({ chatProvider, chatKey, chatModel, voiceProvider = "none", voiceKey = "", voiceId = "", voiceModel = "" }) {
  const chat = chatPresets[chatProvider];
  if (!chat) throw new Error("未知聊天供应商");
  if (chatKey.trim().length < 10 || /\s/.test(chatKey.trim())) throw new Error("聊天 API Key 格式不完整");
  const updates = { FUYUE_ACTIVE_PROVIDER: chatProvider === "openai" ? "openai-compatible" : chatProvider, [chat.key]: chatKey.trim(), [chat.modelKey]: chatModel.trim() || chat.model };
  if (voiceProvider === "none") return updates;
  if (voiceKey.trim().length < 10 || /\s/.test(voiceKey.trim()) || !voiceId.trim()) throw new Error("语音 Key 或 Voice ID 不完整");
  if (voiceProvider === "elevenlabs") return { ...updates, FUYUE_ACTIVE_VOICE_PROVIDER: "elevenlabs", FUYUE_ELEVENLABS_API_KEY: voiceKey.trim(), FUYUE_ELEVENLABS_VOICE_ID: voiceId.trim(), FUYUE_ELEVENLABS_MODEL: voiceModel.trim() || "eleven_flash_v2_5" };
  if (voiceProvider === "doubao") return { ...updates, FUYUE_ACTIVE_VOICE_PROVIDER: "doubao", FUYUE_DOUBAO_DUPLEX_API_KEY: voiceKey.trim(), FUYUE_DOUBAO_DUPLEX_VOICE: voiceId.trim(), FUYUE_DOUBAO_DUPLEX_MODEL: voiceModel.trim() || "1.2.6.1" };
  throw new Error("未知语音供应商");
}

async function readSecret(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") throw new Error("请在本机交互式终端运行；密钥不会接受命令行参数");
  process.stdout.write(question); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolveSecret, reject) => {
    let secret = "";
    const finish = (error) => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); if (error) reject(error); else resolveSecret(secret); };
    const onData = (chunk) => { for (const character of [...chunk]) { if (character === "\u0003") return finish(new Error("已取消，没有修改配置")); if (character === "\r" || character === "\n") return finish(); if (character === "\u007f" || character === "\b") { if (secret) { secret = [...secret].slice(0, -1).join(""); process.stdout.write("\b \b"); } } else if (character >= " ") { secret += character; process.stdout.write("•"); } } };
    process.stdin.on("data", onData);
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("请在本机交互式终端运行 npm run setup");
  console.log("赴约整屋配置：密钥只写入权限 600 的 apps/relay/.env，不进入网页、LocalData、命令历史或 Git。");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const chatNames = Object.keys(chatPresets);
  const chatChoice = (await prompt.question(`聊天供应商 ${chatNames.map((id, index) => `${index + 1}.${chatPresets[id].label}`).join("  ")} [1]：`)).trim();
  const chatProvider = chatNames[Math.max(0, Number.parseInt(chatChoice || "1", 10) - 1)] || "deepseek";
  const chatModel = (await prompt.question(`模型 [${chatPresets[chatProvider].model}]：`)).trim() || chatPresets[chatProvider].model;
  prompt.pause();
  const chatKey = await readSecret(`${chatPresets[chatProvider].label} API Key：`);
  prompt.resume();
  const voiceChoice = (await prompt.question("语音 1.暂不配置  2.ElevenLabs  3.豆包 [1]：")).trim();
  let voiceProvider = "none"; let voiceKey = ""; let voiceId = ""; let voiceModel = "";
  if (voiceChoice === "2" || voiceChoice === "3") {
    voiceProvider = voiceChoice === "2" ? "elevenlabs" : "doubao";
    voiceId = (await prompt.question("Voice ID（可见输入）：")).trim();
    voiceModel = (await prompt.question(`语音模型 [${voiceProvider === "elevenlabs" ? "eleven_flash_v2_5" : "1.2.6.1"}]：`)).trim();
    prompt.pause(); voiceKey = await readSecret(`${voiceProvider === "elevenlabs" ? "ElevenLabs" : "豆包"} API Key：`); prompt.resume();
  }
  prompt.close();
  let source = ""; try { source = await readFile(target, "utf8"); } catch (cause) { if (!cause || typeof cause !== "object" || cause.code !== "ENOENT") throw cause; }
  const content = upsertEnvContent(source, homeConfigUpdates({ chatProvider, chatKey, chatModel, voiceProvider, voiceKey, voiceId, voiceModel }));
  await writeFile(target, content, { encoding: "utf8", mode: 0o600 }); await chmod(target, 0o600);
  console.log(`配置已写入 ${target}`); console.log("下一步：npm run dev:all");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((cause) => { console.error(cause instanceof Error ? cause.message : "配置失败"); process.exitCode = 1; });
