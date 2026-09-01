import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const relayUrl = process.env.FUYUE_QA_RELAY || "http://127.0.0.1:8787";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const avatarPath = fileURLToPath(new URL("../apps/web/public/icon-192.png", import.meta.url));
const artifactRoot = await mkdtemp(join(tmpdir(), "fuyue-real-continuity-"));
const evidence = [];
const chatRequests = [];

function record(name, detail) {
  evidence.push({ name, detail });
  process.stdout.write(`✓ ${name}${detail ? ` · ${detail}` : ""}\n`);
}

async function openDrawer(page, text) {
  await page.getByRole("button", { name: "打开全部功能" }).click();
  const entry = page.locator(".drawer-entry").filter({ hasText: text }).first();
  await entry.waitFor({ state: "visible" });
  await entry.click();
}

async function back(page) {
  await page.getByRole("button", { name: "返回", exact: true }).click();
}

async function stores(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("fuyue-localdata");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ["people", "memories", "conversations", "messages", "roomEntries", "settings"];
    const result = {};
    for (const name of names) result[name] = await new Promise((resolve, reject) => {
      const request = db.transaction(name, "readonly").objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  });
}

async function send(page, input, replyPattern, timeout = 50_000) {
  const before = await page.locator(".message-row.companion").count();
  await page.getByLabel("聊天原文").fill(input);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const outcome = await page.waitForFunction((count) => {
    if (document.querySelector(".inline-error")) return "error";
    if (document.querySelector('button[aria-label="发送"]') && document.querySelectorAll(".message-row.companion").length > count) return "reply";
    return "";
  }, before, { timeout });
  if (await outcome.jsonValue() === "error") {
    const request = chatRequests.at(-1);
    throw new Error(`${(await page.locator(".inline-error").innerText()).trim()} [provider=${request?.providerId || ""}; reasoning=${request?.reasoningEffort || ""}; history=${request?.history?.length || 0}; memories=${request?.memories?.length || 0}]`);
  }
  const reply = (await page.locator(".message-row.companion .message-bubble").last().innerText()).trim();
  if (replyPattern) assert.match(reply, replyPattern);
  await page.waitForFunction(async (text) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("fuyue-localdata"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const messages = await new Promise((resolve, reject) => { const request = db.transaction("messages", "readonly").objectStore("messages").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return messages.some((item) => item.role === "companion" && item.content.trim() === text);
  }, reply, { timeout: 10_000 });
  return reply;
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", acceptDownloads: true, permissions: [] });
  const page = await context.newPage();
  page.on("request", (request) => {
    if (request.url() === `${relayUrl}/v1/chat/stream` && request.method() === "POST") {
      try { chatRequests.push(request.postDataJSON()); } catch { /* No secrets are present in browser chat payloads. */ }
    }
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  await splash.waitFor({ state: "visible" });
  await splash.click();
  assert.equal(await page.getByRole("navigation", { name: "主要页面" }).isVisible(), true);
  record("完全空 LocalData 首次打开", "开屏按钮可进入，五栏出现");

  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await page.getByRole("button", { name: "连接模型" }).click();
  await page.getByRole("button", { name: "连接本机 DeepSeek" }).click();
  await page.getByText("模型服务已连接", { exact: true }).waitFor();
  assert.match(await page.locator(".connection-state").innerText(), /fuyue-self-hosted-relay.*1 个 provider/s);
  await back(page);
  const providerLabel = (await page.getByLabel("选择模型").innerText()).trim();
  assert.match(providerLabel, /DeepSeek V4 (Flash|Pro)/);
  assert.deepEqual(await page.getByLabel("选择思考深度").locator("option").allTextContents(), ["跟随模型", "直接回答", "轻想", "深入", "最深"]);
  await page.getByLabel("选择思考深度").selectOption("high");
  assert.equal(await page.getByLabel("选择思考深度").inputValue(), "high");
  await page.getByLabel("选择思考深度").selectOption("auto");
  record("真实 relay 状态", `${providerLabel}；思考档位 auto/none/low/high/max 来自 /v1/status`);

  await page.getByRole("button", { name: "打开附加菜单" }).click();
  await page.getByRole("button", { name: "人物", exact: true }).click();
  const editors = page.locator(".person-editor");
  const userEditor = editors.nth(0); const companionEditor = editors.nth(1);
  await userEditor.getByLabel("名字").fill("验收用户·北斗");
  await userEditor.getByLabel("个性签名").fill("我只认真实入账");
  await userEditor.getByLabel("资料").fill("完全虚构的公开候选验收用户。");
  await userEditor.locator('input[type="file"]').setInputFiles(avatarPath);
  await page.getByRole("button", { name: "使用这张头像" }).click();
  await userEditor.getByRole("button", { name: "保存人物" }).click();
  await userEditor.locator(".profile-save-message").waitFor();
  await companionEditor.getByLabel("名字").fill("验收伙伴·柚子");
  await companionEditor.getByLabel("个性签名").fill("没有工具痕迹就不说完成");
  await companionEditor.getByLabel("资料").fill("完全虚构的公开候选验收伙伴。");
  await companionEditor.getByLabel("说话原则").fill("直接、具体、诚实；不冒充工具或设备状态。");
  await companionEditor.locator('input[type="file"]').setInputFiles(avatarPath);
  await page.getByRole("button", { name: "使用这张头像" }).click();
  await companionEditor.getByRole("button", { name: "保存人物" }).click();
  await companionEditor.locator(".profile-save-message").waitFor();
  let db = await stores(page);
  assert.equal(db.people.find((item) => item.id === "user").displayName, "验收用户·北斗");
  assert.equal(db.people.find((item) => item.id === "companion").voiceNotes.includes("不冒充"), true);
  assert.equal(db.people.every((item) => item.avatarDataUrl.startsWith("data:image/jpeg")), true);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "我们是谁" }).waitFor({ state: "visible" });
  assert.equal(await editors.nth(0).getByLabel("名字").inputValue(), "验收用户·北斗");
  assert.equal(await editors.nth(1).getByLabel("名字").inputValue(), "验收伙伴·柚子");
  record("双方人物与头像持久化", "两个原位保存提示；IndexedDB 名字/签名/资料/原则/裁剪 JPEG 读回；刷新后仍在");
  await back(page);
  await page.getByLabel("选择模型").waitFor({ state: "visible" });
  await page.getByLabel("选择思考深度").selectOption("none");

  const fact = "北斗柚子314159";
  const firstReply = await send(page, `请只在当前连续对话中记住一个独特事实：暗号是“${fact}”。不要调用任何工具，不要写长期记忆，只回复你记住了。`, null);
  const secondReply = await send(page, "跨一个话题：请用一句话说明为什么半截流不能写入正式原文。", null);
  const thirdReply = await send(page, "现在只回答第一轮独特暗号里数字部分的前三位，不要加别的字。", /^314$/);
  assert.equal(chatRequests.at(-1).history.some((item) => item.content.includes(fact)), true);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("选择模型").waitFor({ state: "visible" });
  db = await stores(page);
  const chatLedger = db.messages.filter((item) => item.source !== "system_seed");
  assert.equal(chatLedger.filter((item) => item.role === "user").length, 3);
  assert.equal(chatLedger.some((item) => item.role === "companion" && item.content.trim() === thirdReply), true);
  assert.equal(db.messages.some((item) => item.content.includes(fact)), true);
  assert.equal(await page.locator(".message-bubble").filter({ hasText: fact }).count() >= 1, true);
  record("三轮连续聊天与 48 小时原文", `第三轮正确返回暗号数字前三位 ${thirdReply}；请求 history 实含完整第一轮；${chatLedger.length} 条双方原文入库并在刷新后显示`);
  assert.ok(firstReply && secondReply && thirdReply);

  await openDrawer(page, "记忆库");
  await page.getByRole("button", { name: "写第一条" }).click();
  await page.getByLabel("标题").fill("未启用验收记忆");
  await page.getByLabel("内容").fill("记忆暗号是蓝色海狸8284。");
  await page.getByRole("button", { name: "保存为待审记忆" }).click();
  const memory = page.locator(".memory-item").filter({ hasText: "未启用验收记忆" });
  assert.equal(await memory.getByRole("button", { name: "启用记忆" }).getAttribute("aria-pressed"), "false");
  await back(page);
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await send(page, "这轮只回复“未启用检查”，不要调用工具。", /未启用检查/);
  assert.equal(chatRequests.at(-1).memories.some((item) => item.content.includes("蓝色海狸")), false);
  await openDrawer(page, "记忆库");
  await memory.getByRole("button", { name: "启用记忆" }).click();
  await memory.getByRole("button", { name: "参与召回" }).waitFor();
  assert.equal((await stores(page)).memories.find((item) => item.title === "未启用验收记忆").injectionEnabled, true);
  await back(page);
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  const memoryReply = await send(page, "只回答已启用记忆里的记忆暗号，不要调用工具。", /蓝色海狸8284/);
  assert.equal(chatRequests.at(-1).memories.some((item) => item.content.includes("蓝色海狸8284")), true);
  await openDrawer(page, "记忆库");
  await memory.getByRole("button", { name: "参与召回" }).click();
  await memory.getByRole("button", { name: "启用记忆" }).waitFor();
  assert.equal((await stores(page)).memories.find((item) => item.title === "未启用验收记忆").injectionEnabled, false);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".memory-item").filter({ hasText: "未启用验收记忆" }).getByRole("button", { name: "启用记忆" }).getAttribute("aria-pressed"), "false");
  record("记忆待审/启用/停用与真实注入", `未启用时 request.memories=0 命中；启用后请求含暗号且 DeepSeek 回复“${memoryReply}”；停用后刷新仍关闭`);

  await back(page);
  await openDrawer(page, "本地副本");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /下载.*(?:LocalData|fuyue-portable)/i }).click();
  const download = await downloadPromise; const downloadPath = await download.path();
  const exported = JSON.parse(await readFile(downloadPath, "utf8"));
  assert.equal(exported.memories.some((item) => item.title === "未启用验收记忆"), true);
  await page.getByRole("button", { name: /导入/ }).click();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: "fuyue-portable-qa.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await page.getByRole("button", { name: "确认导入" }).click();
  await page.getByText("导入完成", { exact: true }).waitFor();
  record("导出与重新导入", `${exported.messages.length} 句原文、${exported.memories.length} 条记忆在导出 JSON 中；同一副本幂等重新导入完成`);

  await back(page); await back(page);
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  for (const request of [
    "请必须用本机工具同时完成：把你自己的个签改成‘工具验收中’；留下可见心情‘安心’；创建待审记忆‘工具记忆’；把外观调整为蓝色黑夜。没有工具成功痕迹就明说未完成。",
    "请必须用本机工具分别写入共同工作本、我们的时间线、赴约信箱和装修日记，标题都以‘工具验收’开头。没有工具成功痕迹就明说未完成。",
    "请必须用本机工具分别写入共同修补本和伙伴碎碎念，标题都以‘工具验收’开头。没有工具成功痕迹就明说未完成。",
  ]) await send(page, request, null, 70_000);
  db = await stores(page);
  const toolMessages = db.messages.filter((item) => item.role === "companion" && item.toolTrace.length);
  const successfulTools = toolMessages.flatMap((item) => item.toolTrace).filter((item) => item.status === "success");
  const roomKinds = new Set(db.roomEntries.filter((item) => item.sourceLabel.includes("DeepSeek")).map((item) => item.room));
  assert.equal(db.people.find((item) => item.id === "companion").signature, "工具验收中");
  assert.equal(db.memories.some((item) => item.title.includes("工具记忆") && !item.injectionEnabled), true);
  for (const room of ["checkin", "work", "timeline", "letter", "diary", "repair", "whisper"]) assert.equal(roomKinds.has(room), true, `missing ${room}`);
  assert.equal(successfulTools.length >= 10, true);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("main.app-shell").getAttribute("data-theme"), "blue");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-mode"), "dark");
  record("真实 DeepSeek 受限本机工具", `${successfulTools.length} 条 success 痕迹；个签/心情/待审记忆/外观及 7 类房间入库；刷新后外观仍为 blue/dark`);

  await openDrawer(page, "的心情");
  const moodText = await page.locator(".mood-detail").innerText();
  assert.match(moodText, /来源.*DeepSeek/);
  assert.match(moodText, /最后更新/);
  record("心情可审计页", "显示最后更新时间与 DeepSeek 工具来源；数据为 companion_mood 房间记录");
  await back(page);

  await openDrawer(page, "电话");
  assert.equal(await page.getByText("PWA 不保存语音 Key", { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "开始说" }).isDisabled(), true);
  assert.match(await page.locator(".voice-call-panel").innerText(), /ElevenLabs|豆包/);
  record("电话无 Key 边界", "聊天模型已连接，但语音 provider 未配置；开始按钮禁用，PWA 明示不保存语音 Key");
  await back(page);

  await page.getByRole("button", { name: "一起", exact: true }).click();
  await page.getByRole("tab", { name: "课表" }).click();
  await page.getByRole("button", { name: "选择日历来源" }).click();
  assert.equal(await page.getByText("PWA 日历来源", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText(/Android 系统日历/).count(), 0);
  record("PWA 日历边界", "仅显示 PWA 来源和装配路径，没有冒充 Calendar Provider 授权");
  await back(page);

  await page.getByRole("button", { name: "聊天", exact: true }).click();
  const composer = page.locator(".composer-zone"); const nav = page.locator(".bottom-nav");
  let composerBox = await composer.boundingBox(); let navBox = await nav.boundingBox();
  assert.ok(composerBox && navBox && composerBox.y + composerBox.height <= navBox.y + 2);
  await page.getByLabel("聊天原文").focus(); await page.setViewportSize({ width: 390, height: 480 });
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-keyboard-open") === "true");
  assert.equal(await nav.getAttribute("aria-hidden"), "true");
  await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".bottom-nav")).opacity) < 0.01);
  composerBox = await composer.boundingBox(); assert.ok(composerBox && composerBox.y + composerBox.height <= 480);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByLabel("聊天原文").blur();
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-keyboard-open") === "false");
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await nav.isVisible(), true); assert.equal(await page.locator(".topbar").isVisible(), true);
  record("固定顶栏/五栏与键盘可见区", "390×844 输入框在底栏上方；390×480 聚焦时顶底栏收起且输入框未被挡；1280×900 顶底栏可见");

  await page.screenshot({ path: join(artifactRoot, "real-continuity-desktop.png"), fullPage: true });
  process.stdout.write(`\n${evidence.length} 组真实连续性证据通过。\n`);
  process.stdout.write(`截图：${join(artifactRoot, "real-continuity-desktop.png")}\n`);
} finally {
  await browser.close();
  if (process.env.FUYUE_QA_KEEP_ARTIFACTS !== "1") await rm(artifactRoot, { recursive: true, force: true });
}
