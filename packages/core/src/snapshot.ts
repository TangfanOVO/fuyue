import {
  DATA_SCHEMA_VERSION,
  type Conversation,
  type MemoryItem,
  type Message,
  type MessageAttachment,
  type PersonProfile,
  type RoomEntry,
  type SnapshotImportSummary,
  type ToolTraceItem,
  type Toy,
  type ToyActivityEvent,
  type WorkspaceSnapshot,
  type WorkspaceSettings,
} from "./types.js";

const roles = new Set(["user", "companion"]);
const layers = new Set(["working", "semantic", "core"]);
const statuses = new Set(["draft", "active", "archived"]);
const surfaces = new Set(["local", "chatgpt_work", "codex", "relay", "external_import"]);
const sources = new Set(["local_manual", "system_seed", "chatgpt_work", "codex", "relay", "direct_provider", "external_import"]);
const roomKinds = new Set(["timeline", "letter", "checkin", "work", "diary", "repair", "whisper"]);
const roomStatuses = new Set(["active", "done", "archived"]);
const archiveStates = new Set(["active", "hidden", "deleted"]);
const themes = new Set(["redleaf", "blue", "sakura", "wisteria", "tide", "amber"]);
const modes = new Set(["light", "dark"]);
const effects = new Set(["none", "snow", "rain", "heart", "leaf", "butterfly", "star", "bubble", "glow", "paw"]);
const layouts = new Set(["paper", "client", "official"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
}
function timestamp(value: unknown): value is string {
  return text(value, 80) && !Number.isNaN(Date.parse(value));
}
function uniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}
function validToolTrace(value: unknown): value is ToolTraceItem[] {
  return Array.isArray(value) && value.length <= 50 && value.every((entry) => {
    const item = record(entry);
    return Boolean(item && text(item.name, 120) && (item.status === "success" || item.status === "failed") && text(item.summary, 500, true));
  });
}
function validPerson(value: unknown): value is PersonProfile {
  const item = record(value);
  return Boolean(item && roles.has(String(item.id)) && text(item.displayName, 80) && text(item.bio, 8_000, true)
    && text(item.signature, 500, true) && (item.avatarDataUrl === null || text(item.avatarDataUrl, 2_500_000))
    && text(item.voiceNotes, 12_000, true) && timestamp(item.updatedAt));
}
function validMemory(value: unknown): value is MemoryItem {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && text(item.title, 300) && text(item.content, 20_000)
    && layers.has(String(item.layer)) && statuses.has(String(item.status)) && typeof item.injectionEnabled === "boolean"
    && Array.isArray(item.sourceMessageIds) && item.sourceMessageIds.length <= 2_000
    && item.sourceMessageIds.every((id) => text(id, 200)) && timestamp(item.createdAt) && timestamp(item.updatedAt));
}
function validConversation(value: unknown): value is Conversation {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && text(item.title, 500) && surfaces.has(String(item.surface))
    && timestamp(item.createdAt) && timestamp(item.updatedAt));
}
function validAttachment(value: unknown): value is MessageAttachment {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && text(item.name, 500) && text(item.mediaType, 200)
    && Number.isInteger(item.byteSize) && Number(item.byteSize) >= 0 && Number(item.byteSize) <= 8_000_000
    && text(item.dataUrl, 10_700_000));
}
function validMessage(value: unknown): value is Message {
  const item = record(value);
  const attachmentsValid = Array.isArray(item?.attachments) && item.attachments.length <= 10 && item.attachments.every(validAttachment);
  return Boolean(item && text(item.id, 200) && text(item.conversationId, 200) && roles.has(String(item.role))
    && text(item.content, 100_000, true) && (String(item.content).trim().length > 0 || (Array.isArray(item.attachments) && item.attachments.length > 0))
    && sources.has(String(item.source)) && text(item.sourceLabel, 200, true)
    && text(item.modelLabel, 200, true) && validToolTrace(item.toolTrace)
    && attachmentsValid
    && (item.parentMessageId === null || text(item.parentMessageId, 200)) && typeof item.isStarred === "boolean"
    && archiveStates.has(String(item.archiveState)) && timestamp(item.createdAt));
}
function validRoomEntry(value: unknown): value is RoomEntry {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && roomKinds.has(String(item.room))
    && (roles.has(String(item.author)) || item.author === "system") && text(item.title, 500, true)
    && text(item.content, 100_000, true) && text(item.subtype, 120, true) && text(item.sourceLabel, 200) && roomStatuses.has(String(item.status))
    && timestamp(item.occurredAt) && timestamp(item.createdAt) && timestamp(item.updatedAt));
}
function validToy(value: unknown): value is Toy {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && text(item.title, 160) && text(item.html, 160_000)
    && ["user", "companion", "system"].includes(String(item.createdBy)) && text(item.sourceLabel, 200)
    && ["active", "archived"].includes(String(item.status)) && timestamp(item.createdAt) && timestamp(item.updatedAt));
}
function validToyDetails(value: unknown): value is ToyActivityEvent["details"] {
  const item = record(value);
  return Boolean(item && Object.keys(item).length <= 30 && Object.entries(item).every(([key, detail]) => text(key, 80)
    && (detail === null || typeof detail === "boolean" || (typeof detail === "number" && Number.isFinite(detail)) || text(detail, 500, true))));
}
function validToyActivityEvent(value: unknown): value is ToyActivityEvent {
  const item = record(value);
  return Boolean(item && text(item.id, 200) && text(item.toyId, 200) && text(item.sessionId, 200)
    && ["checkpoint", "score", "chat", "complete"].includes(String(item.kind)) && text(item.summary, 240)
    && validToyDetails(item.details) && timestamp(item.occurredAt));
}
function validSettings(value: unknown): value is WorkspaceSettings {
  const item = record(value);
  return Boolean(item && item.id === "workspace" && themes.has(String(item.theme)) && modes.has(String(item.mode)) && effects.has(String(item.effect))
    && Array.isArray(item.effects) && item.effects.length <= 9 && item.effects.every((effect) => effects.has(String(effect)) && effect !== "none")
    && layouts.has(String(item.layout)) && Number.isInteger(item.density) && Number(item.density) >= 1 && Number(item.density) <= 5
    && Number.isInteger(item.speed) && Number(item.speed) >= 1 && Number(item.speed) <= 5 && Array.isArray(item.pinnedRoomIds)
    && item.pinnedRoomIds.length <= 12 && item.pinnedRoomIds.every((id) => text(id, 100))
    && Array.isArray(item.hiddenCapabilityIds) && item.hiddenCapabilityIds.length <= 100 && item.hiddenCapabilityIds.every((id) => text(id, 100))
    && Array.isArray(item.enabledCapabilityIds) && item.enabledCapabilityIds.length <= 100 && item.enabledCapabilityIds.every((id) => text(id, 100))
    && timestamp(item.updatedAt));
}

