import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { CLIENT_TOOL_NAMES } from "@fuyue/core";

import { loadConfig } from "../apps/relay/dist/config.js";
import { createRelayServer } from "../apps/relay/dist/server.js";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const upstreamBodies = [];
const browserErrors = [];
let webServer;

async function ensureBuiltWeb() {
  try {
    const response = await fetch(baseUrl);
    if (response.ok) return;
  } catch { /* Start the packaged static build below. */ }
  const root = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
  const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  webServer = createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", baseUrl).pathname;
    const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    if (relativePath.split("/").includes("..")) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Invalid path");
      return;
    }
    const path = join(root, relativePath);
    try {
      const content = await readFile(path);
      response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(content);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    webServer.once("error", reject);
    webServer.listen(4173, "127.0.0.1", resolve);
  });
}

const fakeFetch = async (_url, init = {}) => {
  const requestBody = JSON.parse(String(init.body || "{}"));
  if (Array.isArray(requestBody.tools)) upstreamBodies.push(requestBody);
  return new Response([
    'data: {"choices":[{"delta":{"content":"跨层契约已抵达上游。"}}]}',
    "data: [DONE]",
    "",
  ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
};

const config = loadConfig({
  FUYUE_RELAY_HOST: "127.0.0.1",
  FUYUE_RELAY_PORT: "8787",
  FUYUE_DEEPSEEK_API_KEY: "qa-server-secret",
  FUYUE_DEEPSEEK_MODEL: "deepseek-chat",
});
const relay = createRelayServer(config, fakeFetch);
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

try {
  await ensureBuiltWeb();
  await relay.listen();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) browserErrors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) browserErrors.push(`response: ${response.status()} ${response.url()}`);
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await page.getByRole("button", { name: "连接模型" }).click();
  await page.getByRole("button", { name: "连接本机 DeepSeek" }).click();
  await page.getByText("模型服务已连接", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "返回", exact: true }).click();

  await page.getByLabel("聊天原文").fill("README 第一条跨层验收。只回复已经抵达。 ");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const reply = page.locator(".message-row.companion .message-bubble").filter({ hasText: "跨层契约已抵达上游。" });
  await reply.waitFor({ state: "visible", timeout: 20_000 });

  assert.equal(upstreamBodies.length, 1, "first browser message must reach exactly one upstream request");
  assert.deepEqual(upstreamBodies[0].tools.map((item) => item.function.name), [...CLIENT_TOOL_NAMES]);
  assert.deepEqual(browserErrors, []);
  console.log(`README first-chat QA passed through web → relay → fake upstream with ${CLIENT_TOOL_NAMES.length} client tools.`);
} finally {
  await browser.close();
  await new Promise((resolve) => relay.server.close(resolve));
  if (webServer) await new Promise((resolve) => webServer.close(resolve));
}
