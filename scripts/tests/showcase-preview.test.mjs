import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [source, styles, manifest] = await Promise.all([
  readFile(new URL("../../apps/showcase/src/main.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../apps/showcase/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../../fuyue.layers.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("showcase exposes an honest interactive phone flow", () => {
  assert.match(source, /id: "call"/);
  assert.match(source, /function\/voice-call/);
  assert.match(source, /function CallPreview/);
  assert.match(source, /不会申请麦克风/);
  assert.match(source, /不会连供应商/);
  assert.match(source, /插话/);
  assert.match(source, /通话记录/);
  assert.match(styles, /\.call-preview-screen/);
  assert.equal(manifest.functionPacks["voice-call"].kind, "application-slice");
});

test("showcase lets adopters verify memory density without writing fake records", () => {
  assert.match(source, /\[3, 144, 500, 1000\]/);
  assert.match(source, /makePreviewMemories/);
  assert.match(source, /MemoryMap memories={previewMemories}/);
  assert.match(source, /不写入 LocalData/);
  assert.match(styles, /\.memory-scale-controls/);
});

test("showcase points take-away visitors back to the public MIT source", () => {
  assert.match(source, /https:\/\/github\.com\/TangfanOVO\/fuyue\/tree\/main\/packages\/ui/);
  assert.match(source, /前端积木 MIT · 完整赴约 AGPL-3\.0-only/);
  assert.match(styles, /\.source-link/);
});