function upgradeSnapshot(candidate: Record<string, unknown>): Record<string, unknown> {
  if (candidate.schemaVersion === DATA_SCHEMA_VERSION) {
    const settings = record(candidate.settings);
    const legacyTheme = String(settings?.theme || "");
    const legacyEffect = String(settings?.effect || "");
    if (settings) {
      const theme = themes.has(legacyTheme) ? legacyTheme : "redleaf";
      const mode = settings.mode === "dark" || legacyTheme === "night" ? "dark" : "light";
      const fallbackEffect = ["petal", "feather", "origami"].includes(legacyEffect) ? "leaf" : legacyEffect;
      const rawEffects = Array.isArray(settings.effects) ? settings.effects : [fallbackEffect];
      const normalizedEffects = rawEffects.includes("none") ? [] : [...new Set(rawEffects.map((value) => ["petal", "feather", "origami"].includes(String(value)) ? "leaf" : String(value)).filter((value) => effects.has(value) && value !== "none"))];
      const effect = normalizedEffects[0] ?? "none";
      return { ...candidate, toys: Array.isArray(candidate.toys) ? candidate.toys : [], toyActivityEvents: Array.isArray(candidate.toyActivityEvents) ? candidate.toyActivityEvents : [], settings: { ...settings, theme, mode, effect, effects: normalizedEffects, hiddenCapabilityIds: Array.isArray(settings.hiddenCapabilityIds) ? settings.hiddenCapabilityIds : [], enabledCapabilityIds: Array.isArray(settings.enabledCapabilityIds) ? settings.enabledCapabilityIds : [] } };
    }
  }
  if (candidate.schemaVersion === 4) {
    const settings = record(candidate.settings);
    const legacyEffect = String(settings?.effect || "leaf");
    const fallbackEffect = ["petal", "feather", "origami"].includes(legacyEffect) ? "leaf" : legacyEffect;
    const normalizedEffects = fallbackEffect === "none" ? [] : effects.has(fallbackEffect) ? [fallbackEffect] : ["leaf"];
    return { ...candidate, schemaVersion: DATA_SCHEMA_VERSION, toys: [], toyActivityEvents: [], settings: { ...settings, effect: normalizedEffects[0] ?? "none", effects: normalizedEffects, hiddenCapabilityIds: [], enabledCapabilityIds: [] } };
  }
  if (candidate.schemaVersion === 2 || candidate.schemaVersion === 3) {
    const legacy = record(candidate.settings);
    const theme = legacy?.accent === "blue" ? "blue" : legacy?.accent === "plum" ? "wisteria" : "redleaf";
    const mode = legacy?.paper === "night" ? "dark" : "light";
    const people = Array.isArray(candidate.people) ? candidate.people.map((value) => {
      const item = record(value);
      return item ? { ...item, signature: "", avatarDataUrl: null } : value;
    }) : candidate.people;
    const messages = Array.isArray(candidate.messages) ? candidate.messages.map((value) => {
      const item = record(value);
      return item ? { ...item, attachments: [], parentMessageId: null, isStarred: false, archiveState: "active" } : value;
    }) : candidate.messages;
    return { ...candidate, schemaVersion: DATA_SCHEMA_VERSION, people, messages, toys: [], toyActivityEvents: [],
      roomEntries: candidate.schemaVersion === 2 ? [] : candidate.roomEntries,
      settings: {
        id: "workspace", theme, mode, effect: "leaf", effects: ["leaf"], density: 2, speed: 2, layout: "paper",
        pinnedRoomIds: Array.isArray(legacy?.pinnedRoomIds) ? legacy.pinnedRoomIds.map((id) => id === "checkins" ? "checkin" : id) : ["schedule", "checkin", "memory", "work"],
        hiddenCapabilityIds: [], enabledCapabilityIds: [],
        updatedAt: legacy?.updatedAt || candidate.exportedAt,
      },
    };
  }
  return candidate;
}

