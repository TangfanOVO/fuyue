import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [helper, memory, chat] = await Promise.all([
  readFile(new URL("../src/local-file-import.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/memory-panel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/chat-view.tsx", import.meta.url), "utf8"),
]);

test("local text import keeps the mobile batch small and rejects oversize content", () => {
  assert.match(helper, /txt\|md\|markdown\|json\|csv/);
  assert.match(helper, /files\.slice\(0, 50\)/);
  assert.match(helper, /file\.size > 500_000/);
  assert.match(helper, /content\.length > 20_000/);
  assert.doesNotMatch(helper, /content\.slice/);
});

test("open-source memories stay in the repository's draft-disabled path", () => {
  assert.match(memory, /repository\.createMemory/);
  assert.match(memory, /setFilter\("draft"\)/);
  assert.match(memory, /先进入待审/);
  assert.match(memory, /webkitdirectory/);
  assert.ok(memory.indexOf('className="memory-file-import"') > memory.indexOf('className="memory-system-note"'), "memory import should stay below the ordinary memory content");
});

test("open-source chat makes selected local text visible before send", () => {
  assert.match(chat, /readFilesIntoComposer/);
  assert.match(chat, /【本机文件：/);
  assert.match(chat, /setContent\(next\)/);
  assert.match(chat, /type="file" multiple/);
  assert.match(chat, /webkitdirectory/);
});
