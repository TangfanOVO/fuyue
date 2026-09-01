import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/app.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/chat-view.tsx", import.meta.url), "utf8");
const cobrowse = await readFile(new URL("../src/cobrowse-panel.tsx", import.meta.url), "utf8");
const engawa = await readFile(new URL("../src/engawa-panel.tsx", import.meta.url), "utf8");
const journey = await readFile(new URL("../src/journey-panel.tsx", import.meta.url), "utf8");
const capabilities = await readFile(new URL("../../../packages/core/src/capabilities.ts", import.meta.url), "utf8");

test("co-watch is reachable from chat and space and persists success or failure", () => {
  assert.match(chat, /onOpenPanel\("cobrowse"\)/);
  assert.match(app, /id:\s*"space"[\s\S]{0,240}?openPanel\("cobrowse"\)/);
  assert.match(cobrowse, /repository\.createRoomEntry/);
  assert.match(cobrowse, /gateway\.cobrowseComment/);
  assert.match(cobrowse, /repository\.saveRoomEntry\(\{ \.\.\.share, status: "done" \}\)/);
  assert.match(cobrowse, /sourceLabel: "一起看 · 失败记录"/);
});

test("Engawa and Journey are bundled while read and listen remain honest referrals", () => {
  assert.match(engawa, /gateway\??\.engawaStatus/);
  assert.match(engawa, /gateway\??\.engawaAction/);
  assert.match(journey, /subtype: "journey_text"/);
  assert.match(journey, /Journey Cards 文本适配 · LocalData/);
  assert.match(capabilities, /id: "reading\.engawa"[\s\S]{0,500}?bundledImplementation: "ready"/);
  assert.match(capabilities, /id: "travel\.story_cards"[\s\S]{0,500}?bundledImplementation: "ready"/);
  assert.match(capabilities, /id: "reading\.together"[\s\S]{0,500}?bundledImplementation: "surface"[\s\S]{0,500}?readest\/readest/);
  assert.match(capabilities, /id: "media\.listening"[\s\S]{0,500}?bundledImplementation: "surface"[\s\S]{0,500}?Yueby\/music-together/);
});