export function parseWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  const original = record(value);
  const candidate = original ? upgradeSnapshot(original) : null;
  if (!candidate || candidate.format !== "fuyue-portable" || candidate.schemaVersion !== DATA_SCHEMA_VERSION
    || !timestamp(candidate.exportedAt) || !Array.isArray(candidate.people) || !candidate.people.every(validPerson)
    || !Array.isArray(candidate.memories) || !candidate.memories.every(validMemory)
    || !Array.isArray(candidate.conversations) || !candidate.conversations.every(validConversation)
    || !Array.isArray(candidate.messages) || !candidate.messages.every(validMessage)
    || !Array.isArray(candidate.roomEntries) || !candidate.roomEntries.every(validRoomEntry)
    || !Array.isArray(candidate.toys) || !candidate.toys.every(validToy)
    || !Array.isArray(candidate.toyActivityEvents) || !candidate.toyActivityEvents.every(validToyActivityEvent)
    || !validSettings(candidate.settings)) {
    throw new TypeError("不是受支持的 fuyue-portable 文件，或字段不完整");
  }
  const snapshot = candidate as unknown as WorkspaceSnapshot;
  if (!uniqueIds(snapshot.people) || !uniqueIds(snapshot.memories) || !uniqueIds(snapshot.conversations) || !uniqueIds(snapshot.messages) || !uniqueIds(snapshot.roomEntries) || !uniqueIds(snapshot.toys) || !uniqueIds(snapshot.toyActivityEvents)) {
    throw new TypeError("导入文件中存在重复 ID");
  }
  const conversationIds = new Set(snapshot.conversations.map((item) => item.id));
  if (snapshot.messages.some((item) => !conversationIds.has(item.conversationId))) {
    throw new TypeError("导入文件含有找不到所属对话的消息");
  }
  const messageIds = new Set(snapshot.messages.map((item) => item.id));
  if (snapshot.memories.some((item) => item.sourceMessageIds.some((id) => !messageIds.has(id)))) {
    throw new TypeError("导入文件含有找不到来源原文的记忆");
  }
  const toyIds = new Set(snapshot.toys.map((item) => item.id));
  if (snapshot.toyActivityEvents.some((item) => !toyIds.has(item.toyId))) {
    throw new TypeError("导入文件含有找不到所属玩具的游玩记录");
  }
  return snapshot;
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  try { parseWorkspaceSnapshot(value); return true; } catch { return false; }
}

