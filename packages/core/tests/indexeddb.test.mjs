import assert from "node:assert/strict";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import { DATA_SCHEMA_VERSION, IndexedDbRepository } from "../dist/index.js";

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

test("LocalData persists people, messages, memories and a portable snapshot", async () => {
  const repository = new IndexedDbRepository();
  await repository.initialize();

  const people = await repository.listPeople();
  const conversations = await repository.listConversations();
  assert.equal(people.length, 2);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.surface, "local");

  const conversation = conversations[0];
  assert.ok(conversation);
  const initialMessages = await repository.listMessages(conversation.id);
  assert.equal(initialMessages.length, 1);
  assert.equal(await repository.countMessages(), 1);

  await repository.appendMessage({
    conversationId: conversation.id,
    role: "user",
    content: "这句话只在本地账本中。",
    toolTrace: [{ name: "本地保存", status: "success", summary: "已写入浏览器" }],
  });
  const memory = await repository.createMemory({
    title: "称呼偏好",
    content: "使用双方确认的称呼。",
    layer: "working",
  });
  assert.equal(memory.status, "draft");
  assert.equal(memory.injectionEnabled, false);

  const snapshot = await repository.snapshot();
  assert.equal(snapshot.people.length, 2);
  assert.equal(snapshot.messages.length, 2);
  assert.equal(await repository.countMessages(), 2);
  const savedMessage = snapshot.messages.find((item) => item.content === "这句话只在本地账本中。");
  assert.equal(savedMessage?.toolTrace[0]?.name, "本地保存");
  assert.equal(snapshot.memories.length, 1);
  assert.equal(snapshot.memories[0]?.title, "称呼偏好");
  const toy = await repository.createToy({ title: "离线玩具", html: "<!doctype html><html><body>play</body></html>", createdBy: "companion", sourceLabel: "test tool" });
  await repository.recordToyActivityEvent({ toyId: toy.id, sessionId: "session-1", kind: "complete", summary: "完成一轮", details: { score: 3 } });
  assert.equal((await repository.listToys())[0]?.title, "离线玩具");
  assert.equal((await repository.listToyActivityEvents(toy.id))[0]?.details.score, 3);
  const builtInOne = await repository.createToy({ title: "内置玩具", html: "<!doctype html><html><body>v1</body></html>", createdBy: "system" });
  const builtInTwo = await repository.createToy({ title: "内置玩具", html: "<!doctype html><html><body>v2</body></html>", createdBy: "system" });
  assert.equal(builtInOne.id, builtInTwo.id);
  assert.equal((await repository.listToys(true)).filter((item) => item.title === "内置玩具").length, 1);
  await repository.createRoomEntry({ room: "checkin", author: "user", title: "想靠近", content: "碰一碰。", subtype: "want_touch" });
  assert.equal((await repository.listRoomEntries("checkin")).length, 1);
});

test("reviewed snapshot import is transactional and idempotent", async () => {
  const repository = new IndexedDbRepository();
  await repository.initialize();
  const timestamp = "2026-08-21T00:00:00.000Z";
  const incoming = {
    format: "fuyue-portable",
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: timestamp,
    people: [],
    memories: [{ id: "import-memory", title: "Imported", content: "Review first", layer: "semantic", status: "active", injectionEnabled: true, sourceMessageIds: ["import-message"], createdAt: timestamp, updatedAt: timestamp }],
    conversations: [{ id: "import-conversation", title: "Imported conversation", surface: "external_import", createdAt: timestamp, updatedAt: timestamp }],
    messages: [{ id: "import-message", conversationId: "import-conversation", role: "user", content: "Imported original", source: "external_import", sourceLabel: "test fixture", modelLabel: "", toolTrace: [], attachments: [], parentMessageId: null, isStarred: false, archiveState: "active", createdAt: timestamp }],
    roomEntries: [{ id: "import-letter", room: "letter", author: "companion", title: "Letter", content: "Keep me", subtype: "", sourceLabel: "test fixture", status: "active", occurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp }],
    toys: [],
    toyActivityEvents: [],
    settings: { id: "workspace", theme: "wisteria", mode: "dark", effect: "butterfly", effects: ["butterfly", "glow"], density: 3, speed: 2, layout: "paper", pinnedRoomIds: ["letter"], hiddenCapabilityIds: [], enabledCapabilityIds: [], updatedAt: timestamp },
  };
  const first = await repository.importSnapshot(incoming, { replacePeople: false, replaceSettings: true });
  const second = await repository.importSnapshot(incoming, { replacePeople: false });
  assert.deepEqual(first, { people: 0, memories: 1, conversations: 1, messages: 1, roomEntries: 1, toys: 0, toyActivityEvents: 0, settings: 1 });
  assert.deepEqual(second, { people: 0, memories: 0, conversations: 0, messages: 0, roomEntries: 0, toys: 0, toyActivityEvents: 0, settings: 0 });
  const imported = (await repository.listMemories()).find((item) => item.id === "import-memory");
  assert.equal(imported.status, "draft");
  assert.equal(imported.injectionEnabled, false);
  assert.equal((await repository.listRoomEntries("letter"))[0]?.id, "import-letter");
  assert.equal((await repository.getSettings()).theme, "wisteria");
  assert.equal((await repository.getSettings()).mode, "dark");
});
