import type { Conversation, Message, PersonProfile } from "./types.js";

const now = () => new Date().toISOString();

export function createDefaultPeople(): PersonProfile[] {
  const timestamp = now();
  return [
    { id: "user", displayName: "我", signature: "", avatarDataUrl: null, bio: "", voiceNotes: "", updatedAt: timestamp },
    { id: "companion", displayName: "未命名伙伴", signature: "我在，今天也接着走。", avatarDataUrl: null, bio: "", voiceNotes: "", updatedAt: timestamp },
  ];
}

export function createDefaultConversation(): Conversation {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    title: "第一段对话",
    surface: "local",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createWelcomeMessage(conversationId: string): Message {
  return {
    id: crypto.randomUUID(),
    conversationId,
    role: "companion",
    content: "这是只存于当前浏览器的简易小手机。连接模型前，你可以先整理人物、记忆和聊天原文。",
    source: "system_seed",
    sourceLabel: "本地示例",
    modelLabel: "",
    toolTrace: [],
    attachments: [],
    parentMessageId: null,
    isStarred: false,
    archiveState: "active",
    createdAt: now(),
  };
}