export function normalizeSnapshotForImport(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const parsed = parseWorkspaceSnapshot(snapshot);
  return {
    ...parsed,
    people: parsed.people.map((item) => ({ ...item })),
    conversations: parsed.conversations.map((item) => ({ ...item })),
    messages: parsed.messages.map((item) => ({ ...item, sourceLabel: item.sourceLabel.trim() || "未标来源的导入内容", toolTrace: item.toolTrace.map((trace) => ({ ...trace })), attachments: item.attachments.map((attachment) => ({ ...attachment })) })),
    roomEntries: parsed.roomEntries.map((item) => ({ ...item })),
    toys: parsed.toys.map((item) => ({ ...item })),
    toyActivityEvents: parsed.toyActivityEvents.map((item) => ({ ...item, details: { ...item.details } })),
    settings: { ...parsed.settings, pinnedRoomIds: [...parsed.settings.pinnedRoomIds], hiddenCapabilityIds: [...parsed.settings.hiddenCapabilityIds], enabledCapabilityIds: [...parsed.settings.enabledCapabilityIds] },
    memories: parsed.memories.map((item) => ({ ...item, status: "draft", injectionEnabled: false, sourceMessageIds: [...item.sourceMessageIds] })),
  };
}

function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function compareById<T extends { id: string }>(current: T[], incoming: T[]) {
  const currentById = new Map(current.map((item) => [item.id, item]));
  let duplicates = 0; let conflicts = 0; let addable = 0;
  for (const item of incoming) {
    const existing = currentById.get(item.id);
    if (!existing) addable += 1;
    else if (same(existing, item)) duplicates += 1;
    else conflicts += 1;
  }
  return { addable, duplicates, conflicts };
}

export function previewSnapshotImport(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot): SnapshotImportSummary {
  const safeCurrent = parseWorkspaceSnapshot(current);
  const parsedIncoming = parseWorkspaceSnapshot(incoming);
  const memoriesForcedToDraft = parsedIncoming.memories.filter((item) => item.status !== "draft" || item.injectionEnabled).length;
  const safeIncoming = normalizeSnapshotForImport(parsedIncoming);
  const memories = compareById(safeCurrent.memories, safeIncoming.memories);
  const conversations = compareById(safeCurrent.conversations, safeIncoming.conversations);
  const messages = compareById(safeCurrent.messages, safeIncoming.messages);
  const roomEntries = compareById(safeCurrent.roomEntries, safeIncoming.roomEntries);
  const toys = compareById(safeCurrent.toys, safeIncoming.toys);
  const toyActivityEvents = compareById(safeCurrent.toyActivityEvents, safeIncoming.toyActivityEvents);
  const currentPeople = new Map(safeCurrent.people.map((item) => [item.id, item]));
  const replaceablePeople = safeIncoming.people.filter((item) => !same(currentPeople.get(item.id), item)).length;
  const conflictsTotal = memories.conflicts + conversations.conflicts + messages.conflicts + roomEntries.conflicts + toys.conflicts + toyActivityEvents.conflicts;
  return {
    incoming: { people: safeIncoming.people.length, memories: safeIncoming.memories.length, conversations: safeIncoming.conversations.length, messages: safeIncoming.messages.length, roomEntries: safeIncoming.roomEntries.length, toys: safeIncoming.toys.length, toyActivityEvents: safeIncoming.toyActivityEvents.length },
    addable: { memories: memories.addable, conversations: conversations.addable, messages: messages.addable, roomEntries: roomEntries.addable, toys: toys.addable, toyActivityEvents: toyActivityEvents.addable },
    skippedDuplicates: { memories: memories.duplicates, conversations: conversations.duplicates, messages: messages.duplicates, roomEntries: roomEntries.duplicates, toys: toys.duplicates, toyActivityEvents: toyActivityEvents.duplicates },
    conflicts: { memories: memories.conflicts, conversations: conversations.conflicts, messages: messages.conflicts, roomEntries: roomEntries.conflicts, toys: toys.conflicts, toyActivityEvents: toyActivityEvents.conflicts },
    replaceablePeople,
    replaceableSettings: !same(safeCurrent.settings, safeIncoming.settings),
    memoriesForcedToDraft,
    warnings: conflictsTotal ? [`${conflictsTotal} 个同 ID 不同内容的条目会保留本机版本`] : [],
  };
}

export function serializeSnapshot(snapshot: WorkspaceSnapshot): string {
  const parsed = parseWorkspaceSnapshot(snapshot);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
