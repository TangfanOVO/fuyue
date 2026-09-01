import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function workItems(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("fuyue-localdata"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = await new Promise((resolve, reject) => { const request = db.transaction("roomEntries", "readonly").objectStore("roomEntries").getAll(); request.onsuccess = () => resolve(request.result.filter((item) => item.room === "work")); request.onerror = () => reject(request.error); });
    db.close(); return result;
  });
}

async function select(page, capabilityId) {
  const capability = page.locator(`[data-capability-id="${capabilityId}"]`);
  await capability.getByRole("button", { name: /(?:已内置|前端已带|选择实现|恢复显示)/ }).click();
  return page.locator(".capability-planner");
}

async function closePlanner(page) {
  await page.getByRole("button", { name: "关闭装配选择" }).click();
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__fuyueOpenedUpstreams = [];
    window.open = (url) => { window.__fuyueOpenedUpstreams.push(String(url)); return null; };
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await page.getByRole("button", { name: "打开全部功能" }).click();
  await page.locator(".drawer-entry").filter({ hasText: "功能包" }).click();
  const initialWork = (await workItems(page)).length;

  let planner = await select(page, "companion.mood");
  await planner.getByRole("button", { name: /直接用内置实现/ }).click();
  await planner.getByRole("button", { name: "立即启用内置实现" }).click();
  await planner.getByText("内置实现已启用", { exact: true }).waitFor();
  assert.equal((await workItems(page)).length, initialWork);
  await closePlanner(page);

  planner = await select(page, "leisure.toys");
  await planner.getByRole("button", { name: /只拿前端积木/ }).click();
  let downloadPromise = page.waitForEvent("download");
  await planner.getByRole("button", { name: "生成装配单并写入工作本" }).click();
  let downloaded = await downloadPromise;
  let plan = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  assert.equal(plan.choice, "frontend_only");
  assert.equal((await workItems(page)).length, initialWork + 1);
  await closePlanner(page);

  planner = await select(page, "travel.upstream");
  await planner.getByRole("button", { name: /接自己的后端/ }).click();
  downloadPromise = page.waitForEvent("download");
  await planner.getByRole("button", { name: "生成装配单并写入工作本" }).click();
  downloaded = await downloadPromise; plan = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  assert.equal(plan.choice, "custom_backend");
  await closePlanner(page);

  planner = await select(page, "travel.upstream");
  await planner.getByRole("button", { name: /接现成兼容服务/ }).click();
  downloadPromise = page.waitForEvent("download");
  await planner.getByRole("button", { name: "生成装配单并写入工作本" }).click();
  downloaded = await downloadPromise; plan = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  assert.equal(plan.choice, "fuyue_service");
  assert.equal((await workItems(page)).length, initialWork + 3);
  await closePlanner(page);

  planner = await select(page, "travel.upstream");
  await planner.getByRole("button", { name: /使用原仓库/ }).click();
  await planner.getByRole("button", { name: "打开原仓库" }).click();
  await planner.getByText("已经打开原仓库", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__fuyueOpenedUpstreams), ["https://github.com/yuyixuanfu/nowhere"]);
  assert.equal((await workItems(page)).length, initialWork + 3);
  await closePlanner(page);

  planner = await select(page, "companion.mood");
  await planner.getByRole("button", { name: /不要前端，直接隐藏/ }).click();
  await planner.getByRole("button", { name: "隐藏这个功能" }).click();
  await planner.getByText("功能入口已隐藏", { exact: true }).waitFor();
  assert.equal((await workItems(page)).length, initialWork + 3);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.match(await page.locator('[data-capability-id="companion.mood"]').innerText(), /已隐藏/);
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "打开全部功能" }).click();
  assert.equal(await page.locator('[data-drawer-entry-id="mood"]').count(), 0);

  process.stdout.write("✓ 内置启用与隐藏均不生成工作单\n✓ 只拿前端 / 自建后端 / 兼容服务各生成真实可下载装配单并各写 1 条工作本\n✓ 原仓库打开登记的 Nowhere 地址且不写工作单\n✓ 隐藏刷新后仍保留，普通抽屉入口消失\n");
  await context.close();
} finally {
  await browser.close();
}
