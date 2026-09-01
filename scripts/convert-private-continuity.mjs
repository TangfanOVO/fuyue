import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const FORMAT = "fuyue-portable-continuity";
const OUTPUT_FORMAT = "fuyue-portable";
const OUTPUT_SCHEMA = 5;
const allowedSurfaces = new Set(["local", "chatgpt_work", "codex", "relay", "external_import"]);

function asText(value, fallback = "") { return typeof value === "string" ? value : value == null ? fallback : String(value); }
function clipped(value, limit) { const text = asText(value); return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 18))}\n\n[转换时已截断过长内容]`; }
function iso(value, fallback) { const parsed = Date.parse(asText(value)); return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString(); }
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function author(value) { return value === "user" ? "user" : value === "companion" ? "companion" : "system"; }
function roomId(room, value) { return `${room}:${asText(value)}`; }

async function safeFile(root, name) {
  const base = resolve(root); const path = resolve(join(base, name));
  if (path !== base && !path.startsWith(`${base}${sep}`)) throw new Error(`manifest 含非法路径: ${name}`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`备份成员不是常规文件: ${name}`);
  return { path, buffer: await readFile(path) };
}

async function verifiedFiles(inputDir, manifest) {
  const files = new Map();
  for (const [name, expected] of Object.entries(manifest.files || {})) {
    const { buffer } = await safeFile(inputDir, name);
    if (buffer.byteLength !== Number(expected.byte_size) || sha256(buffer) !== expected.sha256) throw new Error(`备份校验失败: ${name}`);
    files.set(name, buffer);
  }
  return files;
}

function jsonl(files, name) {
  const buffer = files.get(name); if (!buffer) return [];
  return buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`${name} 第 ${index + 1} 行不是有效 JSON`); }
  });
}

function profile(files, name, id, displayName, exportedAt) {
  const buffer = files.get(name);
  return { id, displayName, signature: "", avatarDataUrl: null, bio: buffer ? clipped(buffer.toString("utf8").trim(), 8_000) : "", voiceNotes: "", updatedAt: exportedAt };
}

export async function convertContinuityDirectory(inputDir) {
  const manifestPath = join(resolve(inputDir), "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== FORMAT || manifest.format_version !== 1) throw new Error("不是受支持的赴约连续性备份");
  const exportedAt = iso(manifest.created_at, new Date().toISOString());
  const files = await verifiedFiles(inputDir, manifest);
  const conversations = jsonl(files, "chat/conversations.jsonl").filter((row) => row.status !== "deleted").map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const candidate = asText(metadata.surface || row.mode);
    return { id: asText(row.id), title: clipped(row.title || row.summary || "导入的对话", 500), surface: allowedSurfaces.has(candidate) ? candidate : "external_import", createdAt: iso(row.started_at || row.created_at, exportedAt), updatedAt: iso(row.last_message_at || row.updated_at || row.created_at, exportedAt) };
  }).filter((row) => row.id);
  const conversationIds = new Set(conversations.map((row) => row.id));
  let skippedMessageRoles = 0;
  const messages = jsonl(files, "chat/messages.jsonl").filter((row) => {
    const keep = conversationIds.has(asText(row.conversation_id)) && ["user", "assistant"].includes(row.role) && !["hidden", "deleted"].includes(row.status) && asText(row.content).trim();
    if (!keep && !["user", "assistant"].includes(row.role)) skippedMessageRoles += 1;
    return keep;
  }).map((row) => ({
    id: asText(row.id), conversationId: asText(row.conversation_id), role: row.role === "assistant" ? "companion" : "user",
    content: clipped(row.content, 100_000), source: "external_import", sourceLabel: "私有赴约连续性备份", modelLabel: clipped(row.model_key, 200), toolTrace: [],
    attachments: [], parentMessageId: asText(row.parent_message_id) || null, isStarred: Boolean(row.is_starred), archiveState: "active", createdAt: iso(row.created_at, exportedAt),
  })).filter((row) => row.id);
  const messageIds = new Set(messages.map((row) => row.id));
  const evidence = new Map();
  for (const row of jsonl(files, "memory/evidence-links.jsonl")) {
    const memoryId = asText(row.memory_id); const messageId = asText(row.message_id);
    if (memoryId && messageIds.has(messageId)) evidence.set(memoryId, [...(evidence.get(memoryId) || []), messageId]);
  }
  const memories = jsonl(files, "memory/items.jsonl").filter((row) => row.status !== "deleted" && asText(row.content).trim()).map((row) => {
    const sourceLayer = asText(row.memory_layer); const layer = ["core", "semantic", "working"].includes(sourceLayer) ? sourceLayer : "working";
    const status = row.status === "archived" ? "archived" : row.status === "active" ? "active" : "draft";
    return { id: asText(row.id), title: clipped(row.title || row.summary || asText(row.content).slice(0, 80) || "导入记忆", 300), content: clipped(row.content, 20_000), layer, status, injectionEnabled: Boolean(row.injection_enabled && status === "active"), sourceMessageIds: evidence.get(asText(row.id)) || [], createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.updated_at || row.last_reinforced_at || row.created_at, exportedAt) };
  }).filter((row) => row.id);
  const roomEntries = [];
  const privateSource = "私有赴约连续性备份";
  for (const row of jsonl(files, "continuity/timeline-events.jsonl")) if (row.status !== "archived") roomEntries.push({ id: roomId("timeline", row.id), room: "timeline", author: author(row.created_by), title: clipped(row.title, 500), content: clipped(row.details, 100_000), subtype: "", sourceLabel: privateSource, status: "active", occurredAt: iso(row.event_at || row.created_at, exportedAt), createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.updated_at || row.created_at, exportedAt) });
  for (const row of jsonl(files, "continuity/checkins.jsonl")) roomEntries.push({ id: roomId("checkin", row.id), room: "checkin", author: author(row.sender_key), title: asText(row.kind), content: clipped(row.message, 100_000), subtype: clipped(row.kind, 120), sourceLabel: privateSource, status: "active", occurredAt: iso(row.created_at, exportedAt), createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.created_at, exportedAt) });
  for (const row of jsonl(files, "continuity/letters.jsonl")) roomEntries.push({ id: roomId("letter", row.id), room: "letter", author: author(row.sender_key), title: clipped(row.title, 500), content: clipped(row.content, 100_000), subtype: clipped(row.source, 120), sourceLabel: privateSource, status: row.status === "archived" ? "archived" : "active", occurredAt: iso(row.created_at, exportedAt), createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.created_at, exportedAt) });
  for (const row of jsonl(files, "continuity/companion-diary.jsonl")) roomEntries.push({ id: roomId("diary", row.id), room: "diary", author: "companion", title: clipped(row.title, 500), content: clipped(row.content, 100_000), subtype: "", sourceLabel: privateSource, status: "active", occurredAt: iso(row.created_at, exportedAt), createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.updated_at || row.created_at, exportedAt) });
  for (const row of jsonl(files, "work/items.jsonl")) roomEntries.push({ id: roomId("work", row.id), room: "work", author: author(row.created_by), title: clipped(row.title, 500), content: clipped(row.body, 100_000), subtype: clipped(row.item_kind, 120), sourceLabel: privateSource, status: row.status === "done" ? "done" : row.status === "archived" ? "archived" : "active", occurredAt: iso(row.due_at || row.created_at, exportedAt), createdAt: iso(row.created_at, exportedAt), updatedAt: iso(row.updated_at || row.created_at, exportedAt) });
  const output = {
    format: OUTPUT_FORMAT, schemaVersion: OUTPUT_SCHEMA, exportedAt,
    people: [profile(files, "identity/USER_PROFILE_SEED.md", "user", "我", exportedAt), profile(files, "identity/COMPANION_PROFILE.md", "companion", "伙伴", exportedAt)],
    memories, conversations, messages, roomEntries, toys: [], toyActivityEvents: [],
    settings: { id: "workspace", theme: "redleaf", mode: "light", effect: "leaf", density: 2, speed: 2, layout: "paper", pinnedRoomIds: ["schedule", "checkin", "memory", "work"], hiddenCapabilityIds: [], enabledCapabilityIds: [], updatedAt: exportedAt },
  };
  return { output, report: { conversations: conversations.length, messages: messages.length, memories: memories.length, roomEntries: roomEntries.length, skippedMessageRoles } };
}

async function main() {
  const [inputDir, outputFile] = process.argv.slice(2);
  if (!inputDir || !outputFile) throw new Error("Usage: npm run convert:private -- <decrypted-capsule-dir> <output.json>");
  const { output, report } = await convertContinuityDirectory(inputDir);
  await mkdir(dirname(resolve(outputFile)), { recursive: true });
  await writeFile(resolve(outputFile), `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: "converted", output: relative(process.cwd(), resolve(outputFile)), ...report }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
