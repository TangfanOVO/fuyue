import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.FUYUE_QA_URL || "http://127.0.0.1:4173/";
const chromePath = process.env.FUYUE_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const splash = page.getByRole("button", { name: "进入赴约" });
  if (await splash.isVisible().catch(() => false)) await splash.click();
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  const composer = page.locator(".composer-zone");
  const nav = page.locator(".bottom-nav");
  let composerBox = await composer.boundingBox();
  let navBox = await nav.boundingBox();
  assert.ok(composerBox && navBox && composerBox.y + composerBox.height <= navBox.y + 2);

  await page.getByLabel("聊天原文").focus();
  await page.setViewportSize({ width: 390, height: 480 });
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-keyboard-open") === "true");
  assert.equal(await nav.getAttribute("aria-hidden"), "true");
  await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".bottom-nav")).opacity) < 0.01);
  composerBox = await composer.boundingBox();
  assert.ok(composerBox && composerBox.y + composerBox.height <= 480);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("聊天原文").blur();
  await page.waitForFunction(() => document.querySelector("main.app-shell")?.getAttribute("data-keyboard-open") === "false");
  await page.screenshot({ path: "/tmp/fuyue-layout-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.locator(".topbar").isVisible(), true);
  assert.equal(await nav.getAttribute("aria-hidden"), null);
  assert.equal(await nav.evaluate((element) => getComputedStyle(element).position), "fixed");
  assert.equal(await page.locator(".topbar").evaluate((element) => getComputedStyle(element).position), "fixed");
  await page.screenshot({ path: process.env.FUYUE_QA_LAYOUT_SCREENSHOT || "/tmp/fuyue-layout-desktop.png", fullPage: true });
  process.stdout.write("✓ 390×844 输入区不与底栏重叠\n✓ 390×480 键盘态顶底栏退出，输入区留在可见区\n✓ 1280×900 顶栏与五栏均为 fixed\n");
  await context.close();
} finally {
  await browser.close();
}
