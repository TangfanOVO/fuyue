import { createDefaultConversation, createDefaultPeople, createWelcomeMessage } from "./defaults.js";
import { normalizeSnapshotForImport } from "./snapshot.js";
import type { LocalDataRepository } from "./repository.js";
import {
  DATA_SCHEMA_VERSION,
  type Conversation,
  type ConversationSurface,
  type MemoryItem,
  type Message,
  type NewMemoryInput,
  type NewMessageInput,
  type NewRoomEntryInput,
  type NewToyActivityEventInput,
  type NewToyInput,
  type PersonProfile,
  type RoomEntry,
  type Toy,
  type ToyActivityEvent,
  type SnapshotImportOptions,
  type SnapshotImportResult,
  type WorkspaceSnapshot,
  type WorkspaceSettings,
} from "./types.js";

const DATABASE_NAME = "fuyue-localdata";
const DATABASE_VERSION = 6;

type StoreName = "people" | "memories" | "conversations" | "messages" | "roomEntries" | "toys" | "toyActivityEvents" | "settings";

function defaultSettings(): WorkspaceSettings {
  return { id: "workspace", theme: "redleaf", mode: "light", effect: "leaf", effects: ["leaf"], density: 2, speed: 2, layout: "paper", pinnedRoomIds: ["schedule", "checkin", "memory", "work"], hiddenCapabilityIds: [], enabledCapabilityIds: [], updatedAt: new Date().toISOString() };
}

function normalizePerson(profile: PersonProfile): PersonProfile {
  return { ...profile, signature: profile.signature ?? "", avatarDataUrl: profile.avatarDataUrl ?? null };
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    toolTrace: message.toolTrace ?? [],
    attachments: message.attachments ?? [],
    parentMessageId: message.parentMessageId ?? null,
    isStarred: message.isStarred ?? false,
    archiveState: message.archiveState ?? "active",
  };
}

