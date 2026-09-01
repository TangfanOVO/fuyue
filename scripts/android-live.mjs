import { spawn, spawnSync } from "node:child_process";
import { constants, accessSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const port = Number.parseInt(process.env.FUYUE_PHONE_PORT || "4184", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  console.error("FUYUE_PHONE_PORT 必须是 1024 到 65535 之间的端口。");
  process.exit(1);
}

const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
if (major < 22) {
  console.error("安卓联调需要 Node.js 22.12 或更新版本。请先切换 Node，再运行 npm run android:live。");
  process.exit(1);
}

function executable(path) {
  try { accessSync(path, constants.X_OK); return path; } catch { return ""; }
}

function adbPath() {
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  const candidates = [
    process.env.FUYUE_ADB,
    ...sdkRoots.map((root) => join(root, "platform-tools", "adb")),
    join(process.env.HOME || "", "Library", "Android", "sdk", "platform-tools", "adb"),
    "/opt/homebrew/share/android-commandlinetools/platform-tools/adb",
  ].filter(Boolean);
  for (const candidate of candidates) if (executable(candidate)) return candidate;
  const found = spawnSync("sh", ["-lc", "command -v adb"], { encoding: "utf8" }).stdout.trim();
  return found && executable(found);
}

function lanAddress() {
  const addresses = Object.values(networkInterfaces()).flat().filter(Boolean);
  return addresses.find((item) => item.family === "IPv4" && !item.internal && /^192\.168\./.test(item.address))?.address
    || addresses.find((item) => item.family === "IPv4" && !item.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address))?.address
    || "";
}

const adb = adbPath();
if (!adb) {
  console.error("没有找到 adb。先安装 Android platform-tools，或设置 FUYUE_ADB。");
  process.exit(1);
}
const devices = spawnSync(adb, ["devices"], { encoding: "utf8" }).stdout
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts.length >= 2 && parts[1] === "device")
  .map((parts) => parts[0]);
if (!devices.length) {
  console.error("没有发现已授权的安卓设备。用 USB 或无线调试连接一次，并在手机上允许这台电脑后重试。");
  process.exit(1);
}

const host = process.env.FUYUE_PHONE_HOST?.trim() || lanAddress();
if (!host) {
  console.error("没有找到同一 Wi-Fi 下可用的局域网地址。可手动设置 FUYUE_PHONE_HOST 后重试。");
  process.exit(1);
}

const environment = { ...process.env };
if (!environment.ANDROID_HOME && executable("/opt/homebrew/share/android-commandlinetools/platform-tools/adb")) {
  environment.ANDROID_HOME = "/opt/homebrew/share/android-commandlinetools";
  environment.ANDROID_SDK_ROOT = environment.ANDROID_HOME;
}
if (!environment.JAVA_HOME && executable("/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java")) {
  environment.JAVA_HOME = "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
}

function child(command, args) {
  return spawn(command, args, { stdio: "inherit", env: environment });
}
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: environment });
  if (result.status !== 0) process.exit(result.status || 1);
}

async function existingFuyueServer() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) });
    return response.ok && (await response.text()).includes("<title>赴约 LocalData</title>");
  } catch { return false; }
}

run("npm", ["run", "build", "-w", "@fuyue/core"]);
run("npm", ["run", "build", "-w", "@fuyue/kaomoji-drawer"]);

console.log(`\n手机浏览器预览：http://${host}:${port}/`);
console.log("正在安装一次安卓联调壳；保持本命令运行，之后前端保存就会热更新。\n");

const reuseWeb = await existingFuyueServer();
if (reuseWeb) console.log(`复用已经运行的赴约预览服务（${port}）。`);
const web = reuseWeb ? null : child("npm", ["run", "dev", "-w", "@fuyue/web", "--", "--host", "0.0.0.0", "--port", String(port), "--strictPort"]);
let native = null;
let stopping = false;
const timer = setTimeout(() => {
  native = child("npx", ["cap", "run", "android", "--live-reload", "--host", host, "--port", String(port), "--target", devices[0]]);
  native.once("exit", (code) => { if (!stopping) stop(code === 0 ? "SIGTERM" : "SIGINT", code || 0); });
}, reuseWeb ? 50 : 850);

function stop(signal = "SIGINT", exitCode = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  if (native && !native.killed) native.kill(signal);
  if (web && !web.killed) web.kill(signal);
  process.exitCode = exitCode;
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
web?.once("exit", (code) => { if (!stopping) stop("SIGTERM", code || 0); });

await new Promise((resolve) => {
  web?.once("exit", resolve);
  const watchNative = setInterval(() => { if (native) { clearInterval(watchNative); native.once("exit", resolve); } }, 50);
  process.on("SIGINT", resolve);
  process.on("SIGTERM", resolve);
});
