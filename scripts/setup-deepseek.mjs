import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const envPath = resolve("apps/relay/.env");
const supportedModels = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

function quotedEnv(value) {
  if (/\r|\n/.test(value)) throw new Error("配置值不能包含换行");
  return JSON.stringify(value);
}

export function upsertEnvContent(source, updates) {
  const pending = new Map(Object.entries(updates));
  const lines = source ? source.replace(/\r\n/g, "\n").split("\n") : [];
  const next = lines.map((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${quotedEnv(value)}`;
  });
  if (next.length && next.at(-1) !== "") next.push("");
  if (pending.size) next.push("# Added by npm run setup:deepseek");
  for (const [key, value] of pending) next.push(`${key}=${quotedEnv(value)}`);
  return `${next.join("\n").replace(/\n*$/, "")}\n`;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

async function readSecret(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("请在本机交互式终端运行这个命令，避免 API Key 被命令历史或日志记录");
  }
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolveSecret, reject) => {
    let secret = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolveSecret(secret);
    };
    const onData = (chunk) => {
      for (const character of [...chunk]) {
        if (character === "\u0003") { finish(new Error("已取消，没有修改配置")); return; }
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u007f" || character === "\b") {
          if (secret) { secret = [...secret].slice(0, -1).join(""); process.stdout.write("\b \b"); }
          continue;
        }
        if (character >= " ") { secret += character; process.stdout.write("•"); }
      }
    };
    process.stdin.on("data", onData);
  });
}

export async function saveDeepSeekConfig(apiKey, model = "deepseek-v4-flash", target = envPath) {
  const cleanKey = apiKey.trim();
  if (cleanKey.length < 10 || cleanKey.length > 512 || /\s/.test(cleanKey)) throw new Error("API Key 格式不完整；请粘贴平台生成的整段 Key");
  if (!supportedModels.has(model)) throw new Error(`不支持的预设模型：${model}`);
  let current = "";
  try { current = await readFile(target, "utf8"); } catch (cause) {
    if (!cause || typeof cause !== "object" || cause.code !== "ENOENT") throw cause;
  }
  const label = model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : "DeepSeek V4 Flash";
  const content = upsertEnvContent(current, {
    FUYUE_ACTIVE_PROVIDER: "deepseek",
    FUYUE_DEEPSEEK_API_KEY: cleanKey,
    FUYUE_DEEPSEEK_MODEL: model,
    FUYUE_DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    FUYUE_DEEPSEEK_LABEL: label,
  });
  await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600);
  return { target, model, label };
}

async function main() {
  const model = readArgument("--model") || "deepseek-v4-flash";
  console.log("赴约只会把 Key 写进 apps/relay/.env，不会放进网页、LocalData 或 Git。");
  const apiKey = await readSecret("粘贴 DeepSeek API Key（输入不会回显）：");
  const saved = await saveDeepSeekConfig(apiKey, model);
  console.log(`已写入 ${saved.target}`);
  console.log(`当前模型：${saved.label}`);
  console.log("下一步运行：npm run dev:all");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((cause) => { console.error(cause instanceof Error ? cause.message : "配置失败"); process.exitCode = 1; });
}
