import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const relayUrl = process.env.FUYUE_QA_RELAY || "http://127.0.0.1:8787";
const artifactRoot = await mkdtemp(join(tmpdir(), "fuyue-public-shell-qa-"));
const steps = [];
const browserErrors = [];
let expectedNetworkFailure = false;

function record(name, detail = "") {
  steps.push({ name, detail });
  process.stdout.write(`✓ ${name}${detail ? ` · ${detail}` : ""}\n`);
}

async function visible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await locator.isVisible(), true, `${label} should be visible`);
}

async function back(page, expectedTitle) {
  await page.getByRole("button", { name: "返回", exact: true }).click();
  if (expectedTitle) await visible(page.getByText(expectedTitle, { exact: true }).first(), expectedTitle);
}

async function openDrawerEntry(page, text) {
  await page.getByRole("button", { name: "打开全部功能" }).click();
  await visible(page.getByRole("heading", { name: "全部功能" }), "全部功能");
  const entry = page.locator(".drawer-entry").filter({ hasText: text }).first();
  await visible(entry, `抽屉入口 ${text}`);
  await entry.click();
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "zh-CN", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url || "unknown";
    if (expectedNetworkFailure && (location.startsWith(relayUrl) || message.text().includes("ERR_INTERNET_DISCONNECTED"))) return;
    if (location.endsWith("/favicon.ico")) return;
    browserErrors.push(`console: ${message.text()} @ ${location}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (response.url().endsWith("/favicon.ico")) return;
    if (expectedNetworkFailure && response.url().startsWith(relayUrl)) return;
    browserErrors.push(`response: ${response.status()} ${response.url()}`);
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await visible(page.getByRole("navigation", { name: "主要页面" }), "五栏导航");
  record("新用户首屏与开屏动画可进入");

  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await visible(page.locator(".chat-view"), "聊天页");
  assert.equal(await page.locator(".state-screen").count(), 0, "chat must not become a blank/error screen");
  await page.getByRole("button", { name: "连接模型" }).click();
  await visible(page.getByRole("heading", { name: "模型连接" }), "模型连接");
  await page.getByRole("button", { name: "连接本机 DeepSeek" }).click();
  await visible(page.getByText("模型服务已连接", { exact: true }), "relay 连接状态");
  assert.match(await page.locator(".connection-state").innerText(), /1 个 provider/);
  record("从聊天空态连接本机 DeepSeek relay");
  await back(page);

  await page.getByRole("button", { name: "打开附加菜单" }).click();
  await visible(page.locator(".plus-menu"), "聊天加号菜单");
  await page.getByRole("button", { name: "人物", exact: true }).click();
  await visible(page.getByRole("heading", { name: "我们是谁" }), "人物档案");
  const editors = page.locator(".person-editor");
  const userEditor = editors.nth(0);
  const companionEditor = editors.nth(1);
  await userEditor.getByLabel("名字").fill("验收用户·北斗");
  await userEditor.getByLabel("资料").fill("正在验收小手机的普通用户。");
  await userEditor.getByRole("button", { name: "保存人物" }).click();
  await companionEditor.getByLabel("名字").fill("验收伙伴·柚子");
  await companionEditor.getByLabel("个性签名").fill("测试中，也要说真话。");
  await companionEditor.getByLabel("资料").fill("测试用 AI 伙伴。");
  await companionEditor.getByLabel("说话原则").fill("自然、简短、诚实；不冒充没有连接的工具。");
  await companionEditor.getByRole("button", { name: "保存人物" }).click();
  await visible(page.getByText(/验收伙伴·柚子已保存/), "人设保存提示");
  record("用户与伙伴人设可编辑并持久化");
  await back(page);

  const composer = page.getByLabel("聊天原文");
  await composer.fill("这是真实端到端验收。请只用一句中文回复，说明你是验收伙伴·柚子，并且不会冒充未连接的工具。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".message-row.companion .message-bubble")].some((item) => /验收伙伴·柚子|工具/.test(item.textContent || "")), null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("正在回复"), null, { timeout: 40_000 });
  const reply = page.locator(".message-row.companion").last();
  await visible(reply, "DeepSeek 回复气泡");
  assert.match(await reply.innerText(), /验收伙伴·柚子|工具/);
  await reply.getByRole("button", { name: "收藏这轮" }).click();
  await visible(page.getByText("已收藏这一轮", { exact: true }), "收藏提示");
  record("真实人设注入、流式聊天、保存与收藏");

  expectedNetworkFailure = true;
  await context.setOffline(true);
  await composer.fill("离线恢复测试，请在联网后回复收到。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await visible(page.getByText(/原话已保存/), "离线保存提示");
  await context.setOffline(false);
  expectedNetworkFailure = false;
  await page.getByRole("button", { name: "只重试伙伴回复" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("正在回复") && document.querySelectorAll(".message-row.companion").length >= 2, null, { timeout: 40_000 });
  record("断网时先保存原话，恢复后只重试伙伴回复");

  const composerBox = await page.locator(".composer-zone").boundingBox();
  const navBox = await page.locator(".bottom-nav").boundingBox();
  assert.ok(composerBox && navBox && composerBox.y + composerBox.height <= navBox.y + 2, "composer should stay above fixed bottom navigation");
  await composer.focus();
  record("聊天框置底，不随消息页面滑走");

  await page.getByRole("button", { name: "打开附加菜单" }).click();
  await page.getByRole("button", { name: "共听入口" }).click();
  await visible(page.getByRole("heading", { name: "一起听" }), "一起听功能页");
  assert.match(page.url(), /#feature-media\.listening$/);
  assert.doesNotMatch(await page.locator("body").innerText(), /供应商 HTTPS 地址/);
  record("聊天加号的共听入口不再误跳 API 页");
  await back(page);

  await page.getByRole("button", { name: "一起", exact: true }).click();
  await page.getByRole("tab", { name: "课表" }).click();
  await page.getByRole("button", { name: "选择日历来源" }).click();
  await visible(page.getByRole("heading", { name: "日历与课表" }), "日历功能页");
  assert.match(page.url(), /#feature-life\.calendar$/);
  await visible(page.getByText("PWA 日历来源", { exact: true }), "PWA 日历边界");
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("heading", { name: "日历与课表" }), "刷新后的日历页");
  assert.match(page.url(), /#feature-life\.calendar$/);
  await page.getByRole("button", { name: "选择这个功能怎么装" }).click();
  await visible(page.getByRole("heading", { name: "功能包" }), "日历装配页");
  assert.match(page.url(), /#modules-life\.calendar$/);
  await visible(page.locator(".capability-planner").filter({ hasText: "日历与课表" }), "日历装配器");
  await back(page, "日历与课表");
  record("日历是独立能力，刷新与嵌套返回保留上下文");
  await back(page);

  await page.getByRole("tab", { name: "一起做" }).click();
  await page.getByRole("button", { name: /健康与提醒授权/ }).click();
  await visible(page.getByRole("heading", { name: "健康与提醒" }), "健康功能页");
  await visible(page.getByText("Health Connect 尚未接入这版 APK", { exact: true }), "Health Connect 真实状态");
  assert.match(page.url(), /#feature-life\.health$/);
  record("健康授权不跳模型连接，未完成状态不伪装");
  await back(page);

  await openDrawerEntry(page, "的心情");
  await visible(page.getByRole("heading", { name: "验收伙伴·柚子 此刻" }), "心情页");
  await visible(page.getByRole("heading", { name: "契约测试中" }), "有来源的后端心情");
  await visible(page.getByText(/来源 本机契约测试 relay/), "心情来源");
  assert.equal(await page.getByRole("button", { name: "刷新后端心情" }).count(), 1, "configured source should expose a real refresh action");
  await visible(page.getByRole("heading", { name: "不是随机加减" }), "心潮不自动的说明");
  record("心情带更新时间与后端来源，不靠前端随机变化");
  await back(page);

  await openDrawerEntry(page, "玩具盒");
  await visible(page.getByRole("heading", { name: "玩具盒", exact: true }), "本地玩具盒");
  const whack = page.locator(".toy-grid button").filter({ hasText: "心情打地鼠" });
  await visible(whack, "内置打地鼠");
  await whack.click();
  const toyFrame = page.frameLocator(".toy-sandbox-frame iframe");
  await toyFrame.getByRole("button", { name: "开始一轮" }).click();
  await visible(page.locator(".toy-audit").getByText("开始一轮心情打地鼠", { exact: true }), "玩具活动审计");
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("heading", { name: "玩具盒", exact: true }), "刷新后的玩具盒");
  await visible(page.locator(".toy-grid button").filter({ hasText: /最近：开始一轮心情打地鼠/ }), "刷新后的玩具事件");
  record("玩具盒无后端运行，活动写入 LocalData 且刷新后仍在");
  await back(page);

  await openDrawerEntry(page, "记忆库");
  await visible(page.getByRole("heading", { name: "记忆库", exact: true }), "记忆库");
  const firstMemory = page.getByRole("button", { name: "写第一条" });
  if (await firstMemory.isVisible().catch(() => false)) await firstMemory.click();
  else await page.getByRole("button", { name: "新记忆" }).click();
  await page.getByLabel("标题").fill("端到端验收记忆");
  await page.getByLabel("内容").fill("这是手动写入的待审记忆，不应自动注入。");
  await page.getByRole("button", { name: "保存为待审记忆" }).click();
  const memoryCard = page.locator(".memory-item").filter({ hasText: "端到端验收记忆" });
  await visible(memoryCard, "待审记忆");
  assert.match(await memoryCard.innerText(), /待审/);
  assert.equal(await memoryCard.getByRole("button", { name: "启用记忆" }).getAttribute("aria-pressed"), "false");
  record("新记忆默认待审且不参与召回");
  await back(page);

  await openDrawerEntry(page, "碰一碰");
  await visible(page.getByRole("heading", { name: "碰一碰", exact: true }), "碰一碰房间");
  const firstCheckin = page.getByRole("button", { name: "留第一条" });
  if (await firstCheckin.isVisible().catch(() => false)) await firstCheckin.click();
  else await page.getByRole("button", { name: "留下一条" }).click();
  await page.getByLabel("标题").fill("测试心潮");
  await page.getByLabel("内容").fill("这条只是手动双向记录。");
  await page.getByRole("button", { name: "保存到 LocalData" }).click();
  await visible(page.locator(".room-entry").filter({ hasText: "测试心潮" }), "手动心潮记录");
  record("碰一碰是可追溯手动记录");
  await back(page);

  await openDrawerEntry(page, "功能包");
  const travel = page.locator('[data-capability-id="travel.upstream"]');
  await visible(travel, "旅行上游能力");
  await travel.getByRole("button", { name: /前端已带/ }).click();
  const planner = page.locator(".capability-planner").filter({ hasText: "旅行与漫游" });
  await visible(planner, "旅行装配器");
  assert.equal(await planner.getByRole("button", { name: /只拿前端积木/ }).getAttribute("aria-pressed"), "true");
  await planner.getByRole("button", { name: /接自己的后端/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await planner.getByRole("button", { name: "生成装配单并写入工作本" }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  assert.ok(downloadedPath);
  const plan = JSON.parse(await readFile(downloadedPath, "utf8"));
  assert.equal(plan.capabilityId, "travel.upstream");
  assert.equal(plan.choice, "custom_backend");
  assert.equal(plan.targetPath, "extensions/travel-upstream/");
  await visible(planner.getByText("装配单已生成", { exact: true }), "装配单成功");
  await planner.getByRole("button", { name: "查看共同工作本" }).click();
  await visible(page.locator(".room-entry").filter({ hasText: "装配 旅行与漫游" }), "工作本装配待办");
  record("旅行明示原仓库；只有选自建后端时才生成路径与待办");
  await back(page);
  await back(page);

  await page.getByRole("button", { name: "书房", exact: true }).click();
  const memoryDeck = page.locator(".portal-card").filter({ hasText: "记忆库" });
  await memoryDeck.click();
  assert.match((await memoryDeck.getAttribute("class")) || "", /selected/);
  assert.equal(await page.locator(".panel-page").count(), 0);
  await memoryDeck.click();
  await visible(page.getByRole("heading", { name: "记忆库", exact: true }), "叠叠卡二次点击进入");
  record("书房叠叠卡在原地浮起，第二次才进入");
  await back(page);

  await page.getByRole("button", { name: "调整外观" }).click();
  await page.getByRole("button", { name: /黑夜/ }).click();
  await page.getByRole("button", { name: /晴空蓝/ }).click();
  assert.equal(await page.locator("main.app-shell").getAttribute("data-mode"), "dark");
  assert.equal(await page.locator("main.app-shell").getAttribute("data-theme"), "blue");
  record("白天/黑夜与重点色可独立切换");
  await back(page);

  for (const name of ["首页", "聊天", "一起", "书房", "房间"]) {
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal(await page.locator(".state-screen").count(), 0, `${name} must not be an error or blank screen`);
    assert.equal(await page.locator(".view-frame").isVisible(), true, `${name} view should remain visible`);
  }
  record("五个大区反复切换无白屏");

  const drawerRoutes = [
    { id: "home", view: "home" }, { id: "chat", view: "chat" }, { id: "together", view: "together" }, { id: "study", view: "study" }, { id: "rooms", view: "rooms" },
    { id: "archive", hash: "archive", title: "原文账本" }, { id: "memory", hash: "memories", title: "记忆库" }, { id: "work", hash: "work", title: "共同工作本" },
    { id: "timeline", hash: "timeline", title: "我们的时间线" }, { id: "mood", hash: "mood", title: "验收伙伴·柚子 此刻" }, { id: "checkin", hash: "checkin", title: "碰一碰" },
    { id: "letter", hash: "letter", title: "赴约信箱" }, { id: "gallery", hash: "gallery", title: "本地相册" }, { id: "repair", hash: "repair", title: "共同修补本" },
    { id: "profiles", hash: "people", title: "我们是谁" }, { id: "diary", hash: "diary", title: "装修日记" }, { id: "whisper", hash: "whisper", title: "伙伴碎碎念" }, { id: "life", view: "together" },
    { id: "health", hash: "feature-life.health", title: "健康与提醒" }, { id: "space", hash: "cobrowse", title: "一起看" },
    { id: "reading", hash: "feature-reading.together", title: "共读书房" }, { id: "engawa", hash: "engawa", title: "Engawa 阅读侧廊" },
    { id: "call", hash: "call", title: "电话" }, { id: "listening", hash: "feature-media.listening", title: "一起听" },
    { id: "cobrowse", hash: "cobrowse", title: "一起看" }, { id: "kaomoji", view: "chat" }, { id: "game", hash: "feature-leisure.games", title: "一起游戏" },
    { id: "fishing", hash: "feature-leisure.fishing", title: "一起钓鱼" }, { id: "toys", hash: "toys", title: "玩具盒" },
    { id: "journey-text", hash: "journey", title: "旅行手记" }, { id: "travel", hash: "feature-travel.upstream", title: "旅行与漫游" }, { id: "status", hash: "status", title: "运行状态" },
    { id: "connection", hash: "connection", title: "模型连接" }, { id: "modules", hash: "modules", title: "功能包" }, { id: "appearance", hash: "appearance", title: "住在哪种光里" },
    { id: "data", hash: "data", title: "本地副本" }, { id: "about", hash: "about", title: "边界与接口" },
  ];
  for (const route of drawerRoutes) {
    await page.getByRole("button", { name: "打开全部功能" }).click();
    const entry = page.locator(`[data-drawer-entry-id="${route.id}"]`);
    await visible(entry, `抽屉 ${route.id}`);
    await entry.click();
    if (route.view) {
      await page.waitForFunction((view) => document.querySelector(".app-background")?.getAttribute("data-view") === view, route.view);
      assert.equal(new URL(page.url()).hash, "");
    } else {
      await visible(page.getByRole("heading", { name: route.title, exact: true, level: 1 }), `落点 ${route.id}`);
      assert.equal(new URL(page.url()).hash, `#${route.hash}`);
      await page.getByRole("button", { name: "返回", exact: true }).click();
    }
    assert.equal(await page.locator(".state-screen").count(), 0, `${route.id} must not become blank`);
  }
  record(`抽屉 ${drawerRoutes.length} 个入口的落点、URL 与返回逐一通过`);

  await openDrawerEntry(page, "共同工作本");
  const workCountBeforeVisibilityChange = await page.locator(".room-entry").count();
  await back(page);

  await openDrawerEntry(page, "功能包");
  const moodCapability = page.locator('[data-capability-id="companion.mood"]');
  await moodCapability.getByRole("button", { name: /已内置/ }).click();
  await page.getByRole("button", { name: /不要前端，直接隐藏/ }).click();
  await page.getByRole("button", { name: "隐藏这个功能", exact: true }).click();
  await visible(page.getByText("功能入口已隐藏", { exact: true }), "隐藏确认");
  await back(page);
  await page.getByRole("button", { name: "首页", exact: true }).click();
  assert.equal(await page.locator(".mood-peek").count(), 0, "hidden mood must disappear from home");
  await page.getByRole("button", { name: "打开全部功能" }).click();
  assert.equal(await page.locator('[data-drawer-entry-id="mood"]').count(), 0, "hidden mood must disappear from drawer");
  await page.getByRole("button", { name: "关闭全部功能" }).last().click();

  await page.goto(`${baseUrl}#mood`, { waitUntil: "networkidle" });
  await visible(page.getByRole("heading", { name: "功能包", exact: true }), "隐藏能力的恢复页");
  assert.equal(new URL(page.url()).hash, "#modules-companion.mood", "hidden deep links must not reopen the hidden page");
  await visible(page.locator(".capability-planner").filter({ hasText: "伙伴心情" }), "隐藏能力装配器");
  assert.equal(await page.getByRole("button", { name: /直接用内置实现/ }).getAttribute("aria-pressed"), "true", "restore must default to the recommended implementation");
  assert.equal(await page.getByRole("button", { name: "立即启用内置实现", exact: true }).isVisible(), true, "restore must expose a recovery action without another choice");
  await page.getByRole("button", { name: "立即启用内置实现", exact: true }).click();
  await visible(page.getByText("内置实现已启用", { exact: true }), "内置恢复确认");
  await back(page);
  await page.getByRole("button", { name: "打开全部功能" }).click();
  await visible(page.locator('[data-drawer-entry-id="mood"]'), "恢复后的心情入口");
  await page.getByRole("button", { name: "关闭全部功能" }).last().click();
  await openDrawerEntry(page, "共同工作本");
  assert.equal(await page.locator(".room-entry").count(), workCountBeforeVisibilityChange, "hide and local restore must not create work items");
  await back(page);
  record("不显示会移除入口并拦截旧深链；恢复默认选中内置实现且不生成待办");

  if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  await page.screenshot({ path: join(artifactRoot, "final-mobile.png"), fullPage: true });
  process.stdout.write(`\n${steps.length} 个真实浏览器验收点全部通过。\n`);
  process.stdout.write(`临时截图：${join(artifactRoot, "final-mobile.png")}\n`);
} catch (cause) {
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0]) await pages[0].screenshot({ path: join(artifactRoot, "failure.png"), fullPage: true });
  } catch { /* Best-effort failure evidence. */ }
  process.stderr.write(`✗ ${cause instanceof Error ? cause.stack || cause.message : String(cause)}\n`);
  process.stderr.write(`临时证据目录：${artifactRoot}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (!process.exitCode) await rm(artifactRoot, { recursive: true, force: true });
}
