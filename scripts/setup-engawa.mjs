import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
const COMMIT = "27fdc6ad935b6d070387ac48c235df0653efa28c";
const runtime = resolve(".runtime/engawa");

export async function installEngawa() {
  await mkdir(resolve(".runtime"), { recursive: true });
  await run("python3", ["-m", "venv", runtime]);
  const python = resolve(runtime, "bin/python");
  await run(python, ["-m", "pip", "install", "--disable-pip-version-check", `git+https://github.com/tsuru0805/engawa-mcp.git@${COMMIT}`, "uvicorn>=0.35,<1"], { maxBuffer: 8_000_000 });
  console.log("Engawa MIT 侧车已安装到忽略 Git 的 .runtime/engawa；不会接触 API Key。");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) installEngawa().catch((cause) => { console.error(cause instanceof Error ? cause.message : "Engawa 安装失败"); process.exitCode = 1; });
