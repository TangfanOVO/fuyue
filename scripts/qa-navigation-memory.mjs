import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputRoot = process.env.FUYUE_QA_NAV_OUTPUT || "/tmp";
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const testTitle = `导航验收记忆-${Date.now()}`;

async function enter(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "继续上次" }).waitFor();
}

async function back(page) {
  await page.getByRole("button", { name: "返回" }).click();
}

async function openDrawerEntry(page, text) {
  await page.getByRole("button", { name: "打开全部功能" }).click();
  const entry = page.locator(".drawer-entry").filter({ hasText: text }).first();
  await entry.waitFor();
  await entry.click();
}

async function readMemoryStore(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("fuyue-localdata");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("memories", "readonly").objectStore("memories").getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => resolve(read.result);
    };
  }));
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", deviceScaleFactor: 2 });
  const page = await context.newPage();
  await enter(page);

  const homeCall = page.getByRole("button", { name: /电话与声音 回到我们的声音房间/ });
  assert.equal(await homeCall.isVisible(), true, "home must expose the call room without a drawer");
  await homeCall.click();
  await page.getByRole("heading", { name: "电话", exact: true }).waitFor();
  await back(page);

  await page.getByRole("button", { name: "一起", exact: true }).click();
  await page.getByRole("heading", { name: "现在可以一起" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /电话与声音 实时转写/ }).isVisible(), true);
  await page.getByRole("tab", { name: "一起做" }).click();
  assert.match(await page.locator(".direct-list .direct-row").first().innerText(), /^电话与声音/);
  await page.screenshot({ path: `${outputRoot}/fuyue-together-phone-390x844.png` });

  await page.getByRole("button", { name: "房间", exact: true }).click();
  for (const label of ["一起生活", "一起做与玩", "伙伴自己", "整理与系统"]) {
    assert.equal(await page.getByRole("button", { name: new RegExp(`^${label}`) }).isVisible(), true, `${label} room category must exist`);
  }
  await page.getByRole("button", { name: /^一起做与玩/ }).click();
  const roomCall = page.getByRole("button", { name: /电话与声音，点一下在原位浮起/ });
  assert.equal(await roomCall.isVisible(), true);
  assert.equal((await page.locator(".portal-card strong").first().innerText()), "电话与声音");
  await page.screenshot({ path: `${outputRoot}/fuyue-rooms-phone-390x844.png` });

  await page.getByRole("button", { name: "打开全部功能" }).click();
  const drawerGroups = page.locator(".drawer-group");
  assert.match(await drawerGroups.nth(1).innerText(), /^一起做与玩\n电话与声音/);
  assert.match(await drawerGroups.nth(2).innerText(), /^身份、记忆与共同记录\n记忆库/);
  await page.getByRole("dialog", { name: "全部功能" }).getByRole("button", { name: "关闭全部功能" }).click();

  await page.getByRole("button", { name: "首页", exact: true }).click();
  await openDrawerEntry(page, "记忆库");
  await page.getByRole("heading", { name: "记忆库", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__fuyueHandleNativeBack?.()), true, "native Back must consume an open panel");
  await page.waitForFunction(() => window.location.hash === "");
  await page.getByRole("navigation", { name: "主要页面" }).waitFor();
  assert.equal(new URL(page.url()).hash, "", "closing memory must return to the root URL");
  assert.equal(await page.evaluate(() => window.__fuyueHandleNativeBack?.()), false, "root must be ready to exit instead of reopening an old panel");

  await openDrawerEntry(page, "我们是谁");
  await page.getByRole("heading", { name: "我们是谁", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__fuyueHandleNativeBack?.()), true, "native Back must consume the second panel");
  await page.waitForFunction(() => window.location.hash === "");
  await page.getByRole("navigation", { name: "主要页面" }).waitFor();
  assert.equal(new URL(page.url()).hash, "", "closing people must return to the root URL");
  assert.equal(await page.evaluate(() => window.__fuyueHandleNativeBack?.()), false, "the second visit must not leave a ghost root entry");

  await page.getByRole("button", { name: /^记忆 0 条/ }).click();
  await page.getByRole("heading", { name: "记忆库", exact: true }).waitFor();
  await page.getByRole("button", { name: "写第一条" }).click();
  await page.getByLabel("标题").fill(testTitle);
  await page.getByLabel("内容").fill("这是隔离浏览器中的导航与持久化验收记录，不应自动参与召回。");
  await page.getByRole("combobox", { name: "记忆层级" }).selectOption("semantic");
  await page.getByRole("button", { name: "保存为待审记忆" }).click();
  const card = page.locator(".memory-item").filter({ hasText: testTitle });
  await card.waitFor();
  assert.match(await card.innerText(), /L2 长期/);
  assert.match(await card.innerText(), /待审/);
  let stored = await readMemoryStore(page);
  let record = stored.find((item) => item.title === testTitle);
  assert.ok(record, "created memory must exist in IndexedDB");
  assert.equal(record.injectionEnabled, false);
  assert.equal(record.layer, "semantic");

  await card.getByRole("button", { name: "启用记忆" }).click();
  await card.getByRole("button", { name: "参与召回" }).waitFor();
  stored = await readMemoryStore(page);
  record = stored.find((item) => item.title === testTitle);
  assert.equal(record.injectionEnabled, true);
  assert.equal(record.status, "active");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "记忆库", exact: true }).waitFor();
  const reloadedCard = page.locator(".memory-item").filter({ hasText: testTitle });
  await reloadedCard.waitFor();
  assert.match(await reloadedCard.innerText(), /已启用/);
  await page.getByLabel("搜索记忆").fill("隔离浏览器");
  assert.equal(await reloadedCard.isVisible(), true);
  await page.screenshot({ path: `${outputRoot}/fuyue-memory-library-390x844.png`, fullPage: true });

  page.once("dialog", (dialog) => dialog.accept());
  await reloadedCard.getByRole("button", { name: `删除记忆 ${testTitle}` }).click();
  await reloadedCard.waitFor({ state: "detached" });
  stored = await readMemoryStore(page);
  assert.equal(stored.some((item) => item.title === testTitle), false, "QA memory must be removed from isolated IndexedDB");

  await page.setViewportSize({ width: 1280, height: 900 });
  await back(page);
  await page.getByRole("button", { name: "一起", exact: true }).click();
  await page.screenshot({ path: `${outputRoot}/fuyue-together-phone-1280x900.png` });

  process.stdout.write([
    "✓ 首页一跳进入电话与声音",
    "✓ 一起页今天区和一起做首位都能找到电话",
    "✓ 房间按家里四类分组，电话是一起做与玩首位",
    "✓ 抽屉第二组首位是电话，下一组首位是记忆库",
    "✓ 抽屉 → 记忆 / 人物 → Android Back 均单调回到首页，无幽灵历史",
    `✓ 记忆 ${testTitle}：待审 → IndexedDB 读回 → 启用 → 刷新 → 搜索 → 删除`,
    "✓ 390×844 与 1280×900 已截图",
  ].join("\n") + "\n");
  await context.close();
} finally {
  await browser.close();
}
