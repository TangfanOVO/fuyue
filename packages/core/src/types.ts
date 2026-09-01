export const DATA_SCHEMA_VERSION = 5 as const;

export type PersonRole = "user" | "companion";
export type MessageRole = PersonRole;
export type MemoryLayer = "working" | "semantic" | "core";
export type MemoryStatus = "draft" | "active" | "archived";
export type MessageSource =
  | "local_manual"
  | "system_seed"
  | "chatgpt_work"
  | "codex"
  | "relay"
  | "direct_provider"
  | "external_import";
export type ConversationSurface = "local" | "chatgpt_work" | "codex" | "relay" | "external_import";
export type RoomKind = "timeline" | "letter" | "checkin" | "work" | "diary" | "repair" | "whisper";
export type RoomEntryStatus = "active" | "done" | "archived";
export type RoomEntryAuthor = PersonRole | "system";
export type ToyCreator = PersonRole | "system";
export type ToyStatus = "active" | "archived";
export type ToyEventKind = "checkpoint" | "score" | "chat" | "complete";
export type MessageArchiveState = "active" | "hidden" | "deleted";
export type ThemeName = "redleaf" | "blue" | "sakura" | "wisteria" | "tide" | "amber";
export type AppearanceMode = "light" | "dark";
export type LineEffect = "none" | "snow" | "rain" | "heart" | "leaf" | "butterfly" | "star" | "bubble" | "glow" | "paw";
export type ShellLayout = "paper" | "client" | "official";

export interface AppearanceSettings {
  theme: ThemeName;
  mode: AppearanceMode;
  effect: LineEffect;
  effects: LineEffect[];
  density: number;
  speed: number;
  layout: ShellLayout;
}

export interface ToolTraceItem {
  name: string;
  status: "success" | "failed";
  summary: string;
}

export interface PersonProfile {
  id: PersonRole;
  displayName: string;
  signature: string;
  avatarDataUrl: string | null;
  bio: string;
  voiceNotes: string;
  updatedAt: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  mediaType: string;
  byteSize: number;
  dataUrl: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  layer: MemoryLayer;
  status: MemoryStatus;
  injectionEnabled: boolean;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  surface: ConversationSurface;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  source: MessageSource;
  sourceLabel: string;
  modelLabel: string;
  toolTrace: ToolTraceItem[];
  attachments: MessageAttachment[];
  parentMessageId: string | null;
  isStarred: boolean;
  archiveState: MessageArchiveState;
  createdAt: string;
}

export interface RoomEntry {
  id: string;
  room: RoomKind;
  author: RoomEntryAuthor;
  title: string;
  content: string;
  subtype: string;
  sourceLabel: string;
  status: RoomEntryStatus;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Toy {
  id: string;
  title: string;
  html: string;
  createdBy: ToyCreator;
  sourceLabel: string;
  status: ToyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ToyActivityEvent {
  id: string;
  toyId: string;
  sessionId: string;
  kind: ToyEventKind;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

export interface WorkspaceSettings {
  id: "workspace";
  theme: ThemeName;
  mode: AppearanceMode;
  effect: LineEffect;
  effects: LineEffect[];
  density: number;
  speed: number;
  layout: ShellLayout;
  pinnedRoomIds: string[];
  hiddenCapabilityIds: string[];
  enabledCapabilityIds: string[];
  updatedAt: string;
}

export interface WorkspaceSnapshot {
  format: "fuyue-portable";
  schemaVersion: typeof DATA_SCHEMA_VERSION;
  exportedAt: string;
  people: PersonProfile[];
  memories: MemoryItem[];
  conversations: Conversation[];
  messages: Message[];
  roomEntries: RoomEntry[];
  toys: Toy[];
  toyActivityEvents: ToyActivityEvent[];
  settings: WorkspaceSettings;
}

export interface SnapshotImportSummary {
  incoming: { people: number; memories: number; conversations: number; messages: number; roomEntries: number; toys: number; toyActivityEvents: number };
  addable: { memories: number; conversations: number; messages: number; roomEntries: number; toys: number; toyActivityEvents: number };
  skippedDuplicates: { memories: number; conversations: number; messages: number; roomEntries: number; toys: number; toyActivityEvents: number };
  conflicts: { memories: number; conversations: number; messages: number; roomEntries: number; toys: number; toyActivityEvents: number };
  replaceablePeople: number;
  replaceableSettings: boolean;
  memoriesForcedToDraft: number;
  warnings: string[];
}

export interface SnapshotImportOptions {
  replacePeople: boolean;
  replaceSettings?: boolean;
}

export interface SnapshotImportResult {
  people: number;
  memories: number;
  conversations: number;
  messages: number;
  roomEntries: number;
  toys: number;
  toyActivityEvents: number;
  settings: number;
}

export interface NewMemoryInput {
  title: string;
  content: string;
  layer: MemoryLayer;
}

export interface NewMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  source?: MessageSource;
  sourceLabel?: string;
  modelLabel?: string;
  toolTrace?: ToolTraceItem[];
  attachments?: MessageAttachment[];
  parentMessageId?: string | null;
}

export interface NewRoomEntryInput {
  room: RoomKind;
  author: RoomEntryAuthor;
  title?: string;
  content: string;
  subtype?: string;
  sourceLabel?: string;
  status?: RoomEntryStatus;
  occurredAt?: string;
}

export interface NewToyInput {
  title: string;
  html: string;
  createdBy: ToyCreator;
  sourceLabel?: string;
}

export interface NewToyActivityEventInput {
  toyId: string;
  sessionId: string;
  kind: ToyEventKind;
  summary: string;
  details?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
}
