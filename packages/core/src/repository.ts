import type {
  Conversation,
  ConversationSurface,
  MemoryItem,
  Message,
  NewMemoryInput,
  NewMessageInput,
  NewRoomEntryInput,
  NewToyActivityEventInput,
  NewToyInput,
  PersonProfile,
  RoomEntry,
  Toy,
  ToyActivityEvent,
  SnapshotImportOptions,
  SnapshotImportResult,
  WorkspaceSnapshot,
  WorkspaceSettings,
} from "./types.js";

export interface LocalDataRepository {
  initialize(): Promise<void>;
  listPeople(): Promise<PersonProfile[]>;
  savePerson(profile: PersonProfile): Promise<PersonProfile>;
  listMemories(): Promise<MemoryItem[]>;
  createMemory(input: NewMemoryInput): Promise<MemoryItem>;
  saveMemory(item: MemoryItem): Promise<MemoryItem>;
  deleteMemory(id: string): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  createConversation(title: string, surface?: ConversationSurface): Promise<Conversation>;
  countMessages(): Promise<number>;
  listAllMessages(): Promise<Message[]>;
  listMessages(conversationId: string): Promise<Message[]>;
  appendMessage(input: NewMessageInput): Promise<Message>;
  saveMessage(message: Message): Promise<Message>;
  listRoomEntries(room?: RoomEntry["room"]): Promise<RoomEntry[]>;
  createRoomEntry(input: NewRoomEntryInput): Promise<RoomEntry>;
  saveRoomEntry(item: RoomEntry): Promise<RoomEntry>;
  listToys(includeArchived?: boolean): Promise<Toy[]>;
  createToy(input: NewToyInput): Promise<Toy>;
  saveToy(item: Toy): Promise<Toy>;
  listToyActivityEvents(toyId?: string): Promise<ToyActivityEvent[]>;
  recordToyActivityEvent(input: NewToyActivityEventInput): Promise<ToyActivityEvent>;
  getSettings(): Promise<WorkspaceSettings>;
  saveSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings>;
  snapshot(): Promise<WorkspaceSnapshot>;
  importSnapshot(snapshot: WorkspaceSnapshot, options: SnapshotImportOptions): Promise<SnapshotImportResult>;
}
