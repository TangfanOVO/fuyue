import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { convertContinuityDirectory } from "../convert-private-continuity.mjs";

const timestamp = "2026-08-24T00:00:00.000Z";
function hash(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

test("verified private continuity becomes an importable LocalData v5 snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "fuyue-convert-"));
  try {
    const fixtures = {
      "chat/conversations.jsonl": [{ id: "conversation-1", title: "同一段话", mode: "companion", status: "active", started_at: timestamp, created_at: timestamp, updated_at: timestamp }],
      "chat/messages.jsonl": [
        { id: "message-1", conversation_id: "conversation-1", role: "user", content: "原话", status: "complete", created_at: timestamp },
        { id: "message-2", conversation_id: "conversation-1", role: "assistant", content: "回答", status: "complete", model_key: "model", created_at: timestamp },
        { id: "message-tool", conversation_id: "conversation-1", role: "tool", content: "secret trace", status: "complete", created_at: timestamp },
      ],
      "memory/items.jsonl": [{ id: "memory-1", title: "记住", content: "稳定事实", memory_layer: "core", status: "active", injection_enabled: true, created_at: timestamp, updated_at: timestamp }],
      "memory/evidence-links.jsonl": [{ memory_id: "memory-1", message_id: "message-1" }],
      "continuity/checkins.jsonl": [{ id: "checkin-1", sender_key: "user", kind: "miss", message: "想你", created_at: timestamp }],
      "continuity/social-posts.jsonl": [{ id: "whisper-1", author_key: "companion", post_kind: "whisper", content: "不应进入公开副本", status: "active", created_at: timestamp, updated_at: timestamp }],
      "work/items.jsonl": [{ id: "work-1", title: "做完迁移", body: "验收", item_kind: "todo", status: "in_progress", created_by: "codex", created_at: timestamp, updated_at: timestamp }],
    };
    const files = {};
    for (const [name, rows] of Object.entries(fixtures)) {
      const path = join(root, name); await mkdir(join(path, ".."), { recursive: true });
      const content = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      await writeFile(path, content); files[name] = { byte_size: content.byteLength, sha256: hash(content) };
    }
    await writeFile(join(root, "manifest.json"), JSON.stringify({ format: "fuyue-portable-continuity", format_version: 1, created_at: timestamp, files }));
    const { output, report } = await convertContinuityDirectory(root);
    assert.equal(output.schemaVersion, 5);
    assert.deepEqual(output.toys, []);
    assert.equal(output.messages.length, 2);
    assert.equal(output.messages[1].role, "companion");
    assert.deepEqual(output.messages[1].attachments, []);
    assert.equal(output.messages[1].archiveState, "active");
    assert.equal(output.people[0].avatarDataUrl, null);
    assert.deepEqual(output.memories[0].sourceMessageIds, ["message-1"]);
    assert.equal(output.roomEntries.find((entry) => entry.room === "checkin")?.content, "想你");
    assert.equal(output.roomEntries.some((entry) => entry.room === "whisper"), false);
    assert.equal(output.roomEntries.find((entry) => entry.room === "work")?.author, "system");
    assert.equal(report.skippedMessageRoles, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("converter rejects a modified backup member", async () => {
  const root = await mkdtemp(join(tmpdir(), "fuyue-convert-bad-"));
  try {
    await mkdir(join(root, "chat"), { recursive: true });
    await writeFile(join(root, "chat/messages.jsonl"), "{}\n");
    await writeFile(join(root, "manifest.json"), JSON.stringify({ format: "fuyue-portable-continuity", format_version: 1, created_at: timestamp, files: { "chat/messages.jsonl": { byte_size: 3, sha256: "0".repeat(64) } } }));
    await assert.rejects(() => convertContinuityDirectory(root), /校验失败/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
