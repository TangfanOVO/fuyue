import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const relayUrl = process.env.FUYUE_QA_RELAY || "http://127.0.0.1:8788";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function messages(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("fuyue-localdata");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction("messages", "readonly").objectStore("messages").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  });
}

async function enter(page, configuredRelay = relayUrl) {
  await page.addInitScript((value) => localStorage.setItem("fuyue-public-relay-url", value), configuredRelay);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
}

async function sendAndWaitForError(page, input, expected) {
  await page.getByLabel("聊天原文").fill(input);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const error = page.locator(".inline-error");
  await error.waitFor({ state: "visible", timeout: 20_000 });
  assert.match(await error.innerText(), expected);
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const page = await context.newPage();
  await enter(page);
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await page.getByLabel("选择模型").locator('option[value="contract"]').waitFor({ state: "attached" });
  assert.match(await page.getByLabel("选择模型").innerText(), /契约测试模型（非 DeepSeek）/);

  await sendAndWaitForError(page, "半截流", /没有完整结束|半截内容没有写入原文账本/);
  let ledger = await messages(page);
  assert.equal(ledger.some((item) => item.role === "user" && item.content === "半截流"), true);
  assert.equal(ledger.some((item) => item.role === "companion" && item.content.includes("不应入账的半截回复")), false);
  assert.equal(await page.getByText("这是不应入账的半截回复", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "只重试伙伴回复" }).isVisible(), true);
  process.stdout.write("✓ 半截流：用户原话入账，半截伙伴回复未入账，可只重试回复\n");

  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.getByLabel("聊天原文").fill("完整恢复回复");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText("契约回复完整结束，没有请求任何本机工具。", { exact: true }).waitFor();
  ledger = await messages(page);
  assert.equal(ledger.some((item) => item.role === "companion" && item.content.includes("完整结束")), true);
  process.stdout.write("✓ 半截流后可发送新请求并正式入账\n");

  for (const [input, expected] of [["触发 401", /401|登录已过期/], ["触发 429", /429|请求太频繁/]]) {
    await sendAndWaitForError(page, input, expected);
    ledger = await messages(page);
    assert.equal(ledger.some((item) => item.role === "user" && item.content === input), true);
    assert.equal(await page.getByRole("button", { name: "只重试伙伴回复" }).isVisible(), true);
    await page.getByRole("button", { name: "关闭提示" }).click();
  }
  process.stdout.write("✓ 401 / 429：可见错误，用户原话已保存，可只重试伙伴回复\n");

  await page.evaluate(() => {
    window.__fuyueOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function blockedPut() { throw new DOMException("契约测试写入失败", "QuotaExceededError"); };
  });
  await sendAndWaitForError(page, "写入失败仍要保留的原话", /原话还没有保存/);
  assert.equal(await page.getByLabel("聊天原文").inputValue(), "写入失败仍要保留的原话");
  ledger = await messages(page);
  assert.equal(ledger.some((item) => item.content === "写入失败仍要保留的原话"), false);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__fuyueOriginalPut; });
  process.stdout.write("✓ IndexedDB 写失败：不假成功，输入保留，数据未入账\n");
  await context.close();

  const timeoutContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const timeoutPage = await timeoutContext.newPage();
  await enter(timeoutPage, `${relayUrl}/slow`);
  await timeoutPage.getByRole("button", { name: "打开全部功能" }).click();
  await timeoutPage.locator(".drawer-entry").filter({ hasText: "运行状态" }).click();
  await timeoutPage.getByText("连接已保存，当前不可用", { exact: true }).waitFor({ timeout: 20_000 });
  assert.match(await timeoutPage.locator(".connection-state").innerText(), /连接已保存，当前不可用/);
  process.stdout.write("✓ relay 超时：运行状态如实标记不可用\n");
  await timeoutContext.close();
} finally {
  await browser.close();
}
