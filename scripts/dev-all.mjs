import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await run("npm", ["run", "build", "-w", "@fuyue/core"]);
await run("npm", ["run", "build", "-w", "@fuyue/kaomoji-drawer"]);
await run("npm", ["run", "build", "-w", "@fuyue/relay"]);

const children = [
  spawn("npm", ["run", "start", "-w", "@fuyue/relay"], { stdio: "inherit", env: process.env }),
  spawn("npm", ["run", "dev", "-w", "@fuyue/web"], { stdio: "inherit", env: process.env }),
];
const engawaPython = resolve(".runtime/engawa/bin/python");
if (existsSync(engawaPython)) children.unshift(spawn(engawaPython, ["scripts/engawa-sidecar.py", "--host", "127.0.0.1", "--port", "8179"], { stdio: "inherit", env: { ...process.env, ENGAWA_UPSTREAM_COMMIT: "27fdc6ad935b6d070387ac48c235df0653efa28c" } }));
else console.warn("Engawa 侧车尚未安装；运行 npm run setup:engawa 后重开全家。其他功能照常启动。");

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

for (const child of children) {
  child.once("error", (cause) => { console.error(cause); stop(); process.exitCode = 1; });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      if (code !== 0) { console.error(`开发服务异常退出：${code ?? signal}`); process.exitCode = 1; }
      stop();
    }
  });
}

await Promise.all(children.map((child) => new Promise((resolve) => child.once("exit", resolve))));