function normalizeSettings(settings: WorkspaceSettings | (Partial<WorkspaceSettings> & { paper?: string; accent?: string }) | undefined): WorkspaceSettings {
  if (!settings) return defaultSettings();
  if (settings.theme && settings.effect && settings.layout) {
    const legacyTheme = String(settings.theme);
    const theme = ["redleaf", "blue", "sakura", "wisteria", "tide", "amber"].includes(legacyTheme) ? legacyTheme : "redleaf";
    const mode = settings.mode === "dark" || legacyTheme === "night" ? "dark" : "light";
    const legacyEffect = String(settings.effect);
    const fallbackEffect = ["petal", "feather", "origami"].includes(legacyEffect) ? "leaf" : settings.effect;
    const allowedEffects = new Set(["snow", "rain", "heart", "leaf", "butterfly", "star", "bubble", "glow", "paw"]);
    const suppliedEffects = Array.isArray(settings.effects) ? settings.effects : [fallbackEffect];
    const effects = suppliedEffects.includes("none") ? [] : [...new Set(suppliedEffects.map((value) => ["petal", "feather", "origami"].includes(String(value)) ? "leaf" : String(value)).filter((value) => allowedEffects.has(value)))];
    const effect = effects[0] ?? "none";
    return { ...defaultSettings(), ...settings, theme, mode, effect, effects, hiddenCapabilityIds: Array.isArray(settings.hiddenCapabilityIds) ? settings.hiddenCapabilityIds.filter((id): id is string => typeof id === "string") : [], enabledCapabilityIds: Array.isArray(settings.enabledCapabilityIds) ? settings.enabledCapabilityIds.filter((id): id is string => typeof id === "string") : [], id: "workspace" } as WorkspaceSettings;
  }
  const legacyTheme = settings.accent === "blue" ? "blue" : settings.accent === "plum" ? "wisteria" : "redleaf";
  return { ...defaultSettings(), theme: legacyTheme, mode: settings.paper === "night" ? "dark" : "light", pinnedRoomIds: Array.isArray(settings.pinnedRoomIds) ? settings.pinnedRoomIds.map((id) => id === "checkins" ? "checkin" : id) : defaultSettings().pinnedRoomIds, updatedAt: settings.updatedAt || new Date().toISOString() };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains("people")) database.createObjectStore("people", { keyPath: "id" });
      if (!database.objectStoreNames.contains("memories")) database.createObjectStore("memories", { keyPath: "id" });
      if (!database.objectStoreNames.contains("conversations")) database.createObjectStore("conversations", { keyPath: "id" });
      if (!database.objectStoreNames.contains("messages")) {
        const messages = database.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("conversation_created", ["conversationId", "createdAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains("roomEntries")) {
        const entries = database.createObjectStore("roomEntries", { keyPath: "id" });
        entries.createIndex("room_occurred", ["room", "occurredAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains("toys")) database.createObjectStore("toys", { keyPath: "id" });
      if (!database.objectStoreNames.contains("toyActivityEvents")) {
        const events = database.createObjectStore("toyActivityEvents", { keyPath: "id" });
        events.createIndex("toy_occurred", ["toyId", "occurredAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "id" });
      if (event.oldVersion < 2) {
        const conversationStore = request.transaction?.objectStore("conversations");
        const cursorRequest = conversationStore?.openCursor();
        if (cursorRequest) cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const conversation = cursor.value as Partial<Conversation>;
          if (!conversation.surface) cursor.update({ ...conversation, surface: "local" });
          cursor.continue();
        };
      }
      if (event.oldVersion < 4) {
        const peopleStore = request.transaction?.objectStore("people");
        const peopleCursor = peopleStore?.openCursor();
        if (peopleCursor) peopleCursor.onsuccess = () => {
          const cursor = peopleCursor.result;
          if (!cursor) return;
          cursor.update(normalizePerson(cursor.value as PersonProfile));
          cursor.continue();
        };
        const messageStore = request.transaction?.objectStore("messages");
        const messageCursor = messageStore?.openCursor();
        if (messageCursor) messageCursor.onsuccess = () => {
          const cursor = messageCursor.result;
          if (!cursor) return;
          cursor.update(normalizeMessage(cursor.value as Message));
          cursor.continue();
        };
      }
      if (event.oldVersion < 5) {
        const settingsStore = request.transaction?.objectStore("settings");
        const settingsRequest = settingsStore?.get("workspace");
        if (settingsRequest) settingsRequest.onsuccess = () => settingsStore?.put(normalizeSettings(settingsRequest.result));
      }
      if (event.oldVersion < 6) {
        const settingsStore = request.transaction?.objectStore("settings");
        const settingsRequest = settingsStore?.get("workspace");
        if (settingsRequest) settingsRequest.onsuccess = () => settingsStore?.put(normalizeSettings(settingsRequest.result));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open LocalData"));
  });
}

async function allFromStore<T>(database: IDBDatabase, storeName: StoreName): Promise<T[]> {
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>;
}

export class IndexedDbRepository implements LocalDataRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async initialize(): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(["people", "conversations", "messages", "settings"], "readwrite");
    const peopleStore = transaction.objectStore("people");
    const conversationStore = transaction.objectStore("conversations");
    const messageStore = transaction.objectStore("messages");
    const settingsStore = transaction.objectStore("settings");
    const [peopleCount, conversationCount] = await Promise.all([
      requestResult(peopleStore.count()),
      requestResult(conversationStore.count()),
    ]);
    if (peopleCount === 0) createDefaultPeople().forEach((profile) => peopleStore.put(profile));
    if (!await requestResult(settingsStore.getKey("workspace"))) settingsStore.put(defaultSettings());
    if (conversationCount === 0) {
      const conversation = createDefaultConversation();
      conversationStore.put(conversation);
      messageStore.put(createWelcomeMessage(conversation.id));
    }
    await transactionDone(transaction);
  }

  async listPeople(): Promise<PersonProfile[]> {
    return (await allFromStore<PersonProfile>(await this.database(), "people")).map(normalizePerson);
  }

  async savePerson(profile: PersonProfile): Promise<PersonProfile> {
    const saved = { ...normalizePerson(profile), updatedAt: new Date().toISOString() };
    const database = await this.database();
    const transaction = database.transaction("people", "readwrite");
    transaction.objectStore("people").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async listMemories(): Promise<MemoryItem[]> {
    const items = await allFromStore<MemoryItem>(await this.database(), "memories");
    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createMemory(input: NewMemoryInput): Promise<MemoryItem> {
    const timestamp = new Date().toISOString();
    const item: MemoryItem = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      content: input.content.trim(),
      layer: input.layer,
      status: "draft",
      injectionEnabled: false,
      sourceMessageIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.saveMemory(item);
  }

  async saveMemory(item: MemoryItem): Promise<MemoryItem> {
    const saved = { ...item, updatedAt: new Date().toISOString() };
    const database = await this.database();
    const transaction = database.transaction("memories", "readwrite");
    transaction.objectStore("memories").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async deleteMemory(id: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction("memories", "readwrite");
    transaction.objectStore("memories").delete(id);
    await transactionDone(transaction);
  }

  async listConversations(): Promise<Conversation[]> {
    const items = await allFromStore<Conversation>(await this.database(), "conversations");
    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createConversation(title: string, surface: ConversationSurface = "local"): Promise<Conversation> {
    const timestamp = new Date().toISOString();
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: title.trim() || "新对话",
      surface,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const database = await this.database();
    const transaction = database.transaction("conversations", "readwrite");
    transaction.objectStore("conversations").put(conversation);
    await transactionDone(transaction);
    return conversation;
  }

  async countMessages(): Promise<number> {
    const database = await this.database();
    const transaction = database.transaction("messages", "readonly");
    return requestResult(transaction.objectStore("messages").count());
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const database = await this.database();
    const transaction = database.transaction("messages", "readonly");
    const index = transaction.objectStore("messages").index("conversation_created");
    const range = IDBKeyRange.bound([conversationId, ""], [conversationId, "\uffff"]);
    return (await requestResult(index.getAll(range)) as Message[]).map(normalizeMessage).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listAllMessages(): Promise<Message[]> {
    return (await allFromStore<Message>(await this.database(), "messages")).map(normalizeMessage).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async appendMessage(input: NewMessageInput): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content.trim(),
      source: input.source ?? "local_manual",
      sourceLabel: input.sourceLabel ?? (input.role === "companion" && (input.source ?? "local_manual") === "local_manual" ? "使用者代录" : "本地记录"),
      modelLabel: input.modelLabel ?? "",
      toolTrace: input.toolTrace ?? [],
      attachments: input.attachments ?? [],
      parentMessageId: input.parentMessageId ?? null,
      isStarred: false,
      archiveState: "active",
      createdAt: new Date().toISOString(),
    };
    const database = await this.database();
    const transaction = database.transaction(["messages", "conversations"], "readwrite");
    transaction.objectStore("messages").put(message);
    const conversationStore = transaction.objectStore("conversations");
    const conversation = await requestResult(conversationStore.get(input.conversationId)) as Conversation | undefined;
    if (conversation) conversationStore.put({ ...conversation, updatedAt: message.createdAt });
    await transactionDone(transaction);
    return message;
  }

  async saveMessage(message: Message): Promise<Message> {
    const saved = normalizeMessage(message);
    const database = await this.database();
    const transaction = database.transaction("messages", "readwrite");
    transaction.objectStore("messages").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async listRoomEntries(room?: RoomEntry["room"]): Promise<RoomEntry[]> {
    const items = await allFromStore<RoomEntry>(await this.database(), "roomEntries");
    return items.filter((item) => !room || item.room === room).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  async createRoomEntry(input: NewRoomEntryInput): Promise<RoomEntry> {
    const timestamp = new Date().toISOString();
    const item: RoomEntry = {
      id: crypto.randomUUID(), room: input.room, author: input.author,
      title: input.title?.trim() || "", content: input.content.trim(), subtype: input.subtype?.trim() || "", sourceLabel: input.sourceLabel?.trim() || (input.author === "companion" ? "使用者代录" : "本地记录"),
      status: input.status || "active", occurredAt: input.occurredAt || timestamp, createdAt: timestamp, updatedAt: timestamp,
    };
    return this.saveRoomEntry(item);
  }

  async saveRoomEntry(item: RoomEntry): Promise<RoomEntry> {
    const saved = { ...item, updatedAt: new Date().toISOString() };
    const database = await this.database();
    const transaction = database.transaction("roomEntries", "readwrite");
    transaction.objectStore("roomEntries").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async listToys(includeArchived = false): Promise<Toy[]> {
    const items = await allFromStore<Toy>(await this.database(), "toys");
    return items.filter((item) => includeArchived || item.status === "active").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async createToy(input: NewToyInput): Promise<Toy> {
    const timestamp = new Date().toISOString();
    const title = input.title.trim();
    const item: Toy = {
      id: input.createdBy === "system" ? `system.${encodeURIComponent(title)}` : crypto.randomUUID(),
      title,
      html: input.html,
      createdBy: input.createdBy,
      sourceLabel: input.sourceLabel?.trim() || (input.createdBy === "companion" ? "伙伴本机工具" : input.createdBy === "system" ? "赴约内置" : "本地导入"),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.saveToy(item);
  }

  async saveToy(item: Toy): Promise<Toy> {
    const saved = { ...item, updatedAt: new Date().toISOString() };
    const database = await this.database();
    const transaction = database.transaction("toys", "readwrite");
    transaction.objectStore("toys").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async listToyActivityEvents(toyId?: string): Promise<ToyActivityEvent[]> {
    const items = await allFromStore<ToyActivityEvent>(await this.database(), "toyActivityEvents");
    return items.filter((item) => !toyId || item.toyId === toyId).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  async recordToyActivityEvent(input: NewToyActivityEventInput): Promise<ToyActivityEvent> {
    const item: ToyActivityEvent = {
      id: crypto.randomUUID(), toyId: input.toyId, sessionId: input.sessionId, kind: input.kind,
      summary: input.summary.trim(), details: input.details || {}, occurredAt: input.occurredAt || new Date().toISOString(),
    };
    const database = await this.database();
    const transaction = database.transaction("toyActivityEvents", "readwrite");
    transaction.objectStore("toyActivityEvents").put(item);
    await transactionDone(transaction);
    return item;
  }

  async getSettings(): Promise<WorkspaceSettings> {
    const database = await this.database();
    const transaction = database.transaction("settings", "readonly");
    return normalizeSettings(await requestResult(transaction.objectStore("settings").get("workspace")) as WorkspaceSettings | undefined);
  }

  async saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
    const saved = { ...settings, id: "workspace" as const, updatedAt: new Date().toISOString() };
    const database = await this.database();
    const transaction = database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put(saved);
    await transactionDone(transaction);
    return saved;
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    const database = await this.database();
    const [people, memories, conversations, messages, roomEntries, toys, toyActivityEvents, settings] = await Promise.all([
      allFromStore<PersonProfile>(database, "people"),
      allFromStore<MemoryItem>(database, "memories"),
      allFromStore<Conversation>(database, "conversations"),
      allFromStore<Message>(database, "messages"),
      allFromStore<RoomEntry>(database, "roomEntries"),
      allFromStore<Toy>(database, "toys"),
      allFromStore<ToyActivityEvent>(database, "toyActivityEvents"),
      this.getSettings(),
    ]);
    return {
      format: "fuyue-portable",
      schemaVersion: DATA_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      people,
      memories,
      conversations,
      messages,
      roomEntries,
      toys,
      toyActivityEvents,
      settings,
    };
  }

  async importSnapshot(snapshot: WorkspaceSnapshot, options: SnapshotImportOptions): Promise<SnapshotImportResult> {
    const incoming = normalizeSnapshotForImport(snapshot);
    const database = await this.database();
    const transaction = database.transaction(["people", "memories", "conversations", "messages", "roomEntries", "toys", "toyActivityEvents", "settings"], "readwrite");
    const peopleStore = transaction.objectStore("people");
    const memoriesStore = transaction.objectStore("memories");
    const conversationsStore = transaction.objectStore("conversations");
    const messagesStore = transaction.objectStore("messages");
    const roomEntriesStore = transaction.objectStore("roomEntries");
    const toysStore = transaction.objectStore("toys");
    const toyActivityEventsStore = transaction.objectStore("toyActivityEvents");
    const settingsStore = transaction.objectStore("settings");
    const result: SnapshotImportResult = { people: 0, memories: 0, conversations: 0, messages: 0, roomEntries: 0, toys: 0, toyActivityEvents: 0, settings: 0 };

    if (options.replacePeople) {
      for (const person of incoming.people) { peopleStore.put(person); result.people += 1; }
    }
    for (const memory of incoming.memories) {
      if (!await requestResult(memoriesStore.getKey(memory.id))) { memoriesStore.add(memory); result.memories += 1; }
    }
    for (const conversation of incoming.conversations) {
      if (!await requestResult(conversationsStore.getKey(conversation.id))) { conversationsStore.add(conversation); result.conversations += 1; }
    }
    for (const message of incoming.messages) {
      if (!await requestResult(messagesStore.getKey(message.id))) { messagesStore.add(message); result.messages += 1; }
    }
    for (const item of incoming.roomEntries) {
      if (!await requestResult(roomEntriesStore.getKey(item.id))) { roomEntriesStore.add(item); result.roomEntries += 1; }
    }
    for (const toy of incoming.toys) {
      if (!await requestResult(toysStore.getKey(toy.id))) { toysStore.add(toy); result.toys += 1; }
    }
    for (const event of incoming.toyActivityEvents) {
      if (!await requestResult(toyActivityEventsStore.getKey(event.id))) { toyActivityEventsStore.add(event); result.toyActivityEvents += 1; }
    }
    if (options.replaceSettings) { settingsStore.put(incoming.settings); result.settings = 1; }
    await transactionDone(transaction);
    return result;
  }
}
