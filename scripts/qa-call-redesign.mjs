import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputRoot = process.env.FUYUE_QA_CALL_OUTPUT || "/tmp";
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await page.getByRole("button", { name: "打开全部功能" }).click();
  await page.locator(".drawer-entry").filter({ hasText: "电话" }).first().click();
  await page.getByRole("heading", { name: "电话", exact: true }).waitFor();
  await page.waitForTimeout(450);

  const dialer = page.locator(".public-call-dialer");
  const settings = page.locator(".public-call-settings");
  assert.equal(await dialer.isVisible(), true);
  assert.equal(await settings.getAttribute("open"), null, "technical settings must be folded on entry");
  assert.equal(await page.getByText("这通电话怎样走").count(), 0);
  assert.equal(await page.getByText("请她现在回答").count(), 0);
  assert.equal(await page.getByText("打断播报").count(), 0);
  const body = await page.locator("body").innerText();
  for (const label of ["打电话", "通话记录", "中文", "English", "拨号", "语音设置"]) assert.match(body, new RegExp(label));
  await page.screenshot({ path: `${outputRoot}/fuyue-call-idle-390x844.png` });

  await settings.locator("summary").click();
  assert.equal(await settings.getAttribute("open"), "");
  await page.screenshot({ path: `${outputRoot}/fuyue-call-settings-390x844.png` });
  await settings.locator("summary").click();

  await page.getByRole("button", { name: /通话记录/ }).click();
  await page.getByRole("heading", { name: "我们的通话原文" }).waitFor();
  await page.screenshot({ path: `${outputRoot}/fuyue-call-records-390x844.png` });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "打电话", exact: true }).click();
  await page.screenshot({ path: `${outputRoot}/fuyue-call-idle-1280x900.png` });
  process.stdout.write("✓ 电话首屏只有拨号所需信息\n✓ 技术配置默认折叠\n✓ 通话记录独立成页\n✓ 390×844 与 1280×900 均已截图\n");
  await context.close();
} finally {
  await browser.close();
}
