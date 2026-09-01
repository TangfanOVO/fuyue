import assert from "node:assert/strict";
import test from "node:test";

import { DATA_SCHEMA_VERSION, isWorkspaceSnapshot, normalizeSnapshotForImport, parseWorkspaceSnapshot, previewSnapshotImport, serializeSnapshot } from "../dist/index.js";

const valid = {
  format: "fuyue-portable",
  schemaVersion: DATA_SCHEMA_VERSION,
  exportedAt: "2026-08-13T00:00:00.000Z",
  people: [],
  memories: [],
  conversations: [],
  messages: [],
  roomEntries: [],
  toys: [],
  toyActivityEvents: [],
  settings: { id: "workspace", theme: "redleaf", mode: "light", effect: "leaf", effects: ["leaf"], density: 2, speed: 2, layout: "paper", pinnedRoomIds: ["schedule", "checkin", "memory", "work"], hiddenCapabilityIds: [], enabledCapabilityIds: [], updatedAt: "2026-08-13T00:00:00.000Z" },
};

test("accepts the current portable snapshot shape", () => {
  assert.equal(isWorkspaceSnapshot(valid), true);
  assert.match(serializeSnapshot(valid), /"format": "fuyue-portable"/);
});

test("keeps rain and migrates retired particle effects without breaking a v4 backup", () => {
  const { effects: _effects, ...legacySettings } = valid.settings;
  assert.equal(parseWorkspaceSnapshot({ ...valid, settings: { ...legacySettings, effect: "rain" } }).settings.effect, "rain");
  assert.equal(parseWorkspaceSnapshot({ ...valid, settings: { ...legacySettings, effect: "petal" } }).settings.effect, "leaf");
  assert.equal(parseWorkspaceSnapshot({ ...valid, settings: { ...legacySettings, effect: "feather" } }).settings.effect, "leaf");
  assert.equal(parseWorkspaceSnapshot({ ...valid, settings: { ...legacySettings, effect: "origami" } }).settings.effect, "leaf");
  assert.deepEqual(parseWorkspaceSnapshot({ ...valid, settings: { ...valid.settings, effect: "leaf", effects: ["leaf", "bubble", "glow"] } }).settings.effects, ["leaf", "bubble", "glow"]);
});

test("rejects unsupported or incomplete snapshots", () => {
  assert.equal(isWorkspaceSnapshot({ ...valid, schemaVersion: 99 }), false);
  assert.equal(isWorkspaceSnapshot({ format: "fuyue-portable" }), false);
});

test("rejects duplicate ids and orphan messages", () => {
  assert.throws(() => parseWorkspaceSnapshot({ ...valid, conversations: [{ id: "c", title: "a", surface: "local", createdAt: valid.exportedAt, updatedAt: valid.exportedAt }, { id: "c", title: "b", surface: "local", createdAt: valid.exportedAt, updatedAt: valid.exportedAt }] }), /重复 ID/);
  assert.throws(() => parseWorkspaceSnapshot({ ...valid, messages: [{ id: "m", conversationId: "missing", role: "user", content: "hello", source: "external_import", sourceLabel: "test", modelLabel: "", toolTrace: [], attachments: [], parentMessageId: null, isStarred: false, archiveState: "active", createdAt: valid.exportedAt }] }), /所属对话/);
});

test("import preview forces incoming memories back to review", () => {
  const incoming = {
    ...valid,
    memories: [{ id: "memory", title: "review me", content: "content", layer: "core", status: "active", injectionEnabled: true, sourceMessageIds: [], createdAt: valid.exportedAt, updatedAt: valid.exportedAt }],
  };
  const normalized = normalizeSnapshotForImport(incoming);
  assert.equal(normalized.memories[0].status, "draft");
  assert.equal(normalized.memories[0].injectionEnabled, false);
  const preview = previewSnapshotImport(valid, incoming);
  assert.equal(preview.memoriesForcedToDraft, 1);
  assert.equal(preview.addable.memories, 1);
});

test("upgrades schema v2 snapshots without inventing room content", () => {
  const legacy = { ...valid, schemaVersion: 2 };
  delete legacy.roomEntries;
  delete legacy.settings;
  const upgraded = parseWorkspaceSnapshot(legacy);
  assert.deepEqual(upgraded.roomEntries, []);
  assert.equal(upgraded.settings.theme, "redleaf");
  assert.equal(upgraded.settings.mode, "light");
});

test("previews portable room entries and settings independently", () => {
  const incoming = {
    ...valid,
    roomEntries: [{ id: "letter-1", room: "letter", author: "user", title: "Later", content: "Keep this", subtype: "", sourceLabel: "test", status: "active", occurredAt: valid.exportedAt, createdAt: valid.exportedAt, updatedAt: valid.exportedAt }],
    settings: { ...valid.settings, theme: "blue" },
  };
  const preview = previewSnapshotImport(valid, incoming);
  assert.equal(preview.addable.roomEntries, 1);
  assert.equal(preview.replaceableSettings, true);
});

test("portable toy activity must belong to a real portable toy", () => {
  const toy = { id: "toy-1", title: "Toy", html: "<!doctype html><html><body>play</body></html>", createdBy: "companion", sourceLabel: "model tool", status: "active", createdAt: valid.exportedAt, updatedAt: valid.exportedAt };
  const event = { id: "event-1", toyId: toy.id, sessionId: "session-1", kind: "complete", summary: "done", details: { score: 4 }, occurredAt: valid.exportedAt };
  const parsed = parseWorkspaceSnapshot({ ...valid, toys: [toy], toyActivityEvents: [event] });
  assert.equal(parsed.toyActivityEvents[0].details.score, 4);
  assert.throws(() => parseWorkspaceSnapshot({ ...valid, toyActivityEvents: [event] }), /玩具/);
});

test("keeps a public companion whisper as a normal portable room entry", () => {
  const snapshot = parseWorkspaceSnapshot({
    ...valid,
    roomEntries: [{ id: "whisper-1", room: "whisper", author: "companion", title: "", content: "想到你了。", subtype: "assistant_action", sourceLabel: "model tool", status: "active", occurredAt: valid.exportedAt, createdAt: valid.exportedAt, updatedAt: valid.exportedAt }],
  });
  assert.equal(snapshot.roomEntries[0].room, "whisper");
  assert.equal(snapshot.roomEntries[0].content, "想到你了。");
});
