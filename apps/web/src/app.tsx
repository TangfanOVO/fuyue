import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarBlank,
  ChatsCircle,
  CheckCircle,
  ClockCounterClockwise,
  CloudArrowUp,
  CloudSlash,
  Database,
  DownloadSimple,
  FloppyDisk,
  GearSix,
  Heart,
  House,
  Moon,
  IdentificationCard,
  Link,
  ListChecks,
  MagnifyingGlass,
  Notebook,
  Palette,
  PaperPlaneTilt,
  PhoneCall,
  PlugsConnected,
  Plus,
  ShieldCheck,
  Sparkle,
  SpinnerGap,
  Stack,
  Sun,
  UploadSimple,
  WarningCircle,
  Wrench,
  X,
  List as MenuIcon,
} from "@phosphor-icons/react";
import {
  type ClipboardEvent,
  type CSSProperties,
  FormEvent,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BUILTIN_CAPABILITY_PACKS,
  GatewayError,
  IndexedDbRepository,
  RelayApiClient,
  capabilityDefinition,
  createCapabilityBuildPlan,
  localCapabilityStatus,
  parseWorkspaceSnapshot,
  previewSnapshotImport,
  serializeSnapshot,
  type CapabilityDefinition,
  type CapabilityId,
  type CapabilityInstallChoice,
  type CapabilityRuntimeMode,
  type CapabilityState,
  type CompanionGateway,
  type Conversation,
  type GatewayStatus,
  type LifeOverviewItem,
  type MemoryItem,
  type Message,
  type MessageRole,
  type MoodSnapshot,
  type PersonProfile,
  type RoomEntry,
  type RoomKind,
  type SnapshotImportResult,
  type SnapshotImportSummary,
  type Toy,
  type ToyActivityEvent,
  type WorkspaceSnapshot,
  type AppearanceSettings,
  hasVoiceGateway,
  type VoiceGateway,
} from "@fuyue/core";
import {
  AndroidNativeGateway,
  clearNativeGateway,
  configureNativeGateway,
  hasNativeGateway,
  nativeGatewayState,
  type NativeGatewayConfiguration,
  type NativeGatewayState,
} from "./native-gateway";
import {
  createNativeCalendarEvent,
  hasAndroidDeviceBridge,
  listNativeCalendars,
  nativeDeviceStatus,
  openNativeAppSettings,
  openNativeCalendarComposer,
  readNativeCalendar,
  requestNativeCalendarAccess,
  saveNativeJsonDocument,
  type NativeCalendar,
  type NativeDeviceStatus,
} from "./device-bridge";
import {
  CALENDAR_READ_SOURCES_KEY,
  readCalendarSourceIds,
  readCalendarWriteTarget,
  saveCalendarSourceIds,
  saveCalendarWriteTarget,
} from "./calendar-preferences";
import {
  AmbientLines,
  LineEffectGlyph,
  defaultAppearance,
  lineEffectRegistry,
  normalizeAppearance,
  shellRegistry,
  themeRegistry,
  toggleLineEffectSelection,
  type LineEffect,
} from "./appearance";
import { ProfileAvatar } from "./profile-avatar";
import { AvatarCropper } from "./avatar-cropper";
import { ChatView as ParityChatView, imageAttachment } from "./chat-view";
import { ArchivePanel } from "./archive-panel";
import { FuyueSplash } from "./fuyue-splash";
import { VoiceCallPanel } from "./voice-call-panel";
import { ToyboxPanel } from "./toybox-panel";
import { MemoryPanel } from "./memory-panel";
import { CobrowsePanel } from "./cobrowse-panel";
import { EngawaPanel } from "./engawa-panel";
import { JourneyPanel } from "./journey-panel";
import { StackDeck, type StackDeckItem } from "@fuyue/ui/stack-deck";

type View = "home" | "chat" | "together" | "study" | "rooms";
type Panel =
  | "memories"
  | "people"
  | "connection"
  | "data"
  | "import"
  | "appearance"
  | "about"
  | "status"
  | "modules"
  | "mood"
  | "archive"
  | "gallery"
  | "call"
  | "toys"
  | "cobrowse"
  | "engawa"
  | "journey"
  | "feature"
  | RoomKind
  | null;
type FeatureInfo = {
  capabilityId: CapabilityId;
  title: string;
  note: string;
  requirement: string;
};
const repository = new IndexedDbRepository();
const RELAY_KEY = "fuyue-public-relay-url";
const APPEARANCE_KEY = "fuyue-public-appearance";
const VIEW_KEY = "fuyue-public-view";
const TOGETHER_SEGMENT_KEY = "fuyue-public-together-segment";
const HIDDEN_CAPABILITIES_KEY = "fuyue-public-hidden-capabilities";
const ENABLED_CAPABILITIES_KEY = "fuyue-public-local-capabilities";
const roomPanelNames = new Set<RoomKind>([
  "timeline",
  "letter",
  "checkin",
  "work",
  "diary",
  "repair",
  "whisper",
]);
const fixedPanelNames = new Set([
  "memories",
  "people",
  "connection",
  "data",
  "import",
  "appearance",
  "about",
  "status",
  "modules",
  "mood",
  "archive",
  "gallery",
  "call",
  "toys",
  "cobrowse",
  "engawa",
  "journey",
  "feature",
]);
function parsePanelHash(hash: string): Exclude<Panel, null> | null {
  const value = hash.replace(/^#/, "");
  if (value.startsWith("feature-")) return "feature";
  if (value.startsWith("modules-")) return "modules";
  return fixedPanelNames.has(value) || roomPanelNames.has(value as RoomKind)
    ? (value as Exclude<Panel, null>)
    : null;
}
function parseCapabilityHash(
  hash: string,
  prefix: "feature" | "modules",
): CapabilityId | null {
  const value = decodeURIComponent(hash.replace(/^#/, ""));
  const candidate = value.startsWith(`${prefix}-`)
    ? (value.slice(prefix.length + 1) as CapabilityId)
    : null;
  return candidate && capabilityDefinition(candidate) ? candidate : null;
}

const panelCapabilityIds: Partial<Record<Exclude<Panel, null>, CapabilityId>> = {
  memories: "memory.ledger",
  gallery: "media.attachments",
  call: "call.realtime",
  toys: "leisure.toys",
  cobrowse: "media.cobrowse",
  engawa: "reading.engawa",
  journey: "travel.story_cards",
  mood: "companion.mood",
};
function capabilityForCurrentHash(hash: string): CapabilityId | null {
  const feature = parseCapabilityHash(hash, "feature");
  if (feature) return feature;
  const panel = parsePanelHash(hash);
  return panel ? panelCapabilityIds[panel] || null : null;
}

const featureCatalog: Record<string, FeatureInfo> = {
  "life.calendar": {
    capabilityId: "life.calendar",
    title: "日历与课表",
    note: "日程来源必须和模型连接分开",
    requirement:
      "Android APK 可以按需申请系统日历；PWA 使用 .ics 或自己的日历服务。",
  },
  "life.health": {
    capabilityId: "life.health",
    title: "健康与提醒",
    note: "只在使用时请求最小的数据权限",
    requirement:
      "Android 使用 Health Connect；PWA 只能导入摘要或连接使用者自己的服务。",
  },
  "companion.mood": {
    capabilityId: "companion.mood",
    title: "伙伴心情",
    note: "伙伴主动公开的短态会留在本机",
    requirement:
      "本地工具已经随包提供；也可以接入带更新时间与来源的后端心情流。",
  },
  "social.space": {
    capabilityId: "social.space",
    title: "小小空间",
    note: "动态与主动回来是独立能力",
    requirement: "需要可撤回的发布、回复、推送和频率设置。",
  },
  "reading.together": {
    capabilityId: "reading.together",
    title: "共读书房",
    note: "赴约保留轻量前端",
    requirement:
      "我们自己的使用需求很低；完整阅读能力推荐 Readest，并保留原项目许可。",
  },
  "call.realtime": {
    capabilityId: "call.realtime",
    title: "电话",
    note: "实时语音不能由模型连接页代替",
    requirement: "需要麦克风授权、STT、TTS、打断、归档和失败恢复。",
  },
  "media.listening": {
    capabilityId: "media.listening",
    title: "一起听",
    note: "赴约保留轻量前端",
    requirement:
      "我们自己的使用需求很低；完整同步房间推荐 music-together，赴约不接管网易云账号或 Cookie。",
  },
  "media.cobrowse": {
    capabilityId: "media.cobrowse",
    title: "一起看",
    note: "聊天和空间都能发公开链接",
    requirement:
      "relay 只在读到公开小红书/GitHub 标题与摘要后评论；登录墙会明确失败。",
  },
  "leisure.games": {
    capabilityId: "leisure.games",
    title: "一起游戏",
    note: "按许可证独立安装",
    requirement: "需要离线包校验、数据沙箱和退出路径。",
  },
  "leisure.toys": {
    capabilityId: "leisure.toys",
    title: "玩具盒",
    note: "房间里的本机单文件玩具",
    requirement: "已内置导入校验、无网络沙箱、LocalData 事件与可携带副本。",
  },
};
function featureFor(id: CapabilityId): FeatureInfo {
  return (
    featureCatalog[id] || {
      capabilityId: id,
      title: capabilityDefinition(id)?.label || "扩展功能",
      note: "这个能力有独立装配路径",
      requirement:
        capabilityDefinition(id)?.summary || "先选择来源和运行方式。",
    }
  );
}

function readAppearance(): AppearanceSettings {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(APPEARANCE_KEY) || "null",
    ) as Partial<AppearanceSettings> | null;
    if (value) return normalizeAppearance(value);
  } catch {
    /* Use defaults when a stale preference is invalid. */
  }
  return defaultAppearance;
}
function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间待确认"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
function compact(value: string, limit = 74) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function readView(): View {
  const value = window.localStorage.getItem(VIEW_KEY);
  return ["home", "chat", "together", "study", "rooms"].includes(value || "")
    ? (value as View)
    : "home";
}
function readTogetherSegment(): "today" | "together" | "schedule" {
  const value = window.localStorage.getItem(TOGETHER_SEGMENT_KEY);
  return value === "together" || value === "schedule" ? value : "today";
}
function readHiddenCapabilities(): CapabilityId[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(HIDDEN_CAPABILITIES_KEY) || "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value.filter(
          (item): item is CapabilityId =>
            typeof item === "string" &&
            Boolean(capabilityDefinition(item as CapabilityId)),
        )
      : [];
  } catch {
    return [];
  }
}
function writeCapabilityVisibility(id: CapabilityId, hidden: boolean) {
  const next = new Set(readHiddenCapabilities());
  if (hidden) next.add(id);
  else next.delete(id);
  window.localStorage.setItem(
    HIDDEN_CAPABILITIES_KEY,
    JSON.stringify([...next]),
  );
}

type NativeProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  models: Array<{ id: string; label: string }>;
  hints: string[];
};
const NATIVE_PROVIDER_PRESETS: NativeProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
    hints: ["deepseek", "api.deepseek.com"],
  },
  {
    id: "glm",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { id: "glm-4.5-flash", label: "GLM 4.5 Flash" },
      { id: "glm-4.5", label: "GLM 4.5" },
    ],
    hints: ["bigmodel", "zhipu", "glm"],
  },
  {
    id: "qwen",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      { id: "qwen-plus", label: "Qwen Plus" },
      { id: "qwen-max", label: "Qwen Max" },
    ],
    hints: ["dashscope", "aliyun", "qwen"],
  },
  {
    id: "kimi",
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      { id: "moonshot-v1-8k", label: "Moonshot 8K" },
      { id: "moonshot-v1-32k", label: "Moonshot 32K" },
    ],
    hints: ["moonshot", "kimi"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [{ id: "openai/gpt-4.1-mini", label: "GPT 4.1 mini · OpenRouter" }],
    hints: ["openrouter", "sk-or-v1-"],
  },
];
function presetForBaseUrl(baseUrl: string) {
  return (
    NATIVE_PROVIDER_PRESETS.find((item) => baseUrl.startsWith(item.baseUrl)) ||
    null
  );
}
function recognizeProviderPaste(value: string): {
  preset: NativeProviderPreset | null;
  apiKey: string;
  unsupported?: string;
} {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (
    /AIza[\w-]{20,}/.test(normalized) ||
    lower.includes("gemini") ||
    lower.includes("generativelanguage.googleapis.com")
  )
    return {
      preset: null,
      apiKey: "",
      unsupported:
        "这是 Gemini 凭据；Android 直连当前使用兼容接口，请在 relay / 手机服务里接 Gemini。",
    };
  if (/sk-ant-[\w-]{16,}/.test(normalized) || lower.includes("anthropic"))
    return {
      preset: null,
      apiKey: "",
      unsupported:
        "这是 Anthropic 凭据；请在 relay / 手机服务里接入，Key 不应交给通用兼容接口。",
    };
  const preset =
    NATIVE_PROVIDER_PRESETS.find((item) =>
      item.hints.some((hint) => lower.includes(hint)),
    ) || null;
  const apiKey =
    normalized.match(/(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{16,}/)?.[0] ||
    normalized
      .split(/\s+/)
      .find((part) => part.length >= 20 && !part.includes("://")) ||
    normalized;
  return { preset, apiKey };
}

export function App() {
  const [view, setView] = useState<View>(readView);
  const [panel, setPanel] = useState<Panel>(() =>
    parsePanelHash(window.location.hash),
  );
  const [togetherSegment, setTogetherSegment] = useState<
    "today" | "together" | "schedule"
  >(readTogetherSegment);
  const [appearance, setAppearance] =
    useState<AppearanceSettings>(readAppearance);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageLoadError, setMessageLoadError] = useState("");
  const [conversationRepairing, setConversationRepairing] = useState(false);
  const [conversationRepairError, setConversationRepairError] = useState("");
  const [messageCount, setMessageCount] = useState(0);
  const [roomEntries, setRoomEntries] = useState<RoomEntry[]>([]);
  const [toys, setToys] = useState<Toy[]>([]);
  const [toyActivityEvents, setToyActivityEvents] = useState<
    ToyActivityEvent[]
  >([]);
  const [settingsReady, setSettingsReady] = useState(false);
  const [relayUrl, setRelayUrl] = useState(
    () => window.localStorage.getItem(RELAY_KEY) || "",
  );
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(
    null,
  );
  const [lifeItems, setLifeItems] = useState<LifeOverviewItem[]>([]);
  const [mood, setMood] = useState<MoodSnapshot | null>(null);
  const [moodRefreshing, setMoodRefreshing] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const nativeAvailable = hasNativeGateway();
  const [nativeState, setNativeState] = useState<NativeGatewayState | null>(
    null,
  );
  const deviceAvailable = hasAndroidDeviceBridge();
  const [deviceStatus, setDeviceStatus] = useState<NativeDeviceStatus | null>(
    null,
  );
  const [nativeCalendars, setNativeCalendars] = useState<NativeCalendar[]>([]);
  const [calendarReadSourceIds, setCalendarReadSourceIds] = useState<string[]>(readCalendarSourceIds);
  const [calendarWriteTarget, setCalendarWriteTarget] = useState(readCalendarWriteTarget);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [featureInfo, setFeatureInfo] = useState<FeatureInfo>(() =>
    featureFor(
      parseCapabilityHash(window.location.hash, "feature") ||
        "reading.together",
    ),
  );
  const [moduleFocus, setModuleFocus] = useState<CapabilityId | null>(() =>
    parseCapabilityHash(window.location.hash, "modules"),
  );
  const [hiddenCapabilities, setHiddenCapabilities] = useState<CapabilityId[]>(
    readHiddenCapabilities,
  );
  const panelDepthRef = useRef(0);
  const historyViewRef = useRef(view);
  const pendingRootViewRef = useRef<View | null>(null);
  const focusBeforePanelRef = useRef<HTMLElement | null>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const nativeClient = useMemo(() => new AndroidNativeGateway(), []);
  const relayClient = useMemo<CompanionGateway | null>(() => {
    if (!relayUrl) return null;
    try {
      return new RelayApiClient(relayUrl);
    } catch {
      return null;
    }
  }, [relayUrl]);
  const nativeActive = nativeAvailable && Boolean(nativeState?.configured);
  const gateway = nativeActive ? nativeClient : relayClient;
  const voiceGateway = useMemo<VoiceGateway | null>(
    () =>
      nativeAvailable
        ? nativeClient
        : hasVoiceGateway(relayClient)
          ? relayClient
          : null,
    [nativeAvailable, nativeClient, relayClient],
  );
  const activeConversation =
    conversations.find((item) => item.surface === "local") ||
    conversations.find((item) => item.id === activeConversationId) ||
    conversations[0];
  const user = people.find((item) => item.id === "user");
  const companion = people.find((item) => item.id === "companion");
  const localMood = useMemo<MoodSnapshot | null>(() => {
    const entry = roomEntries
      .filter(
        (item) =>
          item.room === "checkin" &&
          item.author === "companion" &&
          item.subtype === "companion_mood" &&
          item.status === "active",
      )
      .sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt),
      )[0];
    return entry
      ? {
          title: entry.title || "此刻",
          detail: entry.content,
          updatedAt: entry.occurredAt,
          sourceLabel: entry.sourceLabel,
        }
      : null;
  }, [roomEntries]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await repository.initialize();
      const [
        nextPeople,
        nextMemories,
        nextConversations,
        nextMessageCount,
        nextRoomEntries,
        nextToys,
        nextToyActivityEvents,
        nextSettings,
      ] = await Promise.all([
        repository.listPeople(),
        repository.listMemories(),
        repository.listConversations(),
        repository.countMessages(),
        repository.listRoomEntries(),
        repository.listToys(),
        repository.listToyActivityEvents(),
        repository.getSettings(),
      ]);
      setPeople(nextPeople);
      setMemories(nextMemories);
      setConversations(nextConversations);
      setActiveConversationId((current) =>
        nextConversations.some((item) => item.id === current)
          ? current
          : nextConversations[0]?.id || "",
      );
      setMessageCount(nextMessageCount);
      setRoomEntries(nextRoomEntries);
      setToys(nextToys);
      setToyActivityEvents(nextToyActivityEvents);
      setHiddenCapabilities(nextSettings.hiddenCapabilityIds as CapabilityId[]);
      setAppearance(normalizeAppearance(nextSettings));
      setSettingsReady(true);
      setMessages(await repository.listAllMessages());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "LocalData 无法打开");
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshGateway = useCallback(
    async (client: CompanionGateway | null = gateway) => {
      setGatewayError("");
      const deviceLife = deviceAvailable
        ? readNativeCalendar(14, calendarReadSourceIds).catch(() => [] as LifeOverviewItem[])
        : Promise.resolve([] as LifeOverviewItem[]);
      if (!client) {
        setGatewayStatus(null);
        setLifeItems(await deviceLife);
        setMood(null);
        return;
      }
      const results = await Promise.allSettled([
        client.status(),
        client.lifeOverview(14),
        client.mood(),
      ]);
      if (results[0].status === "fulfilled") setGatewayStatus(results[0].value);
      else {
        setGatewayStatus(null);
        setLifeItems(await deviceLife);
        setMood(null);
        setGatewayError(
          results[0].reason instanceof Error
            ? results[0].reason.message
            : "relay 暂时不可用",
        );
        return;
      }
      const remoteLife =
        results[1].status === "fulfilled" && Array.isArray(results[1].value)
          ? results[1].value
          : [];
      const localLife = await deviceLife;
      const mergedLife = new Map(
        [...localLife, ...remoteLife].map((item) => [item.id, item]),
      );
      setLifeItems(
        [...mergedLife.values()].sort((left, right) =>
          left.startAt.localeCompare(right.startAt),
        ),
      );
      setMood(results[2].status === "fulfilled" ? results[2].value : null);
    },
    [calendarReadSourceIds, deviceAvailable, gateway, nativeClient],
  );
  const refreshDeviceState = useCallback(async () => {
    if (!deviceAvailable) return;
    const next = await nativeDeviceStatus();
    setDeviceStatus(next);
    if (next.calendarRead === "granted") {
      const calendars = await listNativeCalendars();
      setNativeCalendars(calendars);
      const available = new Set(calendars.map((item) => item.id));
      const storedRead = readCalendarSourceIds().filter((id) => available.has(id));
      const selectedRead = window.localStorage.getItem(CALENDAR_READ_SOURCES_KEY) === null ? calendars.map((item) => item.id) : storedRead;
      setCalendarReadSourceIds((current) => current.length === selectedRead.length && current.every((id, index) => id === selectedRead[index]) ? current : selectedRead);
      saveCalendarSourceIds(selectedRead);
      const storedWrite = readCalendarWriteTarget();
      const selectedWrite = calendars.some((item) => item.id === storedWrite && item.writable) ? storedWrite : calendars.find((item) => item.writable)?.id || "";
      setCalendarWriteTarget(selectedWrite);
      saveCalendarWriteTarget(selectedWrite);
    } else {
      setNativeCalendars([]);
    }
    await refreshGateway();
  }, [deviceAvailable, refreshGateway]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (nativeAvailable)
      void nativeGatewayState()
        .then(setNativeState)
        .catch(() =>
          setNativeState({
            configured: false,
            baseUrl: "https://api.deepseek.com",
            model: "deepseek-v4-flash",
          }),
        );
  }, [nativeAvailable]);
  useEffect(() => {
    if (deviceAvailable)
      void refreshDeviceState().catch(() =>
        setDeviceStatus({
          platform: "android",
          calendarRead: "unavailable",
          calendarWrite: "unavailable",
          health: "unavailable",
        }),
      );
  }, [deviceAvailable, refreshDeviceState]);
  useEffect(() => {
    if (!deviceAvailable) return;
    const refreshAfterNativePage = () => {
      if (document.visibilityState === "visible")
        void refreshDeviceState().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshAfterNativePage);
    window.addEventListener("focus", refreshAfterNativePage);
    return () => {
      document.removeEventListener("visibilitychange", refreshAfterNativePage);
      window.removeEventListener("focus", refreshAfterNativePage);
    };
  }, [deviceAvailable, refreshDeviceState]);
  useEffect(() => {
    void refreshGateway();
  }, [refreshGateway]);
  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);
  useEffect(() => {
    window.localStorage.setItem(TOGETHER_SEGMENT_KEY, togetherSegment);
  }, [togetherSegment]);
  useEffect(() => {
    const viewport = window.visualViewport;
    let focusFrame = 0;
    let expandedHeight = Math.max(
      window.innerHeight,
      Math.round(viewport?.height || 0),
      deviceAvailable ? Math.round(window.screen.height || 0) : 0,
    );
    const updateViewport = () => {
      const visibleHeight = Math.round(viewport?.height || window.innerHeight);
      const visibleTop = Math.round(viewport?.offsetTop || 0);
      const obscuredHeight = Math.max(
        0,
        window.innerHeight -
          visibleHeight -
          visibleTop,
      );
      const composerFocused =
        document.activeElement instanceof HTMLElement &&
        Boolean(document.activeElement.closest(".composer-zone"));
      if (!composerFocused)
        expandedHeight = Math.max(expandedHeight, visibleHeight);
      const referenceHeight = Math.max(
        expandedHeight,
        deviceAvailable ? Math.round(window.screen.height || 0) : 0,
      );
      document.documentElement.style.setProperty(
        "--app-viewport-height",
        `${visibleHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--app-viewport-top",
        `${visibleTop}px`,
      );
      setKeyboardOpen(
        composerFocused &&
          (obscuredHeight > 96 || referenceHeight - visibleHeight > 96),
      );
    };
    const updateAfterFocus = () => {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(updateViewport);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    document.addEventListener("focusin", updateAfterFocus);
    document.addEventListener("focusout", updateAfterFocus);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("focusin", updateAfterFocus);
      document.removeEventListener("focusout", updateAfterFocus);
      window.cancelAnimationFrame(focusFrame);
      document.documentElement.style.removeProperty("--app-viewport-height");
      document.documentElement.style.removeProperty("--app-viewport-top");
    };
  }, [deviceAvailable]);
  useEffect(() => {
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        appearance.mode === "dark"
          ? "#111211"
          : themeRegistry.find((item) => item.id === appearance.theme)
              ?.colors[0] || "#f2ede3",
      );
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    window.localStorage.setItem(
      HIDDEN_CAPABILITIES_KEY,
      JSON.stringify(hiddenCapabilities),
    );
    if (settingsReady)
      void repository
        .getSettings()
        .then((current) =>
          repository.saveSettings({
            ...current,
            ...appearance,
            hiddenCapabilityIds: hiddenCapabilities,
          }),
        );
  }, [appearance, hiddenCapabilities, settingsReady]);
  useEffect(() => {
    historyViewRef.current = view;
  }, [view]);
  useEffect(() => {
    if (!settingsReady || panel === "modules") return;
    const capabilityId = capabilityForCurrentHash(window.location.hash);
    if (!capabilityId || !hiddenCapabilities.includes(capabilityId)) return;
    setModuleFocus(capabilityId);
    window.history.replaceState(
      {
        fuyuePanel: "modules",
        fuyuePanelDepth: panelDepthRef.current,
        fuyueView: view,
        fuyueInternal: true,
      },
      "",
      `#modules-${capabilityId}`,
    );
    setPanel("modules");
  }, [hiddenCapabilities, panel, settingsReady, view]);
  useEffect(() => {
    const initialPanel = parsePanelHash(window.location.hash);
    const initialUrl =
      window.location.hash && !initialPanel
        ? window.location.pathname + window.location.search
        : window.location.href;
    window.history.replaceState(
      {
        ...window.history.state,
        fuyuePanelDepth: 0,
        fuyueView: historyViewRef.current,
        fuyueInternal: false,
      },
      "",
      initialUrl,
    );
    const listener = (event: PopStateEvent) => {
      const pendingRootView = pendingRootViewRef.current;
      if (pendingRootView) {
        pendingRootViewRef.current = null;
        panelDepthRef.current = 0;
        const rootUrl = window.location.pathname + window.location.search;
        window.history.replaceState(
          {
            ...window.history.state,
            fuyueOverlay: undefined,
            fuyuePanel: undefined,
            fuyuePanelDepth: 0,
            fuyueView: pendingRootView,
            fuyueInternal: false,
          },
          "",
          rootUrl,
        );
        setDrawerOpen(false);
        setPanel(null);
        setView(pendingRootView);
        window.scrollTo({ top: 0 });
        return;
      }
      if (
        event.state?.fuyueOverlay === "drawer" ||
        window.location.hash === "#menu"
      ) {
        setDrawerOpen(true);
        setPanel(null);
        return;
      }
      if (
        event.state?.fuyueOverlay === "chat-plus" ||
        window.location.hash === "#chat-tools"
      ) {
        setDrawerOpen(false);
        setPanel(null);
        return;
      }
      setDrawerOpen(false);
      if (
        ["home", "chat", "together", "study", "rooms"].includes(
          String(event.state?.fuyueView || ""),
        )
      )
        setView(event.state.fuyueView as View);
      panelDepthRef.current = Number(event.state?.fuyuePanelDepth || 0);
      const next = parsePanelHash(window.location.hash);
      const featureCapability = parseCapabilityHash(
        window.location.hash,
        "feature",
      );
      const moduleCapability = parseCapabilityHash(
        window.location.hash,
        "modules",
      );
      if (featureCapability) setFeatureInfo(featureFor(featureCapability));
      if (moduleCapability) setModuleFocus(moduleCapability);
      if (!next && window.location.hash)
        window.history.replaceState(
          { ...window.history.state, fuyuePanelDepth: 0 },
          "",
          window.location.pathname + window.location.search,
        );
      setPanel(next);
    };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (!panel) return;
    window.requestAnimationFrame(() => {
      const page = document.querySelector<HTMLElement>(".panel-page");
      page?.scrollTo({ top: 0 });
      page?.querySelector<HTMLElement>("[data-panel-back]")?.focus();
    });
  }, [panel]);
  const refreshMessages = useCallback(async () => {
    const [
      nextMessages,
      nextCount,
      nextPeople,
      nextMemories,
      nextRoomEntries,
      nextToys,
      nextToyActivityEvents,
      nextSettings,
    ] = await Promise.all([
      repository.listAllMessages(),
      repository.countMessages(),
      repository.listPeople(),
      repository.listMemories(),
      repository.listRoomEntries(),
      repository.listToys(),
      repository.listToyActivityEvents(),
      repository.getSettings(),
    ]);
    setMessages(nextMessages);
    setMessageCount(nextCount);
    setPeople(nextPeople);
    setMemories(nextMemories);
    setRoomEntries(nextRoomEntries);
    setToys(nextToys);
    setToyActivityEvents(nextToyActivityEvents);
    setAppearance(normalizeAppearance(nextSettings));
  }, []);
  const openPanel = useCallback(
    (next: Exclude<Panel, null>, hash: string = next) => {
      if (next === "modules" && hash === "modules") setModuleFocus(null);
      if (!panel)
        focusBeforePanelRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      const depth = panelDepthRef.current + 1;
      panelDepthRef.current = depth;
      const state = {
        fuyuePanel: next,
        fuyuePanelDepth: depth,
        fuyueView: view,
        fuyueInternal: true,
      };
      if (
        window.history.state?.fuyueOverlay === "drawer" ||
        window.location.hash === "#menu"
      )
        window.history.replaceState(state, "", `#${hash}`);
      else window.history.pushState(state, "", `#${hash}`);
      setPanel(next);
    },
    [panel, view],
  );
  const closePanel = useCallback(() => {
    if (panelDepthRef.current > 0) window.history.back();
    else {
      window.history.replaceState(
        { ...window.history.state, fuyuePanelDepth: 0 },
        "",
        window.location.pathname + window.location.search,
      );
      setPanel(null);
    }
  }, []);
  const chooseView = useCallback(
    (next: View) => {
      if (next === view && !panel) return;
      const panelDepth = panelDepthRef.current;
      if (panelDepth > 0) {
        // First unwind every detail entry, then replace the reached root. Merely
        // replacing the current panel leaves old detail pages behind it, so PWA
        // Back resurrects pages the user already left.
        pendingRootViewRef.current = next;
        setPanel(null);
        setView(next);
        window.history.go(-panelDepth);
        return;
      }
      panelDepthRef.current = 0;
      const url = window.location.pathname + window.location.search;
      // Bottom destinations are peers, not a stack. Replacing the root keeps
      // Android Back monotonic: detail -> current root -> home -> app exit.
      window.history.replaceState(
        {
          ...window.history.state,
          fuyueOverlay: undefined,
          fuyuePanelDepth: 0,
          fuyueView: next,
          fuyueInternal: false,
        },
        "",
        url,
      );
      setPanel(null);
      setView(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [panel, view],
  );
  const openDrawer = useCallback(() => {
    if (drawerOpen) return;
    window.history.pushState(
      { ...window.history.state, fuyueOverlay: "drawer" },
      "",
      "#menu",
    );
    setDrawerOpen(true);
  }, [drawerOpen]);
  const closeDrawer = useCallback(() => {
    if (
      window.history.state?.fuyueOverlay === "drawer" ||
      window.location.hash === "#menu"
    )
      window.history.back();
    else setDrawerOpen(false);
  }, []);
  const consumeDrawer = useCallback(() => {
    // The selected destination replaces the transient #menu entry. Removing it
    // here would leave a duplicate root entry and make Back reopen old panels.
    setDrawerOpen(false);
  }, []);
  useEffect(() => {
    window.__fuyueHandleNativeBack = () => {
      if (
        drawerOpen ||
        panel ||
        window.location.hash ||
        window.history.state?.fuyueInternal
      ) {
        window.history.back();
        return true;
      }
      if (view !== "home") {
        window.history.replaceState(
          { fuyuePanelDepth: 0, fuyueView: "home", fuyueInternal: false },
          "",
          window.location.pathname + window.location.search,
        );
        setView("home");
        return true;
      }
      return false;
    };
    return () => {
      delete window.__fuyueHandleNativeBack;
    };
  }, [drawerOpen, panel, view]);
  useEffect(() => {
    if (!panel) {
      const target = focusBeforePanelRef.current;
      focusBeforePanelRef.current = null;
      if (target?.isConnected)
        window.requestAnimationFrame(() => target.focus());
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab") return;
      const page = document.querySelector<HTMLElement>(".panel-page");
      const focusable = [
        ...(page?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) || []),
      ].filter((item) => !item.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panel, closePanel]);
  useEffect(() => {
    if (!drawerOpen) {
      if (drawerWasOpenRef.current) drawerTriggerRef.current?.focus();
      drawerWasOpenRef.current = false;
      return;
    }
    drawerWasOpenRef.current = true;
    window.requestAnimationFrame(() =>
      drawerRef.current
        ?.querySelector<HTMLElement>("[data-drawer-close]")
        ?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) || []),
      ];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);
  async function exportLocalData(): Promise<string> {
    const snapshot = await repository.snapshot();
    const fileName = `fuyue-localdata-${new Date().toISOString().slice(0, 10)}.json`;
    const content = serializeSnapshot(snapshot);
    if (hasAndroidDeviceBridge()) {
      const result = await saveNativeJsonDocument(fileName, content);
      return result.saved
        ? `已保存 ${result.fileName || fileName}`
        : "已取消保存，没有写入文件";
    }
    downloadText(fileName, content);
    return `已开始下载 ${fileName}`;
  }
  async function refreshLocalData() {
    const [
      nextPeople,
      nextMemories,
      nextConversations,
      nextMessageCount,
      nextRoomEntries,
      nextToys,
      nextToyActivityEvents,
      nextSettings,
    ] = await Promise.all([
      repository.listPeople(),
      repository.listMemories(),
      repository.listConversations(),
      repository.countMessages(),
      repository.listRoomEntries(),
      repository.listToys(),
      repository.listToyActivityEvents(),
      repository.getSettings(),
    ]);
    setPeople(nextPeople);
    setMemories(nextMemories);
    setConversations(nextConversations);
    setMessageCount(nextMessageCount);
    setRoomEntries(nextRoomEntries);
    setToys(nextToys);
    setToyActivityEvents(nextToyActivityEvents);
    setHiddenCapabilities(nextSettings.hiddenCapabilityIds as CapabilityId[]);
    setAppearance(normalizeAppearance(nextSettings));
    const nextActiveId = nextConversations.some(
      (item) => item.id === activeConversationId,
    )
      ? activeConversationId
      : nextConversations[0]?.id || "";
    setActiveConversationId(nextActiveId);
    setMessages(await repository.listAllMessages());
  }
  async function repairConversationLedger() {
    if (conversationRepairing) return;
    setConversationRepairing(true);
    setConversationRepairError("");
    try {
      const created = await repository.createConversation("我们的聊天");
      await refreshLocalData();
      setActiveConversationId(created.id);
    } catch (cause) {
      setConversationRepairError(
        cause instanceof Error ? cause.message : "本地聊天账本没有重新建立",
      );
    } finally {
      setConversationRepairing(false);
    }
  }
  async function saveRelay(nextUrl: string, accessCode = "") {
    const client = new RelayApiClient(nextUrl);
    if (accessCode) await client.exchangeAccessCode(accessCode);
    const status = await client.status();
    if (
      !status.providers.length ||
      !status.activeProviderId ||
      !status.providers.some((item) => item.id === status.activeProviderId)
    ) {
      throw new GatewayError(
        "relay 已经在线，但还没有配置可聊天的模型。DeepSeek 用户先运行 npm run setup:deepseek。",
        422,
      );
    }
    window.localStorage.setItem(RELAY_KEY, client.baseUrl);
    setRelayUrl(client.baseUrl);
    setGatewayStatus(status);
    await refreshGateway(client);
  }
  async function saveNative(configuration: NativeGatewayConfiguration) {
    const state = await configureNativeGateway(configuration);
    setNativeState(state);
  }
  async function disconnectNative() {
    await clearNativeGateway();
    setNativeState({
      configured: false,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    setGatewayStatus(null);
    setGatewayError("");
  }
  async function disconnectRelay() {
    if (relayClient instanceof RelayApiClient) {
      try {
        await relayClient.revokeSession();
      } catch {
        /* Local disconnect must still work when the relay is offline. */
      }
    }
    window.localStorage.removeItem(RELAY_KEY);
    setRelayUrl("");
    setGatewayStatus(null);
    setGatewayError("");
    setLifeItems([]);
    setMood(null);
  }
  async function refreshMoodOnly() {
    if (!gateway || moodRefreshing) return;
    setMoodRefreshing(true);
    try {
      setGatewayError("");
      setMood(await gateway.mood());
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "心情来源暂时不可用";
      setGatewayError(message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setMoodRefreshing(false);
    }
  }
  const updateCalendarReadSources = (ids: string[]) => {
    const next = [...new Set(ids)].filter((id) => nativeCalendars.some((calendar) => calendar.id === id));
    saveCalendarSourceIds(next);
    setCalendarReadSourceIds(next);
  };
  const updateCalendarWriteTarget = (id: string) => {
    const next = nativeCalendars.some((calendar) => calendar.id === id && calendar.writable) ? id : "";
    saveCalendarWriteTarget(next);
    setCalendarWriteTarget(next);
  };
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={() => void load()} />;
  const openFeature = (next: FeatureInfo) => {
    setFeatureInfo(next);
    openPanel("feature", `feature-${next.capabilityId}`);
  };
  const openModule = (capabilityId: CapabilityId) => {
    setModuleFocus(capabilityId);
    openPanel("modules", `modules-${capabilityId}`);
  };
  const openCalendarSetup = () => openFeature(featureFor("life.calendar"));
  const shared: SharedViewProps = {
    people,
    memories,
    conversations,
    messages,
    messageCount,
    roomEntries,
    companionName: companion?.displayName || "伙伴",
    userName: user?.displayName || "我",
    gateway,
    gatewayStatus,
    gatewayError,
    lifeItems,
    mood: mood || localMood,
    hiddenCapabilities,
    openPanel,
    openFeature,
    chooseView,
    openSchedule: () => {
      setTogetherSegment("schedule");
      chooseView("together");
    },
    openCalendarSetup,
  };
  return (
    <main
      className="app-shell"
      data-theme={appearance.theme}
      data-mode={appearance.mode}
      data-layout={appearance.layout}
      data-view={view}
      data-keyboard-open={keyboardOpen ? "true" : "false"}
    >
      <AmbientLines
        effects={appearance.effects}
        density={appearance.density}
        speed={appearance.speed}
        theme={`${appearance.theme}:${appearance.mode}`}
      />
      <div
        className="app-background"
        data-view={view}
        inert={panel || drawerOpen ? true : undefined}
        aria-hidden={panel || drawerOpen ? true : undefined}
      >
        <header className="topbar">
          <button
            ref={drawerTriggerRef}
            className="icon-button quiet"
            onClick={openDrawer}
            aria-label="打开全部功能"
            aria-expanded={drawerOpen}
            aria-controls="feature-drawer"
          >
            <MenuIcon />
          </button>
          <button
            className="identity identity-button"
            onClick={() => openPanel("people")}
            aria-label="查看并编辑伙伴名片"
            title={
              gatewayStatus?.ok
                ? nativeActive
                  ? "Android 直连已连接"
                  : "relay 已连接"
                : "当前使用 LocalData"
            }
          >
            <ProfileAvatar
              profile={
                companion || {
                  id: "companion",
                  displayName: "伙伴",
                  signature: "",
                  avatarDataUrl: null,
                  bio: "",
                  voiceNotes: "",
                  updatedAt: new Date().toISOString(),
                }
              }
              className="identity-avatar"
            />
            <span>
              <strong>赴约</strong>
              <small>
                <i className={gatewayStatus?.ok ? "online" : ""} />
                {companion?.signature || "点这里写一句个签"}
              </small>
            </span>
          </button>
          <button
            className="icon-button quiet"
            onClick={() => openPanel("appearance")}
            aria-label="调整外观"
          >
            <Palette />
          </button>
        </header>
        <section className="view-frame" data-view={view} key={view}>
          {view === "home" && (
            <HomeView {...shared} onExport={exportLocalData} />
          )}
          {view === "chat" &&
            (activeConversation ? (
              <ParityChatView
                repository={repository}
                conversation={activeConversation}
                messages={messages}
                people={people}
                memories={memories}
                roomEntries={roomEntries}
                calendarItems={lifeItems}
                companionName={shared.companionName}
                gateway={gatewayStatus?.ok ? gateway : null}
                gatewayStatus={gatewayStatus}
                onMessageSaved={refreshMessages}
                onRefresh={async () => { await Promise.all([refreshMessages(), refreshGateway()]); }}
                onOpenPanel={openPanel}
                onOpenFeature={(capabilityId, title, note, requirement) =>
                  openFeature({ capabilityId, title, note, requirement })
                }
              />
            ) : (
              <ChatRecovery
                repairing={conversationRepairing}
                error={conversationRepairError}
                onRepair={() => void repairConversationLedger()}
              />
            ))}
          {view === "together" && (
            <TogetherView
              {...shared}
              segment={togetherSegment}
              onSegmentChange={setTogetherSegment}
            />
          )}
          {view === "study" && (
            <StudyView
              openPanel={openPanel}
              chooseView={chooseView}
              roomEntries={roomEntries}
              hiddenCapabilities={hiddenCapabilities}
            />
          )}
          {view === "rooms" && (
            <RoomsView
              openPanel={openPanel}
              openFeature={openFeature}
              chooseView={chooseView}
              roomEntries={roomEntries}
              toyCount={toys.length}
              hiddenCapabilities={hiddenCapabilities}
              companionName={shared.companionName}
            />
          )}
        </section>
        <nav
          className="bottom-nav"
          aria-label="主要页面"
          inert={keyboardOpen ? true : undefined}
          aria-hidden={keyboardOpen ? true : undefined}
        >
          <NavButton
            active={view === "home"}
            icon={<House />}
            label="首页"
            onClick={() => chooseView("home")}
          />
          <NavButton
            active={view === "chat"}
            icon={<ChatsCircle />}
            label="聊天"
            onClick={() => chooseView("chat")}
          />
          <NavButton
            active={view === "together"}
            icon={<Heart />}
            label="一起"
            onClick={() => chooseView("together")}
          />
          <NavButton
            active={view === "study"}
            icon={<BookOpen />}
            label="书房"
            onClick={() => chooseView("study")}
          />
          <NavButton
            active={view === "rooms"}
            icon={<Stack />}
            label="房间"
            onClick={() => chooseView("rooms")}
          />
        </nav>
      </div>
      {drawerOpen && (
        <FeatureDrawer
          drawerRef={drawerRef}
          messages={messages}
          memories={memories}
          roomEntries={roomEntries}
          toyCount={toys.length}
          gatewayStatus={gatewayStatus}
          companionName={shared.companionName}
          hiddenCapabilities={hiddenCapabilities}
          onClose={closeDrawer}
          onConsume={consumeDrawer}
          chooseView={chooseView}
          openPanel={openPanel}
          openFeature={openFeature}
        />
      )}
      {panel && (
        <div
          className="panel-page"
          role="dialog"
          aria-modal="true"
          aria-labelledby="panel-title"
        >
          {panel === "memories" && (
            <MemoryPanel
              repository={repository}
              memories={memories}
              onBack={closePanel}
              onChange={async () =>
                setMemories(await repository.listMemories())
              }
              onConfigure={() => openModule("memory.ledger")}
            />
          )}
          {panel === "people" && (
            <PeoplePanel
              people={people}
              onBack={closePanel}
              onChange={async () => setPeople(await repository.listPeople())}
            />
          )}
          {panel === "archive" && (
            <ArchivePanel
              repository={repository}
              messages={messages}
              people={people}
              onBack={closePanel}
              onChange={refreshMessages}
            />
          )}
          {panel === "gallery" && (
            <GalleryPanel
              messages={messages}
              onBack={closePanel}
              onGoChat={() => chooseView("chat")}
            />
          )}
          {panel === "toys" && (
            <ToyboxPanel
              repository={repository}
              toys={toys}
              events={toyActivityEvents}
              companionName={shared.companionName}
              onBack={closePanel}
              onChange={refreshMessages}
            />
          )}
          {panel === "cobrowse" && (
            <CobrowsePanel
              repository={repository}
              entries={roomEntries}
              gateway={gatewayStatus?.ok ? gateway : null}
              companionName={shared.companionName}
              onBack={closePanel}
              onChange={async () => setRoomEntries(await repository.listRoomEntries())}
            />
          )}
          {panel === "engawa" && <EngawaPanel gateway={gatewayStatus?.ok ? gateway : null} onBack={closePanel} />}
          {panel === "journey" && (
            <JourneyPanel
              repository={repository}
              entries={roomEntries}
              onBack={closePanel}
              onChange={async () => setRoomEntries(await repository.listRoomEntries())}
            />
          )}
          {panel === "call" && activeConversation && (
            <VoiceCallPanel
              repository={repository}
              conversation={activeConversation}
              messages={messages}
              people={people}
              memories={memories}
              roomEntries={roomEntries}
              calendarItems={lifeItems}
              companionName={shared.companionName}
              chatGateway={gatewayStatus?.ok ? gateway : null}
              voiceGateway={voiceGateway}
              gatewayStatus={gatewayStatus}
              nativeAvailable={nativeAvailable}
              relayUrl={relayUrl}
              onBack={closePanel}
              onChange={refreshMessages}
              onDeviceChange={refreshDeviceState}
              onOpenConnection={() => openPanel("connection")}
            />
          )}
          {panel === "feature" && (
            <FeaturePanel
              feature={featureInfo}
              deviceAvailable={deviceAvailable}
              deviceStatus={deviceStatus}
              calendars={nativeCalendars}
              selectedCalendarIds={calendarReadSourceIds}
              writeCalendarId={calendarWriteTarget}
              onSelectedCalendarIdsChange={updateCalendarReadSources}
              onWriteCalendarIdChange={updateCalendarWriteTarget}
              onDeviceChange={refreshDeviceState}
              onBack={closePanel}
              onConfigure={() => openModule(featureInfo.capabilityId)}
              onOpenRooms={() => chooseView("rooms")}
            />
          )}
          {panel === "status" && (
            <StatusPanel
              nativeActive={nativeActive}
              relayUrl={relayUrl}
              status={gatewayStatus}
              statusError={gatewayError}
              counts={{
                messages: messageCount,
                memories: memories.length,
                roomEntries: roomEntries.length,
              }}
              onBack={closePanel}
              onOpenConnection={() => openPanel("connection")}
            />
          )}
          {panel === "modules" && (
            <ModulePanel
              status={gatewayStatus}
              deviceStatus={deviceStatus}
              focus={moduleFocus}
              hiddenCapabilities={hiddenCapabilities}
              onVisibilityChange={setHiddenCapabilities}
              onBack={closePanel}
              onPlanCreated={async () =>
                setRoomEntries(await repository.listRoomEntries())
              }
              onOpenWork={() => openPanel("work")}
            />
          )}
          {panel === "connection" && (
            <ConnectionPanel
              nativeAvailable={nativeAvailable}
              nativeState={nativeState}
              relayUrl={relayUrl}
              status={gatewayStatus}
              statusError={gatewayError}
              onBack={closePanel}
              onSave={saveRelay}
              onDisconnect={disconnectRelay}
              onSaveNative={saveNative}
              onDisconnectNative={disconnectNative}
            />
          )}
          {panel === "data" && (
            <DataPanel
              onBack={closePanel}
              onExport={exportLocalData}
              onImport={() => openPanel("import")}
              counts={{
                messages: messageCount,
                memories: memories.length,
                roomEntries: roomEntries.length,
                toys: toys.length,
              }}
            />
          )}
          {panel === "import" && (
            <ImportPanel onBack={closePanel} onImported={refreshLocalData} />
          )}
          {panel === "appearance" && (
            <AppearancePanel
              appearance={appearance}
              onChange={setAppearance}
              onBack={closePanel}
            />
          )}
          {panel === "about" && (
            <AboutPanel
              onBack={closePanel}
              onOpenConnection={() => openPanel("connection")}
            />
          )}
          {panel === "mood" && (
            <MoodPanel
              mood={shared.mood}
              companionName={shared.companionName}
              refreshing={moodRefreshing}
              canRefresh={
                gatewayStatus?.capabilities.some(
                  (item) =>
                    item.id === "companion.mood" &&
                    item.state === "ready" &&
                    item.mode !== "local",
                ) || false
              }
              onBack={closePanel}
              onRefresh={refreshMoodOnly}
              onConfigure={() => openModule("companion.mood")}
              onGoChat={() => chooseView("chat")}
            />
          )}
          {isRoomPanel(panel) && (
            <LocalRoomPanel
              room={panel}
              entries={roomEntries.filter((item) => item.room === panel)}
              companionName={shared.companionName}
              userName={shared.userName}
              onBack={closePanel}
              onChange={async () =>
                setRoomEntries(await repository.listRoomEntries())
              }
            />
          )}
        </div>
      )}
      <FuyueSplash />
    </main>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "active" : ""}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
type DrawerEntry = {
  id: string;
  title: string;
  note: string;
  icon: ReactNode;
  action: () => void;
  state?: string;
  aliases?: string;
  capabilityId?: CapabilityId;
};
function FeatureDrawer({
  drawerRef,
  messages,
  memories,
  roomEntries,
  toyCount,
  gatewayStatus,
  companionName,
  hiddenCapabilities,
  onClose,
  onConsume,
  chooseView,
  openPanel,
  openFeature,
}: {
  drawerRef: RefObject<HTMLElement | null>;
  messages: Message[];
  memories: MemoryItem[];
  roomEntries: RoomEntry[];
  toyCount: number;
  gatewayStatus: GatewayStatus | null;
  companionName: string;
  hiddenCapabilities: CapabilityId[];
  onClose: () => void;
  onConsume: () => void;
  chooseView: (view: View) => void;
  openPanel: (panel: Exclude<Panel, null>) => void;
  openFeature: (feature: FeatureInfo) => void;
}) {
  const [query, setQuery] = useState("");
  const count = (room: RoomKind) =>
    roomEntries.filter((item) => item.room === room).length;
  const photoCount = messages.reduce(
    (total, message) =>
      total +
      message.attachments.filter((item) => item.mediaType.startsWith("image/"))
        .length,
    0,
  );
  const later = (capabilityId: CapabilityId) => () =>
    openFeature(featureFor(capabilityId));
  const groups: Array<{ id: string; title: string; items: DrawerEntry[] }> = [
    {
      id: "roots",
      title: "五个大区",
      items: [
        {
          id: "home",
          title: "首页",
          note: "续接、日程与手边入口",
          icon: <House />,
          action: () => chooseView("home"),
        },
        {
          id: "chat",
          title: "聊天",
          note: `${messages.filter((item) => item.archiveState === "active").length} 句原文，同一条时间线`,
          icon: <ChatsCircle />,
          action: () => chooseView("chat"),
        },
        {
          id: "together",
          title: "一起",
          note: "今天、共同生活与课表",
          icon: <Heart />,
          action: () => chooseView("together"),
        },
        {
          id: "study",
          title: "书房",
          note: "记忆、人物、工作与接口",
          icon: <BookOpen />,
          action: () => chooseView("study"),
        },
        {
          id: "rooms",
          title: "全部房间",
          note: "按用途查找每个入口",
          icon: <Stack />,
          action: () => chooseView("rooms"),
        },
      ],
    },
    {
      id: "together-now",
      title: "一起做与玩",
      items: [
        {
          id: "call",
          title: "电话与声音",
          aliases: "电话 电话与共听",
          note: "通话、实时转写与同一份原文",
          icon: <PhoneCall />,
          state: "内置",
          action: () => openPanel("call"),
        },
        {
          id: "toys",
          capabilityId: "leisure.toys",
          title: "玩具盒",
          note: `${toyCount} 个本机玩具，可让${companionName}动手做`,
          icon: <GearSix />,
          state: "本地",
          action: () => openPanel("toys"),
        },
      ],
    },
    {
      id: "records",
      title: "身份、记忆与共同记录",
      items: [
        {
          id: "memory",
          capabilityId: "memory.ledger",
          title: "记忆库",
          note: `${memories.length} 条，可审阅、启用和删除`,
          icon: <Brain />,
          action: () => openPanel("memories"),
        },
        {
          id: "archive",
          title: "原文账本",
          note: "永久原文、来源与收藏",
          icon: <ClockCounterClockwise />,
          action: () => openPanel("archive"),
        },
        {
          id: "work",
          title: "共同工作本",
          note: `${count("work")} 条待办、决定与执行记录`,
          icon: <ListChecks />,
          action: () => openPanel("work"),
        },
        {
          id: "timeline",
          title: "我们的时间线",
          note: `${count("timeline")} 段经历与约定`,
          icon: <CalendarBlank />,
          action: () => openPanel("timeline"),
        },
        {
          id: "mood",
          capabilityId: "companion.mood",
          title: `${companionName}的心情`,
          note: "只显示 relay 明确返回的可见状态",
          icon: <Heart />,
          action: () => openPanel("mood"),
        },
        {
          id: "checkin",
          title: "碰一碰",
          note: `${count("checkin")} 条报平安和小信号`,
          icon: <Sparkle />,
          action: () => openPanel("checkin"),
        },
        {
          id: "letter",
          title: "赴约信箱",
          note: `${count("letter")} 封写给彼此的信`,
          icon: <PaperPlaneTilt />,
          action: () => openPanel("letter"),
        },
        {
          id: "gallery",
          capabilityId: "media.attachments",
          title: "本地相册",
          aliases: "我们的相册",
          note: `${photoCount} 张聊天图片，随 LocalData 迁移`,
          icon: <Sparkle />,
          action: () => openPanel("gallery"),
        },
        {
          id: "repair",
          title: "共同修补本",
          aliases: "共同修复本",
          note: `${count("repair")} 条问题、处理与复盘`,
          icon: <Wrench />,
          action: () => openPanel("repair"),
        },
        {
          id: "profiles",
          title: "我们是谁",
          note: "头像、名字、签名与说话原则",
          icon: <IdentificationCard />,
          action: () => openPanel("people"),
        },
        {
          id: "diary",
          title: "装修日记",
          aliases: "装修日记 施工记录",
          note: `${count("diary")} 篇做过什么的短记`,
          icon: <Notebook />,
          action: () => openPanel("diary"),
        },
        {
          id: "whisper",
          title: `${companionName}的碎碎念`,
          aliases: "伙伴碎碎念",
          note: `${count("whisper")} 条短句与主动表达`,
          icon: <ChatsCircle />,
          action: () => openPanel("whisper"),
        },
      ],
    },
    {
      id: "extensions",
      title: "一起做与扩展房间",
      items: [
        {
          id: "life",
          title: "生活同步",
          note: "今天、课表与真实日程",
          icon: <CalendarBlank />,
          action: () => chooseView("together"),
        },
        {
          id: "health",
          capabilityId: "life.health",
          title: "健康与提醒授权",
          note: "需要 Android / iOS 原生桥接",
          icon: <Heart />,
          state: "待接",
          action: later("life.health"),
        },
        {
          id: "space",
          capabilityId: "media.cobrowse",
          title: "小小空间",
          note: "发公开链接，等伙伴读完评论",
          icon: <Heart />,
          state: "内置",
          action: () => openPanel("cobrowse"),
        },
        {
          id: "reading",
          capabilityId: "reading.together",
          title: "共读书房",
          note: "保留赴约前端；完整能力推荐 Readest",
          icon: <BookOpen />,
          state: "前端 / 推荐",
          action: later("reading.together"),
        },
        {
          id: "engawa",
          capabilityId: "reading.engawa",
          title: "Engawa 阅读侧廊",
          note: "网页、RSS、每日阅读与书架",
          icon: <BookOpen />,
          state: "内置",
          action: () => openPanel("engawa"),
        },
        {
          id: "listening",
          capabilityId: "media.listening",
          title: "一起听",
          note: "保留赴约前端；完整能力推荐 music-together",
          icon: <Heart />,
          state: "前端 / 推荐",
          action: later("media.listening"),
        },
        {
          id: "cobrowse",
          capabilityId: "media.cobrowse",
          title: "一起看",
          note: "聊天或空间发小红书 / GitHub 链接",
          icon: <Link />,
          state: "内置",
          action: () => openPanel("cobrowse"),
        },
        {
          id: "kaomoji",
          capabilityId: "expression.kaomoji",
          title: "颜文字",
          note: "聊天加号中的本地完整抽屉",
          icon: <Sparkle />,
          state: "本地",
          action: () => chooseView("chat"),
        },
        {
          id: "game",
          capabilityId: "leisure.games",
          title: "一起游戏",
          aliases: "一起斗地主",
          note: "不捆绑私人牌桌与受限素材",
          icon: <Sparkle />,
          state: "待装",
          action: later("leisure.games"),
        },
        {
          id: "fishing",
          capabilityId: "leisure.fishing",
          title: "一起钓鱼",
          note: "非商业上游玩法，不预装",
          icon: <Sparkle />,
          state: "上游优先",
          action: later("leisure.fishing"),
        },
        {
          id: "journey-text",
          capabilityId: "travel.story_cards",
          title: "旅行手记",
          note: "Journey Cards 纯文字适配；一句话也能留",
          icon: <Notebook />,
          state: "内置",
          action: () => openPanel("journey"),
        },
        {
          id: "travel",
          capabilityId: "travel.upstream",
          title: "旅行与漫游",
          note: "可选上游适配，优先安装原项目",
          aliases: "Nowhere 旅行",
          icon: <Link />,
          state: "上游优先",
          action: later("travel.upstream"),
        },
      ],
    },
    {
      id: "system",
      title: "连接与设置",
      items: [
        {
          id: "status",
          title: "运行状态",
          note: gatewayStatus?.ok
            ? `${gatewayStatus.service} 已连接`
            : "当前为纯 LocalData 模式",
          icon: <ShieldCheck />,
          action: () => openPanel("status"),
        },
        {
          id: "connection",
          title: "模型连接",
          note: "自托管 relay 或 Android Keystore",
          icon: <PlugsConnected />,
          action: () => openPanel("connection"),
        },
        {
          id: "modules",
          title: "功能包",
          note: "核心、可选后端与上游来源",
          aliases: "模块 能力包",
          icon: <Stack />,
          action: () => openPanel("modules"),
        },
        {
          id: "appearance",
          title: "外观",
          note: "外壳、配色和环境效果",
          icon: <Palette />,
          action: () => openPanel("appearance"),
        },
        {
          id: "data",
          title: "本地副本",
          note: "导出、审阅和迁移 LocalData",
          icon: <Database />,
          action: () => openPanel("data"),
        },
        {
          id: "about",
          title: "边界与接口",
          note: "隐私承诺和后端契约",
          icon: <ShieldCheck />,
          action: () => openPanel("about"),
        },
      ],
    },
  ];
  const normalized = query.trim().toLocaleLowerCase();
  const hidden = new Set(hiddenCapabilities);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.capabilityId || !hidden.has(item.capabilityId))
        .filter(
          (item) =>
            !normalized ||
            `${item.title} ${item.aliases || ""} ${item.note}`
              .toLocaleLowerCase()
              .includes(normalized),
        ),
    }))
    .filter((group) => group.items.length);
  const activate = (action: () => void) => {
    onConsume();
    window.requestAnimationFrame(action);
  };
  return (
    <>
      <button
        className="feature-drawer-scrim"
        onClick={onClose}
        aria-label="关闭全部功能"
      />
      <aside
        ref={drawerRef}
        className="feature-drawer"
        id="feature-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-drawer-title"
      >
        <header>
          <div>
            <h1 id="feature-drawer-title">全部功能</h1>
            <p>家里的每扇门，都在这里有去向。</p>
          </div>
          <button
            data-drawer-close
            className="icon-button quiet"
            onClick={onClose}
            aria-label="关闭全部功能"
          >
            <X />
          </button>
        </header>
        <label className="drawer-search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="找功能或房间"
          />
        </label>
        <nav aria-label="全部功能索引">
          {visibleGroups.map((group) => (
            <section className="drawer-group" key={group.id}>
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <button
                  className="drawer-entry"
                  data-drawer-entry-id={item.id}
                  onClick={() => activate(item.action)}
                  key={item.id}
                >
                  <span>{item.icon}</span>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.note}</small>
                  </span>
                  {item.state ? <em>{item.state}</em> : <ArrowRight />}
                </button>
              ))}
            </section>
          ))}
          {!visibleGroups.length && (
            <p className="drawer-empty">没有找到，换个叫法试试。</p>
          )}
        </nav>
      </aside>
    </>
  );
}
function GalleryPanel({
  messages,
  onBack,
  onGoChat,
}: {
  messages: Message[];
  onBack: () => void;
  onGoChat: () => void;
}) {
  const photos = messages.flatMap((message) =>
    message.attachments
      .filter((item) => item.mediaType.startsWith("image/"))
      .map((item) => ({
        ...item,
        messageId: message.id,
        role: message.role,
        createdAt: message.createdAt,
      })),
  );
  return (
    <div className="panel-content">
      <PanelHeader
        title="本地相册"
        note="从同一份聊天原文里聚合，不建立第二份图片账本"
        onBack={onBack}
      />
      {photos.length ? (
        <section className="local-gallery">
          {photos.map((photo) => (
            <figure key={`${photo.messageId}-${photo.id}`}>
              <img src={photo.dataUrl} alt={photo.name} />
              <figcaption>
                <span>{photo.role === "user" ? "我发出的" : "伙伴留下的"}</span>
                <time>{formatTime(photo.createdAt)}</time>
              </figcaption>
            </figure>
          ))}
        </section>
      ) : (
        <EmptyBlock
          icon={<Sparkle />}
          title="相册还是空的"
          note="从聊天加号选择图片后，这里会自动出现，不会复制出第二份数据。"
          action="去聊天加一张"
          onAction={onGoChat}
        />
      )}
    </div>
  );
}
function dateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function CalendarCapabilitySetup({
  deviceAvailable,
  deviceStatus,
  calendars,
  selectedCalendarIds,
  writeCalendarId,
  onSelectedCalendarIdsChange,
  onWriteCalendarIdChange,
  onDeviceChange,
}: {
  deviceAvailable: boolean;
  deviceStatus: NativeDeviceStatus | null;
  calendars: NativeCalendar[];
  selectedCalendarIds: string[];
  writeCalendarId: string;
  onSelectedCalendarIdsChange: (ids: string[]) => void;
  onWriteCalendarIdChange: (id: string) => void;
  onDeviceChange: () => Promise<void>;
}) {
  const start = useMemo(() => {
    const date = new Date(Date.now() + 3_600_000);
    date.setMinutes(0, 0, 0);
    return dateTimeInput(date);
  }, []);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(start);
  const [endAt, setEndAt] = useState(() =>
    dateTimeInput(new Date(new Date(start).getTime() + 3_600_000)),
  );
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function request(mode: "read" | "read_write") {
    setBusy(mode);
    setError("");
    try {
      await requestNativeCalendarAccess(mode);
      await onDeviceChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "系统没有完成日历授权");
    } finally {
      setBusy("");
    }
  }
  function draft() {
    const from = new Date(startAt).getTime();
    const to = new Date(endAt).getTime();
    if (!title.trim() || Number.isNaN(from) || Number.isNaN(to) || to <= from)
      throw new Error("请填好标题和起止时间");
    return {
      title: title.trim(),
      startAt: from,
      endAt: to,
      location: "",
      notes: "从赴约添加",
      allDay,
    };
  }
  async function openSystemComposer() {
    setBusy("system");
    setError("");
    try {
      await openNativeCalendarComposer(draft());
      setSaved("已交给系统日历确认；只有你在系统页面保存后才会写入。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "没有打开系统日历");
    } finally {
      setBusy("");
    }
  }
  async function createDirect() {
    setBusy("direct");
    setError("");
    try {
      if (!writeCalendarId) throw new Error("请选择一个可写日历");
      await createNativeCalendarEvent({ ...draft(), calendarId: writeCalendarId });
      setSaved("已经写入你选择的系统日历。");
      setTitle("");
      await onDeviceChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "没有写入系统日历");
    } finally {
      setBusy("");
    }
  }
  if (!deviceAvailable)
    return (
      <section className="calendar-source-list">
        <article>
          <CalendarBlank />
          <span>
            <strong>PWA 日历来源</strong>
            <small>
              普通网页不能直接读取手机系统日历。可以接自己的 CalDAV / OAuth
              relay；.ics 导入仍在装配清单里，尚未冒充完成。
            </small>
          </span>
        </article>
      </section>
    );
  const readGranted = deviceStatus?.calendarRead === "granted";
  const writeGranted = deviceStatus?.calendarWrite === "granted";
  const readBlocked = deviceStatus?.calendarRead === "blocked";
  const writeBlocked = deviceStatus?.calendarWrite === "blocked";
  function toggleReadSource(id: string) {
    onSelectedCalendarIdsChange(
      selectedCalendarIds.includes(id)
        ? selectedCalendarIds.filter((item) => item !== id)
        : [...selectedCalendarIds, id],
    );
  }
  return (
    <>
      <section className="calendar-permission-card">
        <header>
          <CalendarBlank />
          <span>
            <strong>Android 系统日历</strong>
            <small>只在这里点授权时请求，不会在首页批量索权。</small>
          </span>
        </header>
        <div className="permission-status">
          <span>
            读取：
            {readGranted
              ? "已允许"
              : readBlocked
                ? "需到系统设置开启"
                : deviceStatus?.calendarRead === "denied"
                  ? "本次未允许"
                : "未询问"}
          </span>
          <span>
            直接写入：
            {writeGranted
              ? "已允许"
              : writeBlocked
                ? "需到系统设置开启"
                : deviceStatus?.calendarWrite === "denied"
                  ? "本次未允许"
                : "未询问"}
          </span>
        </div>
        {!readGranted && (
          <button
            className="secondary-button full-button"
            disabled={Boolean(busy)}
            onClick={() => void (readBlocked ? openNativeAppSettings() : request("read"))}
          >
            {busy === "read" ? (
              <SpinnerGap className="spin" />
            ) : (
              <CalendarBlank />
            )}
            {readBlocked ? "去系统设置开启" : "允许读取系统课表"}
          </button>
        )}
        {readGranted && (
          <div className="calendar-source-picker">
            <p className="save-message"><CheckCircle />伙伴只会读取你勾选的日历。</p>
            <div role="group" aria-label="选择允许伙伴读取的日历">
              {calendars.map((calendar) => <label key={calendar.id}><input type="checkbox" checked={selectedCalendarIds.includes(calendar.id)} onChange={() => toggleReadSource(calendar.id)} /><span><b>{calendar.name}</b>{calendar.account && <small>{calendar.account}</small>}</span></label>)}
            </div>
            {!selectedCalendarIds.length && <p className="form-hint">当前没有选任何来源：伙伴不会看到你的系统日程。</p>}
          </div>
        )}
      </section>
      <form
        className="editor-form calendar-event-form"
        onSubmit={(event) => {
          event.preventDefault();
          void openSystemComposer();
        }}
      >
        <h2>往手机日历加一项</h2>
        <label>
          标题
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </label>
        <div className="calendar-time-grid">
          <label>
            开始
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              required
            />
          </label>
          <label>
            结束
            <input
              type="datetime-local"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              required
            />
          </label>
        </div>
        <label className="calendar-all-day"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />这是全天事件</label>
        {writeGranted && calendars.some((item) => item.writable) && (
          <label>
            直接写到
            <select
              value={writeCalendarId}
              onChange={(event) => onWriteCalendarIdChange(event.target.value)}
            >
              {calendars
                .filter((item) => item.writable)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.account ? ` · ${item.account}` : ""}
                  </option>
                ))}
            </select>
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="save-message">
            <CheckCircle />
            {saved}
          </p>
        )}
        <button
          className="primary-button"
          disabled={!title.trim() || Boolean(busy)}
        >
          {busy === "system" ? (
            <SpinnerGap className="spin" />
          ) : (
            <CalendarBlank />
          )}
          打开系统确认页
        </button>
        {!writeGranted ? (
          <button
            type="button"
            className="secondary-button"
            disabled={Boolean(busy)}
            onClick={() => void (writeBlocked ? openNativeAppSettings() : request("read_write"))}
          >
            {busy === "read_write" ? (
              <SpinnerGap className="spin" />
            ) : (
              <ShieldCheck />
            )}
            {writeBlocked ? "去系统设置开启" : "允许赴约直接读写"}
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={!title.trim() || !writeCalendarId || Boolean(busy)}
            onClick={() => void createDirect()}
          >
            {busy === "direct" ? (
              <SpinnerGap className="spin" />
            ) : (
              <FloppyDisk />
            )}
            直接写入所选日历
          </button>
        )}
      </form>
    </>
  );
}
function FeaturePanel({
  feature,
  deviceAvailable,
  deviceStatus,
  calendars,
  selectedCalendarIds,
  writeCalendarId,
  onSelectedCalendarIdsChange,
  onWriteCalendarIdChange,
  onDeviceChange,
  onBack,
  onConfigure,
  onOpenRooms,
}: {
  feature: FeatureInfo;
  deviceAvailable: boolean;
  deviceStatus: NativeDeviceStatus | null;
  calendars: NativeCalendar[];
  selectedCalendarIds: string[];
  writeCalendarId: string;
  onSelectedCalendarIdsChange: (ids: string[]) => void;
  onWriteCalendarIdChange: (id: string) => void;
  onDeviceChange: () => Promise<void>;
  onBack: () => void;
  onConfigure: () => void;
  onOpenRooms: () => void;
}) {
  const capability = capabilityDefinition(feature.capabilityId);
  return (
    <div className="panel-content">
      <PanelHeader title={feature.title} note={feature.note} onBack={onBack} />
      <section className="feature-contract">
        <Sparkle />
        <h2>
          {feature.capabilityId === "life.calendar"
            ? "日历有自己的入口"
            : capability?.provenance?.recommendation === "upstream_available"
              ? "赴约前端保留，完整能力推荐原作"
            : "门在，能力还要单独装配"}
        </h2>
        <p>{feature.requirement}</p>
        <small>公开壳不会复制私人资料、受限素材或假数据来冒充已完成。</small>
      </section>
      {feature.capabilityId === "life.calendar" && (
        <CalendarCapabilitySetup
          deviceAvailable={deviceAvailable}
          deviceStatus={deviceStatus}
          calendars={calendars}
          selectedCalendarIds={selectedCalendarIds}
          writeCalendarId={writeCalendarId}
          onSelectedCalendarIdsChange={onSelectedCalendarIdsChange}
          onWriteCalendarIdChange={onWriteCalendarIdChange}
          onDeviceChange={onDeviceChange}
        />
      )}
      {feature.capabilityId === "life.health" && (
        <section className="boundary-note">
          <h2>Health Connect 尚未接入这版 APK</h2>
          <p>
            它不会跳去模型
            API。接入时会按步数、睡眠等具体类型分别解释和授权；拒绝后聊天与本地副本照常可用。
          </p>
        </section>
      )}
      {capability?.provenance && (
        <a className="secondary-button full-button" href={capability.provenance.upstreamUrl} target="_blank" rel="noreferrer">
          <Link />打开推荐原仓库 · {capability.provenance.license}
        </a>
      )}
      <button className="primary-button full-button" onClick={onConfigure}>
        <Stack />
        选择这个功能怎么装
      </button>
      <button className="secondary-button full-button" onClick={onOpenRooms}>
        <Stack />
        回全部房间
      </button>
    </div>
  );
}
function StatusPanel({
  nativeActive,
  relayUrl,
  status,
  statusError,
  counts,
  onBack,
  onOpenConnection,
}: {
  nativeActive: boolean;
  relayUrl: string;
  status: GatewayStatus | null;
  statusError: string;
  counts: { messages: number; memories: number; roomEntries: number };
  onBack: () => void;
  onOpenConnection: () => void;
}) {
  const configured = nativeActive || Boolean(relayUrl);
  const connectionLabel = status?.ok
    ? nativeActive
      ? "Android 原生直连"
      : "relay 已连接"
    : configured
      ? "连接已保存，当前不可用"
      : "纯 LocalData 模式";
  return (
    <div className="panel-content">
      <PanelHeader
        title="运行状态"
        note="只显示当前设备能够验证的事"
        onBack={onBack}
      />
      <section className={`connection-state ${status?.ok ? "connected" : ""}`}>
        {status?.ok ? <CheckCircle /> : <CloudSlash />}
        <span>
          <strong>{connectionLabel}</strong>
          <small>
            {status?.ok
              ? `${status.service} · ${status.providers.length} 个 provider`
              : statusError || "未连接模型也不影响本地记录和导出"}
          </small>
        </span>
      </section>
      <section className="data-counts" aria-label="LocalData 数量">
        <div>
          <strong>{counts.messages}</strong>
          <span>句原文</span>
        </div>
        <div>
          <strong>{counts.memories}</strong>
          <span>条记忆</span>
        </div>
        <div>
          <strong>{counts.roomEntries}</strong>
          <span>条生活记录</span>
        </div>
      </section>
      {status?.providers.length ? (
        <section className="provider-list">
          <h2>当前模型能力</h2>
          {status.providers.map((provider) => (
            <article key={provider.id}>
              <span>
                <strong>{provider.label}</strong>
                <small>{provider.capabilities.join(" · ") || "chat"}</small>
              </span>
              {provider.id === status.activeProviderId && <em>当前</em>}
            </article>
          ))}
        </section>
      ) : (
        <section className="boundary-note">
          <h2>本地数据仍然可用</h2>
          <p>
            人物、记忆、聊天原文、生活记录和外观都保存在这台设备。这里不会把“已填过地址”冒充成“服务正常”。
          </p>
        </section>
      )}
      <button className="primary-button full-button" onClick={onOpenConnection}>
        <PlugsConnected />
        {configured ? "检查或修改连接" : "去连接模型"}
      </button>
    </div>
  );
}
const capabilityModeLabels: Record<CapabilityRuntimeMode, string> = {
  local: "内置 / 本地",
  custom_backend: "自建后端",
  fuyue_service: "兼容协议服务",
  disabled: "不显示",
};
const capabilityStateLabels: Record<CapabilityState, string> = {
  ready: "已验证",
  local_only: "内置可用",
  surface_only: "前端与协议已带",
  needs_backend: "尚未实现",
  disabled: "已隐藏",
  error: "异常",
};
const installChoiceLabels: Record<
  CapabilityInstallChoice,
  { label: string; note: string }
> = {
  local: {
    label: "直接用内置实现",
    note: "赴约自研或已完成的公开适配；当场启用",
  },
  frontend_only: {
    label: "只拿前端积木",
    note: "复用外观与交互，后端由自己实现",
  },
  custom_backend: { label: "接自己的后端", note: "按公开路由契约实现并验证" },
  fuyue_service: {
    label: "接现成兼容服务",
    note: "只在有真实服务地址时使用；不冒充已开通",
  },
  upstream: {
    label: "使用原仓库",
    note: "作为来源与可替换实现，同时看清许可证",
  },
  disabled: {
    label: "不要前端，直接隐藏",
    note: "入口会从房间和全部功能消失；资料不会被删",
  },
};
function capabilityChoices(
  capability: CapabilityDefinition,
): CapabilityInstallChoice[] {
  const choices: CapabilityInstallChoice[] = [];
  if (
    capability.bundledImplementation === "ready" &&
    capability.supportedModes.includes("local")
  )
    choices.push("local");
  if (capability.frontendIncluded) choices.push("frontend_only");
  for (const mode of capability.supportedModes)
    if (mode !== "disabled" && mode !== "local" && !choices.includes(mode))
      choices.push(mode);
  if (capability.provenance) choices.push("upstream");
  if (capability.optional) choices.push("disabled");
  return choices;
}
function recommendedChoice(
  capability: CapabilityDefinition,
): CapabilityInstallChoice {
  return capability.bundledImplementation === "ready" &&
    capability.supportedModes.includes("local")
    ? "local"
    : capability.frontendIncluded
      ? "frontend_only"
      : capability.supportedModes.includes("custom_backend")
        ? "custom_backend"
        : capability.provenance
          ? "upstream"
          : capability.supportedModes.find(
              (item) => item !== "disabled" && item !== "local",
            ) || "disabled";
}
function capabilitySourceLabel(capability: CapabilityDefinition) {
  if (capability.bundledImplementation === "ready")
    return capability.provenance ? "赴约实现已带 · 原作可选" : "赴约实现已内置";
  if (capability.frontendIncluded)
    return capability.provenance ? "赴约前端已带 · 来源可选" : "赴约前端已带";
  if (capability.provenance) return "未带入运行时 · 可先用原作";
  return "开放契约 · 待带入实现";
}
function ModulePanel({
  status,
  deviceStatus,
  focus,
  hiddenCapabilities,
  onVisibilityChange,
  onBack,
  onPlanCreated,
  onOpenWork,
}: {
  status: GatewayStatus | null;
  deviceStatus: NativeDeviceStatus | null;
  focus: CapabilityId | null;
  hiddenCapabilities: CapabilityId[];
  onVisibilityChange: (value: CapabilityId[]) => void;
  onBack: () => void;
  onPlanCreated: () => Promise<void>;
  onOpenWork: () => void;
}) {
  const states = new Map(
    localCapabilityStatus().map((item) => [item.id, item]),
  );
  for (const item of status?.capabilities || []) states.set(item.id, item);
  for (const id of hiddenCapabilities)
    states.set(id, {
      id,
      mode: "disabled",
      state: "disabled",
      detail: "已按使用者选择从入口中隐藏；可在这里重新启用",
    });
  if (deviceStatus?.calendarRead === "granted")
    states.set("life.calendar", {
      id: "life.calendar",
      mode: "local",
      state: "ready",
      service: "Android Calendar Provider",
      detail:
        deviceStatus.calendarWrite === "granted"
          ? "已允许读取与直接写入系统日历"
          : "已允许读取；写入使用系统确认页",
    });
  const [selectedId, setSelectedId] = useState<CapabilityId | null>(focus);
  const selected = selectedId ? capabilityDefinition(selectedId) || null : null;
  const [choice, setChoice] = useState<CapabilityInstallChoice | null>(
    selected ? recommendedChoice(selected) : null,
  );
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState("");
  const [planError, setPlanError] = useState("");
  useEffect(() => {
    if (!focus) return;
    setSelectedId(focus);
    const capability = capabilityDefinition(focus);
    setChoice(
      capability
        ? recommendedChoice(capability)
        : null,
    );
    window.requestAnimationFrame(() =>
      document
        .querySelector(`[data-capability-id="${focus}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, [focus, hiddenCapabilities]);
  function selectCapability(capability: CapabilityDefinition) {
    setSelectedId(capability.id);
    setChoice(recommendedChoice(capability));
    setGenerated("");
    setPlanError("");
  }
  async function generatePlan() {
    if (!selected || !choice || busy) return;
    setBusy(true);
    setPlanError("");
    try {
      if (choice === "local" && selected.bundledImplementation === "ready") {
        const current = JSON.parse(
          window.localStorage.getItem(ENABLED_CAPABILITIES_KEY) || "[]",
        ) as string[];
        const enabledCapabilityIds = [...new Set([...current, selected.id])];
        window.localStorage.setItem(
          ENABLED_CAPABILITIES_KEY,
          JSON.stringify(enabledCapabilityIds),
        );
        writeCapabilityVisibility(selected.id, false);
        onVisibilityChange(readHiddenCapabilities());
        const settings = await repository.getSettings();
        await repository.saveSettings({
          ...settings,
          enabledCapabilityIds,
          hiddenCapabilityIds: settings.hiddenCapabilityIds.filter(
            (id) => id !== selected.id,
          ),
        });
        setGenerated(`local:${selected.id}`);
        return;
      }
      if (choice === "disabled" && selected.optional) {
        writeCapabilityVisibility(selected.id, true);
        onVisibilityChange(readHiddenCapabilities());
        const settings = await repository.getSettings();
        await repository.saveSettings({
          ...settings,
          hiddenCapabilityIds: [
            ...new Set([...settings.hiddenCapabilityIds, selected.id]),
          ],
        });
        setGenerated(`hidden:${selected.id}`);
        return;
      }
      if (choice === "upstream" && selected.provenance) {
        writeCapabilityVisibility(selected.id, false);
        onVisibilityChange(readHiddenCapabilities());
        const settings = await repository.getSettings();
        await repository.saveSettings({
          ...settings,
          hiddenCapabilityIds: settings.hiddenCapabilityIds.filter(
            (id) => id !== selected.id,
          ),
        });
        window.open(
          selected.provenance.upstreamUrl,
          "_blank",
          "noopener,noreferrer",
        );
        setGenerated(`upstream:${selected.provenance.upstreamUrl}`);
        return;
      }
      writeCapabilityVisibility(selected.id, false);
      onVisibilityChange(readHiddenCapabilities());
      {
        const settings = await repository.getSettings();
        await repository.saveSettings({
          ...settings,
          hiddenCapabilityIds: settings.hiddenCapabilityIds.filter(
            (id) => id !== selected.id,
          ),
        });
      }
      const plan = createCapabilityBuildPlan(selected.id, choice);
      const lines = [
        `装配方式：${installChoiceLabels[choice].label}`,
        `建议路径：${plan.targetPath}`,
        plan.upstream
          ? `参考来源：${plan.upstream.url}（${plan.upstream.license}）`
          : "参考来源：赴约公开能力契约",
        plan.requiredRoutes.length
          ? `必须接口：${plan.requiredRoutes.join("、")}`
          : "必须接口：无",
        `验收：${plan.verificationChecklist.join("；")}`,
      ];
      await repository.createRoomEntry({
        room: "work",
        author: "user",
        title: `装配 ${selected.label}`,
        content: lines.join("\n"),
        subtype: "capability_plan",
        sourceLabel: "功能包装配单",
      });
      downloadText(
        `fuyue-build-plan-${selected.id.replaceAll(".", "-")}.json`,
        `${JSON.stringify(plan, null, 2)}\n`,
      );
      setGenerated(plan.targetPath);
      await onPlanCreated();
    } catch (cause) {
      setPlanError(cause instanceof Error ? cause.message : "没有生成装配单");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-content module-panel">
      <PanelHeader
        title="功能包"
        note="整家带走，也可只拿一个房间或一块前端"
        onBack={onBack}
      />
      <section className="module-principle">
        <Stack />
        <div>
          <h2>赴约的实现，默认就在家里</h2>
          <p>
            只要许可允许且已经通过公开版验收，就随一键部署直接提供。原仓库是来源和替代选择，不会把我们已经做好的功能挤掉。
          </p>
        </div>
      </section>
      <section
        className="frontend-bricks"
        aria-labelledby="frontend-bricks-title"
      >
        <header>
          <div>
            <h2 id="frontend-bricks-title">只拿喜欢的前端</h2>
            <p>环境效果、交互动效、叠叠卡和记忆账本可分别引入。</p>
          </div>
          <em>可拆</em>
        </header>
        <div>
          <code>@fuyue/ui/ambient</code>
          <code>@fuyue/ui/motion</code>
          <code>@fuyue/ui/stack-deck</code>
          <code>@fuyue/ui/memory</code>
        </div>
      </section>
      <section className="module-list" aria-label="功能包与当前状态">
        {BUILTIN_CAPABILITY_PACKS.map((pack) => {
          const packStates = pack.capabilities.map((capability) =>
            states.get(capability.id),
          );
          const readyCount = packStates.filter(
            (item) => item?.state === "ready" || item?.state === "local_only",
          ).length;
          const surfaceCount = packStates.filter(
            (item) => item?.state === "surface_only",
          ).length;
          const allAvailable = readyCount === pack.capabilities.length;
          const packState = allAvailable
            ? "ready"
            : readyCount > 0 || surfaceCount > 0
              ? "partial"
              : "optional";
          const packLabel = allAvailable
            ? "整包已内置"
            : readyCount > 0
              ? `${readyCount} 项已内置`
              : surfaceCount > 0
                ? `${surfaceCount} 项前端已带`
                : "外部扩展";
          const provenances = pack.capabilities.flatMap((item) =>
            item.provenance ? [{ label: item.label, ...item.provenance }] : [],
          );
          return (
            <article className="module-pack" key={pack.id}>
              <header>
                <span>
                  <small>
                    {pack.capabilities.every((item) => item.optional)
                      ? "可选功能包"
                      : "核心功能包"}
                  </small>
                  <h2>{pack.label}</h2>
                </span>
                <em data-state={packState}>{packLabel}</em>
              </header>
              <div className="module-capabilities">
                {pack.capabilities.map((capability) => {
                  const state = states.get(capability.id);
                  const actionLabel = hiddenCapabilities.includes(capability.id)
                    ? "恢复显示或换实现"
                    : capability.bundledImplementation === "ready"
                      ? "已内置 · 管理"
                      : capability.frontendIncluded
                        ? "前端已带 · 选后端"
                        : "选择实现";
                  return (
                    <section
                      key={capability.id}
                      data-capability-id={capability.id}
                      className={
                        selectedId === capability.id
                          ? "capability-selected"
                          : ""
                      }
                    >
                      <div>
                        <strong>{capability.label}</strong>
                        <span>{capabilitySourceLabel(capability)}</span>
                      </div>
                      <p>{capability.summary}</p>
                      <footer>
                        <em data-state={state?.state || "disabled"}>
                          {capabilityStateLabels[state?.state || "disabled"]}
                        </em>
                        {capability.supportedModes
                          .filter((mode) => mode !== "disabled")
                          .map((mode) => (
                            <small key={mode}>
                              {capabilityModeLabels[mode]}
                            </small>
                          ))}
                      </footer>
                      {state?.detail && (
                        <small className="capability-detail">
                          {state.detail}
                        </small>
                      )}
                      {capability.optional && (
                        <button
                          className="secondary-button compact-button"
                          onClick={() => selectCapability(capability)}
                        >
                          {actionLabel}
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
              {provenances.length > 0 && (
                <aside className="upstream-first">
                  <Link />
                  <div>
                    <strong>来源与原作</strong>
                    <p>
                      赴约已带的实现默认可用；这些链接用于归因、查看许可证，或者改用原作。
                    </p>
                    {provenances.map((provenance) => (
                      <a
                        href={provenance.upstreamUrl}
                        target="_blank"
                        rel="noreferrer"
                        key={provenance.upstreamUrl}
                      >
                        {provenance.label} · {provenance.license}
                        <ArrowRight />
                      </a>
                    ))}
                  </div>
                </aside>
              )}
            </article>
          );
        })}
      </section>
      {selected && (
        <section className="capability-planner" aria-live="polite">
          <header>
            <span>
              <small>正在选实现</small>
              <h2>{selected.label}</h2>
            </span>
            <button
              className="icon-button quiet"
              aria-label="关闭装配选择"
              onClick={() => {
                setSelectedId(null);
                setChoice(null);
              }}
            >
              <X />
            </button>
          </header>
          <p>
            {choice === "local"
              ? "这个功能已随安装包提供；确认后原地启用，不下载、不建重复待办。"
              : choice === "upstream"
                ? "这会打开原作者仓库，赴约不会把魔改适配冒充成原作。"
                : choice === "disabled"
                  ? "只隐藏普通入口，不删除现有资料；以后从功能包里就能恢复。"
                  : "只有需要自己接代码或服务的方式，才会生成可审阅装配单和工作本路径。"}
          </p>
          <div className="capability-choice-grid">
            {capabilityChoices(selected).map((item) => (
              <button
                aria-pressed={choice === item}
                className={choice === item ? "active" : ""}
                key={item}
                onClick={() => {
                  setChoice(item);
                  setGenerated("");
                }}
              >
                <strong>{installChoiceLabels[item].label}</strong>
                <small>{installChoiceLabels[item].note}</small>
              </button>
            ))}
          </div>
          {selected.provenance && (
            <a
              className="upstream-plan-link"
              href={selected.provenance.upstreamUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Link />
              原仓库 · {selected.provenance.license}
              <ArrowRight />
            </a>
          )}
          {planError && (
            <p className="form-error" role="alert">
              {planError}
            </p>
          )}
          {generated && (
            <section className="import-success">
              <CheckCircle />
              <span>
                <strong>
                  {generated.startsWith("local:")
                    ? "内置实现已启用"
                    : generated.startsWith("hidden:")
                      ? "功能入口已隐藏"
                      : generated.startsWith("upstream:")
                        ? "已经打开原仓库"
                        : "装配单已生成"}
                </strong>
                <small>
                  {generated.startsWith("local:")
                    ? "功能现在直接使用当前设备，不需要工作本待办。"
                    : generated.startsWith("hidden:")
                      ? "房间和全部功能不再显示它；原资料仍保留。"
                      : generated.startsWith("upstream:")
                        ? "来源页不会写入工作本；是否安装由你在原仓库决定。"
                        : `建议路径 ${generated}；同一条待办已写入共同工作本。`}
                </small>
              </span>
            </section>
          )}
          <button
            className="primary-button full-button"
            disabled={!choice || busy}
            onClick={() => void generatePlan()}
          >
            {busy ? (
              <SpinnerGap className="spin" />
            ) : choice === "local" ? (
              <CheckCircle />
            ) : choice === "upstream" ? (
              <Link />
            ) : choice === "disabled" ? (
              <X />
            ) : (
              <DownloadSimple />
            )}
            {busy
              ? "正在处理"
              : choice === "local"
                ? "立即启用内置实现"
                : choice === "upstream"
                  ? "打开原仓库"
                  : choice === "disabled"
                    ? "隐藏这个功能"
                    : "生成装配单并写入工作本"}
          </button>
          {generated &&
            !generated.startsWith("local:") &&
            !generated.startsWith("hidden:") &&
            !generated.startsWith("upstream:") && (
              <button
                className="secondary-button full-button"
                onClick={onOpenWork}
              >
                <ListChecks />
                查看共同工作本
              </button>
            )}
        </section>
      )}
    </div>
  );
}
function LoadingScreen() {
  return (
    <main className="state-screen" aria-busy="true">
      <div className="skeleton-title" />
      <div className="skeleton-block" />
      <div className="skeleton-block short" />
    </main>
  );
}
function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="state-screen">
      <Database size={36} />
      <h1>LocalData 没有打开</h1>
      <p>{message}</p>
      <p>
        请先退出无痕 / 隐私浏览，检查本站的存储权限和剩余空间。如果曾下载过
        fuyue-portable JSON，它仍在你选择的文件位置，不会被这次打开失败删除。
      </p>
      <button className="primary-button" onClick={onRetry}>
        检查后重试
      </button>
    </main>
  );
}
function ChatRecovery({
  repairing,
  error,
  onRepair,
}: {
  repairing: boolean;
  error: string;
  onRepair: () => void;
}) {
  return (
    <div className="chat-recovery page-enter" role="status">
      <ChatsCircle />
      <h1>聊天账本还没有准备好</h1>
      <p>
        其他房间仍然可用。重新建立入口只会补一份空白对话，不会删除已有原文。
      </p>
      {error && <small>{error}</small>}
      <button
        className="primary-button"
        disabled={repairing}
        onClick={onRepair}
      >
        {repairing ? (
          <>
            <SpinnerGap className="spin" />
            正在整理
          </>
        ) : (
          "重新建立聊天入口"
        )}
      </button>
    </div>
  );
}

type SharedViewProps = {
  people: PersonProfile[];
  memories: MemoryItem[];
  conversations: Conversation[];
  messages: Message[];
  messageCount: number;
  roomEntries: RoomEntry[];
  companionName: string;
  userName: string;
  gateway: CompanionGateway | null;
  gatewayStatus: GatewayStatus | null;
  gatewayError: string;
  lifeItems: LifeOverviewItem[];
  mood: MoodSnapshot | null;
  hiddenCapabilities: CapabilityId[];
  openPanel: (panel: Exclude<Panel, null>) => void;
  openFeature: (feature: FeatureInfo) => void;
  chooseView: (view: View) => void;
  openSchedule: () => void;
  openCalendarSetup: () => void;
};

function HomeView(
  props: SharedViewProps & { onExport: () => Promise<string> },
) {
  const nextItem =
    props.lifeItems.find(
      (item) => new Date(item.startAt).getTime() >= Date.now(),
    ) || props.lifeItems[0];
  const enabled = props.memories.filter((item) => item.injectionEnabled).length;
  const hidden = new Set(props.hiddenCapabilities);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [exportError, setExportError] = useState("");
  async function exportNow() {
    setExporting(true);
    setExportNotice("");
    setExportError("");
    try {
      setExportNotice(await props.onExport());
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "副本没有保存");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="home-view page-enter">
      <button
        className="presence-card pressable"
        onClick={() => props.chooseView("chat")}
      >
        <span className="presence-mark">
          <Sparkle />
        </span>
        <span>
          <small>回到 {props.companionName} 身边</small>
          <strong>我在，今天也接着走。</strong>
          <em>同一份身份、记忆和聊天账本。</em>
        </span>
        <ArrowRight />
      </button>
      <section className="home-section">
        <header>
          <div>
            <h1>继续上次</h1>
            <p>只保留一条最自然的续接。</p>
          </div>
        </header>
        <button
          className="resume-card pressable"
          onClick={() => props.openPanel("call")}
        >
          <PhoneCall />
          <span>
            <small>电话与声音</small>
            <strong>回到我们的声音房间</strong>
            <em>通话、实时转写和原文都留在同一份赴约里</em>
          </span>
          <ArrowRight />
        </button>
      </section>
      <section className="today-strip">
        <div className="date-block">
          <small>
            {new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(
              new Date(),
            )}
          </small>
          <strong>{new Date().getDate()}</strong>
          <span>
            {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
              new Date(),
            )}
          </span>
        </div>
        <div className="next-block">
          <header>
            <strong>今天与下一项</strong>
            <span>{nextItem ? "已读取" : "未选择来源"}</span>
          </header>
          {nextItem ? (
            <>
              <b>
                {formatTime(nextItem.startAt)} · {nextItem.title}
              </b>
              <small>{nextItem.location || nextItem.kind || "日程"}</small>
            </>
          ) : (
            <>
              <b>还没有读取安排</b>
              <small>Android 日历、.ics 与自己的日历服务分开设置</small>
            </>
          )}
          <button onClick={props.openSchedule}>
            查看课表与安排 <ArrowRight />
          </button>
        </div>
      </section>
      <section className="home-section pins-section">
        <header>
          <div>
            <h1>放在手边</h1>
            <p>常用入口，单击就进。</p>
          </div>
          <button
            className="text-button"
            onClick={() => props.chooseView("rooms")}
          >
            全部房间
          </button>
        </header>
        <div className="pin-grid">
          <PinButton
            icon={<CalendarBlank />}
            title="课表与安排"
            note={
              nextItem
                ? `下一项 ${formatTime(nextItem.startAt)}`
                : "选择日历来源"
            }
            onClick={props.openSchedule}
          />
          {!hidden.has("memory.ledger") && (
            <PinButton
              icon={<Brain />}
              title="记忆"
              note={`${props.memories.length} 条，${enabled} 条参与召回`}
              onClick={() => props.openPanel("memories")}
            />
          )}
          <PinButton
            icon={<IdentificationCard />}
            title="人物"
            note="身份与说话原则"
            onClick={() => props.openPanel("people")}
          />
          <PinButton
            icon={<PlugsConnected />}
            title="连接"
            note={
              props.gatewayStatus?.ok
                ? props.gatewayStatus.service
                : "接入自己的 relay"
            }
            onClick={() => props.openPanel("connection")}
          />
        </div>
      </section>
      {!hidden.has("companion.mood") && (
        <button
          className="mood-peek pressable"
          onClick={() => props.openPanel("mood")}
        >
          <Heart />
          <span>
            <small>{props.companionName} 此刻</small>
            <strong>{props.mood?.title || "等你把窗帘接上"}</strong>
            <em>
              {props.mood?.detail ||
                "可见心情由你的 relay 明确返回，不冒充隐藏推理。"}
            </em>
          </span>
          <span className="peek-action">再偷看</span>
        </button>
      )}
      <section className="home-section left-behind">
        <header>
          <div>
            <h1>今天留下的</h1>
            <p>都在你自己的 LocalData 里。</p>
          </div>
        </header>
        <button onClick={() => props.openPanel("data")}>
          <Database />
          <span>
            <strong>
              {props.messageCount} 句原文，{props.memories.length} 条记忆，
              {props.roomEntries.length} 条生活记录
            </strong>
            <small>查看与下载本地副本</small>
          </span>
          <ArrowRight />
        </button>
        <button disabled={exporting} onClick={() => void exportNow()}>
          <DownloadSimple />
          <span>
            <strong>{exporting ? "正在准备副本" : "下载今天的副本"}</strong>
            <small>JSON 只写入你在系统中确认的位置</small>
          </span>
          <ArrowRight />
        </button>
        {exportNotice && (
          <p className="save-message" role="status">
            <CheckCircle />
            {exportNotice}
          </p>
        )}
        {exportError && (
          <p className="form-error" role="alert">
            {exportError}
          </p>
        )}
      </section>
    </div>
  );
}
function PinButton({
  icon,
  title,
  note,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className="pin-button pressable" onClick={onClick}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{note}</small>
    </button>
  );
}

function TogetherView(
  props: SharedViewProps & {
    segment: "today" | "together" | "schedule";
    onSegmentChange: (segment: "today" | "together" | "schedule") => void;
  },
) {
  const today = props.lifeItems.filter(
    (item) =>
      new Date(item.startAt).toDateString() === new Date().toDateString(),
  );
  const showHealth = !props.hiddenCapabilities.includes("life.health");
  return (
    <div className="feature-view page-enter">
      <header className="page-heading">
        <h1>一起</h1>
        <p>共同生活和行动，直接就能找到。</p>
      </header>
      <div className="segment-control" role="tablist" aria-label="一起的分类">
        {(
          [
            ["today", "今天"],
            ["together", "一起做"],
            ["schedule", "课表"],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            aria-selected={props.segment === id}
            key={id}
            className={props.segment === id ? "active" : ""}
            onClick={() => props.onSegmentChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {props.segment === "today" && (
        <>
          <section className="agenda-section">
            <h2>今天</h2>
            {today.length ? (
              today.map((item) => <AgendaItem item={item} key={item.id} />)
            ) : (
              <EmptyBlock
                icon={<CalendarBlank />}
                title="今天还没有读取安排"
                note="先选择 Android 系统日历、.ics 或自己的日历服务。"
                action="选择日历来源"
                onAction={props.openCalendarSetup}
              />
            )}
          </section>
          <section className="home-section together-now">
            <header>
              <div>
                <h2>现在可以一起</h2>
                <p>不用进设置，也不用猜入口。</p>
              </div>
            </header>
            <div className="pin-grid">
              <PinButton
                icon={<PhoneCall />}
                title="电话与声音"
                note="实时转写与同一份原文"
                onClick={() => props.openPanel("call")}
              />
              <PinButton
                icon={<GearSix />}
                title="玩具盒"
                note="让伙伴真的动手做"
                onClick={() => props.openPanel("toys")}
              />
            </div>
          </section>
        </>
      )}
      {props.segment === "together" && (
        <div className="direct-list">
          <DirectRow
            icon={<PhoneCall />}
            title="电话与声音"
            note="通话、实时转写与同一份原文"
            onClick={() => props.openPanel("call")}
          />
          {!props.hiddenCapabilities.includes("media.cobrowse") && (
            <DirectRow icon={<Link />} title="一起看" note="从聊天或空间发公开链接" onClick={() => props.openPanel("cobrowse")} />
          )}
          {!props.hiddenCapabilities.includes("travel.story_cards") && (
            <DirectRow icon={<Notebook />} title="旅行手记" note="留一句话或一页纯文字笔记" onClick={() => props.openPanel("journey")} />
          )}
          <DirectRow
            icon={<Heart />}
            title="碰一碰"
            note={`${props.roomEntries.filter((item) => item.room === "checkin").length} 条双向心情`}
            onClick={() => props.openPanel("checkin")}
          />
          <DirectRow
            icon={<ChatsCircle />}
            title={`${props.companionName}的碎碎念`}
            note={`${props.roomEntries.filter((item) => item.room === "whisper").length} 条短句与主动表达`}
            onClick={() => props.openPanel("whisper")}
          />
          <DirectRow
            icon={<ListChecks />}
            title="共同工作本"
            note="待办、决定与执行"
            onClick={() => props.openPanel("work")}
          />
          <DirectRow
            icon={<PaperPlaneTilt />}
            title="赴约信箱"
            note="写给彼此的长信"
            onClick={() => props.openPanel("letter")}
          />
          <DirectRow
            icon={<ClockCounterClockwise />}
            title="我们的时间线"
            note="把经历留成可迁移记录"
            onClick={() => props.openPanel("timeline")}
          />
          {showHealth && (
            <DirectRow
              icon={<Heart />}
              title="健康与提醒授权"
              note="需要 Android / iOS 原生桥接"
              onClick={() => props.openFeature(featureFor("life.health"))}
            />
          )}
          <DirectRow
            icon={<ChatsCircle />}
            title="继续聊天"
            note="回到同一份原文账本"
            onClick={() => props.chooseView("chat")}
          />
          <DirectRow
            icon={<Database />}
            title="一起守住副本"
            note="检查并下载 LocalData"
            onClick={() => props.openPanel("data")}
          />
        </div>
      )}
      {props.segment === "schedule" && (
        <section className="agenda-section">
          <header className="agenda-section-header">
            <h2>未来 14 天</h2>
            <button className="text-button" onClick={props.openCalendarSetup}>
              日历设置
            </button>
          </header>
          {props.lifeItems.length ? (
            props.lifeItems.map((item) => (
              <AgendaItem item={item} key={item.id} />
            ))
          ) : (
            <EmptyBlock
              icon={<CloudSlash />}
              title="还没有选择日历来源"
              note="模型 API 不等于日历授权；在这里单独连接手机日历或自己的日历服务。"
              action="选择日历来源"
              onAction={props.openCalendarSetup}
            />
          )}
        </section>
      )}
    </div>
  );
}
function AgendaItem({ item }: { item: LifeOverviewItem }) {
  return (
    <article className="agenda-item">
      <time>{item.allDay ? "全天" : formatTime(item.startAt)}</time>
      <span>
        <strong>{item.title}</strong>
        <small>{item.location || item.kind || "日程"}</small>
      </span>
    </article>
  );
}
function DirectRow({
  icon,
  title,
  note,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className="direct-row pressable" onClick={onClick}>
      <span>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
      <ArrowRight />
    </button>
  );
}

function StudyView({
  openPanel,
  chooseView,
  roomEntries,
  hiddenCapabilities,
}: {
  openPanel: SharedViewProps["openPanel"];
  chooseView: SharedViewProps["chooseView"];
  roomEntries: RoomEntry[];
  hiddenCapabilities: CapabilityId[];
}) {
  const cards: StackDeckItem[] = [
    {
      id: "memory",
      icon: <Brain />,
      title: "记忆库",
      note: "搜索、分层、审阅与召回状态",
      onOpen: () => openPanel("memories"),
    },
    {
      id: "people",
      icon: <IdentificationCard />,
      title: "人物档案",
      note: "双方资料与说话原则",
      onOpen: () => openPanel("people"),
    },
    {
      id: "chat",
      icon: <ChatsCircle />,
      title: "原文账本",
      note: "永久原文、搜索与来源",
      onOpen: () => openPanel("archive"),
    },
    {
      id: "work",
      icon: <ListChecks />,
      title: "共同工作本",
      note: `${roomEntries.filter((item) => item.room === "work" && item.status === "active").length} 项还在进行`,
      onOpen: () => openPanel("work"),
    },
    {
      id: "repair",
      icon: <Wrench />,
      title: "修补本",
      note: "问题、处理和复盘",
      onOpen: () => openPanel("repair"),
    },
    {
      id: "data",
      icon: <Database />,
      title: "数据副本",
      note: "下载可迁移的 LocalData",
      onOpen: () => openPanel("data"),
    },
  ].filter(
    (item) =>
      item.id !== "memory" || !hiddenCapabilities.includes("memory.ledger"),
  );
  const build: StackDeckItem[] = [
    {
      id: "connection",
      icon: <PlugsConnected />,
      title: "模型连接",
      note: "接入你自己的 relay",
      onOpen: () => openPanel("connection"),
    },
    {
      id: "modules",
      icon: <Stack />,
      title: "功能包",
      note: "核心、可选后端与上游来源",
      onOpen: () => openPanel("modules"),
    },
    {
      id: "contract",
      icon: <Link />,
      title: "接口契约",
      note: "状态、聊天、日程与心情",
      onOpen: () => openPanel("about"),
    },
    {
      id: "appearance",
      icon: <Palette />,
      title: "外观",
      note: "底纸与重点色",
      onOpen: () => openPanel("appearance"),
    },
  ];
  return (
    <div className="feature-view page-enter">
      <header className="page-heading">
        <h1>书房</h1>
        <p>读、整理、连接与迁移。</p>
      </header>
      <StackDeck title="认真收好" items={cards} />
      <StackDeck title="继续搭建" items={build} />
    </div>
  );
}
type RoomDirectoryCard = StackDeckItem & { capabilityId?: CapabilityId };
function RoomsView({
  openPanel,
  openFeature,
  chooseView,
  roomEntries,
  toyCount,
  hiddenCapabilities,
  companionName,
}: {
  openPanel: SharedViewProps["openPanel"];
  openFeature: SharedViewProps["openFeature"];
  chooseView: SharedViewProps["chooseView"];
  roomEntries: RoomEntry[];
  toyCount: number;
  hiddenCapabilities: CapabilityId[];
  companionName: string;
}) {
  const count = useCallback(
    (room: RoomKind) => roomEntries.filter((item) => item.room === room).length,
    [roomEntries],
  );
  const districtCompanionName =
    companionName === "未命名伙伴" ? "伙伴" : companionName || "伙伴";
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const later = (capabilityId: CapabilityId) => () =>
      openFeature(featureFor(capabilityId));
    const directory: Array<{
      id: string;
      label: string;
      note: string;
      icon: ReactNode;
      cards: RoomDirectoryCard[];
    }> = [
      {
        id: "life",
        label: "一起生活",
        note: "日常、约定与关系",
        icon: <House />,
        cards: [
          {
            id: "home",
            icon: <House />,
            title: "连续首页",
            note: "续接、日程与手边入口",
            onOpen: () => chooseView("home"),
          },
          {
            id: "together",
            icon: <Heart />,
            title: "一起",
            note: "今天、一起做与课表",
            onOpen: () => chooseView("together"),
          },
          {
            id: "checkin",
            icon: <Heart />,
            title: "碰一碰",
            note: `${count("checkin")} 条双向心情`,
            onOpen: () => openPanel("checkin"),
          },
          {
            id: "letter",
            icon: <PaperPlaneTilt />,
            title: "赴约信箱",
            note: `${count("letter")} 封信`,
            onOpen: () => openPanel("letter"),
          },
          {
            id: "timeline",
            icon: <ClockCounterClockwise />,
            title: "我们的时间线",
            note: `${count("timeline")} 段经历`,
            onOpen: () => openPanel("timeline"),
          },
          {
            id: "gallery",
            capabilityId: "media.attachments",
            icon: <Sparkle />,
            title: "我们的相册",
            note: "同一份聊天图片",
            onOpen: () => openPanel("gallery"),
          },
          {
            id: "health",
            capabilityId: "life.health",
            icon: <Heart />,
            title: "健康与提醒",
            note: "需要手机原生授权",
            onOpen: later("life.health"),
          },
        ],
      },
      {
        id: "together",
        label: "一起做与玩",
        note: "认真做，也放心玩",
        icon: <Sparkle />,
        cards: [
          {
            id: "call",
            icon: <PhoneCall />,
            title: "电话与声音",
            note: "通话、实时转写与同一份原文",
            onOpen: () => openPanel("call"),
          },
          {
            id: "work",
            icon: <ListChecks />,
            title: "共同工作本",
            note: `${count("work")} 条记录`,
            onOpen: () => openPanel("work"),
          },
          {
            id: "reading",
            capabilityId: "reading.together",
            icon: <BookOpen />,
            title: "共读书房",
            note: "赴约轻量前端 · 完整能力推荐 Readest",
            onOpen: later("reading.together"),
          },
          {
            id: "engawa",
            capabilityId: "reading.engawa",
            icon: <BookOpen />,
            title: "Engawa 阅读侧廊",
            note: "网页、RSS、诗与书架 · 已内置适配",
            onOpen: () => openPanel("engawa"),
          },
          {
            id: "listening",
            capabilityId: "media.listening",
            icon: <Heart />,
            title: "一起听",
            note: "赴约轻量前端 · 完整能力推荐 music-together",
            onOpen: later("media.listening"),
          },
          {
            id: "cobrowse",
            capabilityId: "media.cobrowse",
            icon: <Link />,
            title: "一起看",
            note: "聊天或空间发公开链接，伙伴真读后评论",
            onOpen: () => openPanel("cobrowse"),
          },
          {
            id: "toys",
            capabilityId: "leisure.toys",
            icon: <GearSix />,
            title: "玩具盒",
            note: `${toyCount} 个本机玩具 · 安全沙箱已内置`,
            onOpen: () => openPanel("toys"),
          },
          {
            id: "game",
            capabilityId: "leisure.games",
            icon: <Sparkle />,
            title: "一起游戏",
            note: "独立许可游戏包待装",
            onOpen: later("leisure.games"),
          },
          {
            id: "fishing",
            capabilityId: "leisure.fishing",
            icon: <Sparkle />,
            title: "一起钓鱼",
            note: "非商业上游优先",
            onOpen: later("leisure.fishing"),
          },
          {
            id: "journey-text",
            capabilityId: "travel.story_cards",
            icon: <Notebook />,
            title: "旅行手记",
            note: "纯文字内置 · 一句话或一页笔记",
            onOpen: () => openPanel("journey"),
          },
          {
            id: "travel",
            capabilityId: "travel.upstream",
            icon: <Link />,
            title: "旅行与漫游",
            note: "可选适配；先看 Nowhere 原项目",
            onOpen: later("travel.upstream"),
          },
        ],
      },
      {
        id: "companion",
        label: `${districtCompanionName}自己`,
        note: "他的文字、心情与名片",
        icon: <IdentificationCard />,
        cards: [
          {
            id: "mood",
            capabilityId: "companion.mood",
            icon: <Heart />,
            title: "伙伴的心情",
            note: "relay 明确返回的可见状态",
            onOpen: () => openPanel("mood"),
          },
          {
            id: "diary",
            icon: <Notebook />,
            title: "装修日记",
            note: `${count("diary")} 篇日记`,
            onOpen: () => openPanel("diary"),
          },
          {
            id: "whisper",
            icon: <ChatsCircle />,
            title: "伙伴碎碎念",
            note: `${count("whisper")} 条短句`,
            onOpen: () => openPanel("whisper"),
          },
          {
            id: "people",
            icon: <IdentificationCard />,
            title: "人物",
            note: "资料和说话原则",
            onOpen: () => openPanel("people"),
          },
          {
            id: "space",
            capabilityId: "media.cobrowse",
            icon: <Heart />,
            title: "小小空间",
            note: "公开链接与伙伴评论",
            onOpen: () => openPanel("cobrowse"),
          },
        ],
      },
      {
        id: "system",
        label: "整理与系统",
        note: "记录、设置与家的状态",
        icon: <Stack />,
        cards: [
          {
            id: "memory",
            capabilityId: "memory.ledger",
            icon: <Brain />,
            title: "记忆库",
            note: "搜索、分层、审阅与启停",
            onOpen: () => openPanel("memories"),
          },
          {
            id: "archive",
            icon: <ClockCounterClockwise />,
            title: "原文账本",
            note: "永久原文、来源与收藏",
            onOpen: () => openPanel("archive"),
          },
          {
            id: "chat",
            icon: <ChatsCircle />,
            title: "聊天原文",
            note: "同一份可迁移账本",
            onOpen: () => chooseView("chat"),
          },
          {
            id: "repair",
            icon: <Wrench />,
            title: "共同修补本",
            note: `${count("repair")} 条记录`,
            onOpen: () => openPanel("repair"),
          },
          {
            id: "data",
            icon: <Database />,
            title: "本地副本",
            note: "导出 LocalData",
            onOpen: () => openPanel("data"),
          },
          {
            id: "status",
            icon: <ShieldCheck />,
            title: "运行状态",
            note: "LocalData、provider 与连接错误",
            onOpen: () => openPanel("status"),
          },
          {
            id: "connection",
            icon: <PlugsConnected />,
            title: "模型连接",
            note: "自托管 relay 与 provider",
            onOpen: () => openPanel("connection"),
          },
          {
            id: "modules",
            icon: <Stack />,
            title: "功能包",
            note: "模块状态、后端模式与来源",
            onOpen: () => openPanel("modules"),
          },
          {
            id: "appearance",
            icon: <Palette />,
            title: "外观",
            note: "底纸和重点色",
            onOpen: () => openPanel("appearance"),
          },
          {
            id: "kaomoji",
            capabilityId: "expression.kaomoji",
            icon: <Sparkle />,
            title: "颜文字",
            note: "聊天加号里已本地可用",
            onOpen: () => chooseView("chat"),
          },
          {
            id: "about",
            icon: <ShieldCheck />,
            title: "边界与接口",
            note: "隐私承诺和后端契约",
            onOpen: () => openPanel("about"),
          },
        ],
      },
    ];
    const hidden = new Set(hiddenCapabilities);
    return directory.map((group) => ({
      ...group,
      cards: group.cards.filter(
        (card) => !card.capabilityId || !hidden.has(card.capabilityId),
      ),
    }));
  }, [
    chooseView,
    openPanel,
    openFeature,
    count,
    hiddenCapabilities,
    toyCount,
    districtCompanionName,
  ]);
  const [groupId, setGroupId] = useState(groups[0]?.id || "life");
  const normalized = query.trim().toLocaleLowerCase();
  const allCards = groups.flatMap((group) => group.cards);
  const activeGroup = groups.find((group) => group.id === groupId) || groups[0];
  const cards = normalized
    ? allCards.filter((card) =>
        `${card.title} ${card.note}`.toLocaleLowerCase().includes(normalized),
      )
    : activeGroup?.cards || [];
  return (
    <div className="feature-view rooms-directory page-enter">
      <header className="rooms-intro">
        <span>
          <small>全部房间</small>
          <h1>先选用途，再开房门</h1>
          <p>{allCards.length} 个入口都在，平时只展开当下需要的一类。</p>
        </span>
        <Stack />
      </header>
      <label className="room-search">
        <MagnifyingGlass />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="找房间，比如相册、记忆或设置"
        />
        <strong>{normalized ? cards.length : allCards.length} 间</strong>
        {query && (
          <button onClick={() => setQuery("")} aria-label="清空搜索">
            <X />
          </button>
        )}
      </label>
      {!normalized && (
        <nav className="room-district-grid" aria-label="房间分类">
          {groups.map((group) => (
            <button
              key={group.id}
              aria-pressed={group.id === groupId}
              className={group.id === groupId ? "active" : ""}
              onClick={() => setGroupId(group.id)}
            >
              <span>{group.icon}</span>
              <div>
                <strong>{group.label}</strong>
                <small>{group.note}</small>
              </div>
              <em>{group.cards.length}</em>
            </button>
          ))}
        </nav>
      )}
      {cards.length ? (
        <section className="room-directory">
          <header>
            <span>
              <h2>{normalized ? "搜索结果" : activeGroup?.label}</h2>
              <p>
                {normalized ? `找到 ${cards.length} 个入口` : activeGroup?.note}
              </p>
            </span>
            <strong>{cards.length}</strong>
          </header>
          <StackDeck items={cards} />
        </section>
      ) : (
        <EmptyBlock
          icon={<MagnifyingGlass />}
          title="没有找到这个房间"
          note="换一个名称，或清空搜索回到分类。"
          action="清空搜索"
          onAction={() => setQuery("")}
        />
      )}
    </div>
  );
}

function isRoomPanel(panel: Panel): panel is RoomKind {
  return typeof panel === "string" && roomPanelNames.has(panel as RoomKind);
}
const roomConfig: Record<
  RoomKind,
  {
    title: string;
    note: string;
    empty: string;
    placeholder: string;
    titlePlaceholder: string;
    icon: ReactNode;
  }
> = {
  timeline: {
    title: "我们的时间线",
    note: "经历不只被蒸馏，也留下可迁移的原始索引",
    empty: "还没有时间线记录",
    placeholder: "那天发生了什么，我们怎样走过来的……",
    titlePlaceholder: "给这段经历一个名字",
    icon: <ClockCounterClockwise />,
  },
  letter: {
    title: "赴约信箱",
    note: "写给彼此的长信",
    empty: "信箱还是空的",
    placeholder: "想慢慢说完的话……",
    titlePlaceholder: "这封信的标题",
    icon: <PaperPlaneTilt />,
  },
  checkin: {
    title: "碰一碰",
    note: "一条可见的双向心情，不冒充隐藏推理",
    empty: "今天还没有碰一碰",
    placeholder: "现在的心情、想靠近的方式……",
    titlePlaceholder: "一句心情",
    icon: <Heart />,
  },
  work: {
    title: "共同工作本",
    note: "待办、决定与执行记录",
    empty: "工作本还没有条目",
    placeholder: "下一步、验收标准或已做的决定……",
    titlePlaceholder: "这件事叫什么",
    icon: <ListChecks />,
  },
  diary: {
    title: "装修日记",
    note: "家里做过什么，用几句真话留下来",
    empty: "装修日记还没有第一篇",
    placeholder: "今天改了什么，为什么这样改……",
    titlePlaceholder: "今天的装修",
    icon: <Notebook />,
  },
  repair: {
    title: "共同修补本",
    note: "不隐藏磕绊：记下问题、处理和复盘",
    empty: "共同修补本还没有条目",
    placeholder: "哪里卡住了，这次怎么处理，以后怎么避免……",
    titlePlaceholder: "要修的地方",
    icon: <Wrench />,
  },
  whisper: {
    title: "伙伴碎碎念",
    note: "短句、想念与主动表达；不会自动变成长久记忆",
    empty: "这里还安安静静",
    placeholder: "一小句真的想留下的话……",
    titlePlaceholder: "可以不写标题",
    icon: <ChatsCircle />,
  },
};

function LocalRoomPanel({
  room,
  entries,
  companionName,
  userName,
  onBack,
  onChange,
}: {
  room: RoomKind;
  entries: RoomEntry[];
  companionName: string;
  userName: string;
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const config = roomConfig[room];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState<MessageRole>("user");
  const [subtype, setSubtype] = useState(
    room === "checkin" ? "want_touch" : "",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy("create");
    setError("");
    try {
      await repository.createRoomEntry({
        room,
        author,
        title,
        content,
        subtype,
      });
      setTitle("");
      setContent("");
      setAdding(false);
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "这条记录没有保存");
    } finally {
      setBusy("");
    }
  }
  async function toggleDone(item: RoomEntry) {
    setBusy(item.id);
    setError("");
    try {
      await repository.saveRoomEntry({
        ...item,
        status: item.status === "done" ? "active" : "done",
      });
      await onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "状态没有更新");
    } finally {
      setBusy("");
    }
  }
  const subtypeLabels: Record<string, string> = {
    want_touch: "想靠近",
    miss_you: "想你",
    proud: "得意",
    upset: "委屈",
    busy: "在忙",
    poke: "碰一碰",
    safe: "平安",
    arrived: "到了",
    home: "到家",
    miss: "想念",
  };
  return (
    <div className="panel-content local-room-panel">
      <PanelHeader title={config.title} note={config.note} onBack={onBack} />
      <button
        className="primary-button full-button"
        onClick={() => setAdding((value) => !value)}
      >
        <Plus />
        {adding ? "收起编辑器" : "留下一条"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <form className="editor-form room-editor" onSubmit={create}>
          <div className="role-switch" role="group" aria-label="记录作者">
            <button
              type="button"
              aria-pressed={author === "user"}
              className={author === "user" ? "active" : ""}
              onClick={() => setAuthor("user")}
            >
              {userName}
            </button>
            <button
              type="button"
              aria-pressed={author === "companion"}
              className={author === "companion" ? "active" : ""}
              onClick={() => setAuthor("companion")}
            >
              代录 {companionName}
            </button>
          </div>
          <label>
            标题
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder={config.titlePlaceholder}
            />
          </label>
          {room === "checkin" && (
            <label>
              此刻想表达
              <select
                value={subtype}
                onChange={(event) => setSubtype(event.target.value)}
              >
                <option value="want_touch">想靠近</option>
                <option value="miss_you">想你</option>
                <option value="proud">得意</option>
                <option value="upset">委屈</option>
                <option value="busy">在忙</option>
                <option value="custom">其他</option>
              </select>
            </label>
          )}
          <label>
            内容
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              maxLength={20_000}
              placeholder={config.placeholder}
              required
            />
          </label>
          <button
            className="primary-button"
            disabled={!content.trim() || busy === "create"}
          >
            {busy === "create" ? (
              <SpinnerGap className="spin" />
            ) : (
              <FloppyDisk />
            )}
            保存到 LocalData
          </button>
        </form>
      )}
      {!entries.length && !adding && (
        <EmptyBlock
          icon={config.icon}
          title={config.empty}
          note="这里只显示你写下或从私有备份导入的真实内容。"
          action="留第一条"
          onAction={() => setAdding(true)}
        />
      )}
      <section className="room-entry-list">
        {entries.map((item) => (
          <article className={`room-entry ${item.status}`} key={item.id}>
            <header>
              <span>
                {item.author === "user"
                  ? userName
                  : item.author === "companion"
                    ? companionName
                    : "系统导入"}{" "}
                · {item.sourceLabel}
              </span>
              <time>{formatTime(item.occurredAt)}</time>
            </header>
            {item.title && <h2>{item.title}</h2>}
            <p>{item.content || "（只保留了标题）"}</p>
            <footer>
              {item.subtype && (
                <small>{subtypeLabels[item.subtype] || item.subtype}</small>
              )}
              {(room === "work" || room === "repair") && (
                <button
                  className="secondary-button compact-button"
                  disabled={busy === item.id}
                  onClick={() => void toggleDone(item)}
                >
                  {item.status === "done" ? "恢复进行" : "标记完成"}
                </button>
              )}
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}

function MoodPanel({
  mood,
  companionName,
  refreshing,
  canRefresh,
  onBack,
  onRefresh,
  onConfigure,
  onGoChat,
}: {
  mood: MoodSnapshot | null;
  companionName: string;
  refreshing: boolean;
  canRefresh: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onConfigure: () => void;
  onGoChat: () => void;
}) {
  const [refreshError, setRefreshError] = useState("");
  async function refresh() {
    setRefreshError("");
    try {
      await onRefresh();
    } catch (cause) {
      setRefreshError(
        cause instanceof Error ? cause.message : "心情来源暂时不可用",
      );
    }
  }
  return (
    <div className="panel-content">
      <PanelHeader
        title={`${companionName} 此刻`}
        note="伙伴可以在聊天里主动把可见短态留在本机"
        onBack={onBack}
      />
      {mood ? (
        <section className="mood-detail">
          <Heart weight="fill" />
          <small>
            最后更新 {mood.updatedAt ? formatTime(mood.updatedAt) : "时间未知"}{" "}
            · 来源 {mood.sourceLabel}
          </small>
          <h2>{mood.title}</h2>
          <p>{mood.detail}</p>
        </section>
      ) : (
        <EmptyBlock
          icon={<Heart />}
          title="还没有留下心情"
          note="不需要你维护数值。伙伴在真实对话里想让你看见时，会用本机工具写下来。"
          action="回聊天"
          onAction={onGoChat}
        />
      )}
      {refreshError && (
        <p className="form-error" role="alert">
          <WarningCircle />
          {refreshError}
        </p>
      )}
      {canRefresh && (
        <button
          className="secondary-button full-button"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? <SpinnerGap className="spin" /> : <Heart />}
          {refreshing ? "正在刷新" : "刷新后端心情"}
        </button>
      )}
      <button className="secondary-button full-button" onClick={onConfigure}>
        <Stack />
        查看心情实现
      </button>
      <section className="boundary-note">
        <h2>不是随机加减</h2>
        <p>
          本机只保存伙伴主动公开的短态；接后端时也必须带来源与更新时间。它不会要求你手动养数值，也不会把沉默伪造成新的情绪。
        </p>
      </section>
    </div>
  );
}

function PanelHeader({
  title,
  note,
  onBack,
}: {
  title: string;
  note?: string;
  onBack: () => void;
}) {
  return (
    <header className="panel-header">
      <button
        data-panel-back
        className="icon-button quiet"
        onClick={onBack}
        aria-label="返回"
      >
        <ArrowLeft />
      </button>
      <div>
        <h1 id="panel-title">{title}</h1>
        {note && <p>{note}</p>}
      </div>
    </header>
  );
}
function PeoplePanel({
  people,
  onChange,
  onBack,
}: {
  people: PersonProfile[];
  onChange: () => Promise<void>;
  onBack: () => void;
}) {
  const initial = useMemo(
    () =>
      Object.fromEntries(people.map((item) => [item.id, item])) as Record<
        MessageRole,
        PersonProfile
      >,
    [],
  );
  const [drafts, setDrafts] = useState(initial);
  const [savedRole, setSavedRole] = useState<MessageRole | null>(null);
  const [error, setError] = useState("");
  const [avatarBusy, setAvatarBusy] = useState<MessageRole | "">("");
  const [cropTarget, setCropTarget] = useState<{
    role: MessageRole;
    file: File;
  } | null>(null);
  async function save(role: MessageRole) {
    const draft = drafts[role];
    if (!draft?.displayName.trim()) return;
    setError("");
    try {
      const stored = await repository.savePerson({
        ...draft,
        displayName: draft.displayName.trim(),
      });
      setDrafts((current) => ({ ...current, [role]: stored }));
      await onChange();
      setSavedRole(role);
      window.setTimeout(
        () => setSavedRole((current) => (current === role ? null : current)),
        1800,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "人物资料没有保存");
    }
  }
  function update(
    role: MessageRole,
    field: "displayName" | "signature" | "bio" | "voiceNotes" | "avatarDataUrl",
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [role]: { ...current[role], [field]: value },
    }));
  }
  async function pickAvatar(role: MessageRole, file: File | undefined) {
    if (!file) return;
    setAvatarBusy(role);
    setError("");
    try {
      const image = await imageAttachment(file);
      update(role, "avatarDataUrl", image.dataUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像没有整理好");
    } finally {
      setAvatarBusy("");
    }
  }
  return (
    <div className="panel-content">
      <PanelHeader
        title="我们是谁"
        note="头像、名字和签名会回到首页与聊天"
        onBack={onBack}
      />
      {error && <p className="form-error">{error}</p>}
      {(["user", "companion"] as MessageRole[]).map((role) => {
        const draft = drafts[role];
        if (!draft) return null;
        return (
          <section className="person-editor profile-editor" key={role}>
            <header>
              <div className="profile-avatar-edit">
                <ProfileAvatar profile={draft} />
                <label aria-label={`更换${draft.displayName}的头像`}>
                  <UploadSimple />
                  {avatarBusy === role ? "整理中" : "换头像"}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) setCropTarget({ role, file });
                    }}
                  />
                </label>
              </div>
              <span>{role === "user" ? "使用者" : "陪伴者"}</span>
            </header>
            <label>
              名字
              <input
                value={draft.displayName}
                onChange={(event) =>
                  update(role, "displayName", event.target.value)
                }
                maxLength={40}
              />
            </label>
            <label>
              个性签名
              <textarea
                value={draft.signature}
                onChange={(event) =>
                  update(role, "signature", event.target.value)
                }
                rows={2}
                maxLength={160}
                placeholder="写一句这一阵的心情…"
              />
            </label>
            <label>
              资料
              <textarea
                value={draft.bio}
                onChange={(event) => update(role, "bio", event.target.value)}
                rows={3}
                maxLength={1200}
                placeholder="稳定身份、关系边界与重要背景"
              />
            </label>
            {role === "companion" && (
              <label>
                说话原则
                <textarea
                  value={draft.voiceNotes}
                  onChange={(event) =>
                    update(role, "voiceNotes", event.target.value)
                  }
                  rows={5}
                  maxLength={2000}
                  placeholder="例如：直接、具体、少用模板句；先回应当下，再给建议。"
                />
                <small>保存可迁移的风格约定，不声称能复制某个模型本身。</small>
              </label>
            )}
            <button className="primary-button" onClick={() => void save(role)}>
              <FloppyDisk />
              保存人物
            </button>
            {savedRole === role && (
              <p className="save-message profile-save-message" role="status">
                <CheckCircle />
                {draft.displayName}已保存
              </p>
            )}
          </section>
        );
      })}
      {cropTarget && (
        <AvatarCropper
          file={cropTarget.file}
          title={`裁剪${drafts[cropTarget.role]?.displayName || "头像"}`}
          onCancel={() => setCropTarget(null)}
          onConfirm={async (file) => {
            const role = cropTarget.role;
            setCropTarget(null);
            await pickAvatar(role, file);
          }}
        />
      )}
    </div>
  );
}
function ConnectionPanel({
  nativeAvailable,
  nativeState,
  relayUrl,
  status,
  statusError,
  onBack,
  onSave,
  onDisconnect,
  onSaveNative,
  onDisconnectNative,
}: {
  nativeAvailable: boolean;
  nativeState: NativeGatewayState | null;
  relayUrl: string;
  status: GatewayStatus | null;
  statusError: string;
  onBack: () => void;
  onSave: (url: string, accessCode?: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSaveNative: (configuration: NativeGatewayConfiguration) => Promise<void>;
  onDisconnectNative: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"native" | "local" | "service" | "advanced">(
    nativeAvailable
      ? nativeState?.configured
        ? "native"
        : relayUrl
          ? "advanced"
          : "native"
      : relayUrl
        ? "advanced"
        : "local",
  );
  const initialNativePreset =
    presetForBaseUrl(nativeState?.baseUrl || "https://api.deepseek.com") ||
    NATIVE_PROVIDER_PRESETS[0]!;
  const [draft, setDraft] = useState(relayUrl);
  const [accessCode, setAccessCode] = useState("");
  const [nativeKey, setNativeKey] = useState("");
  const [nativeProviderId, setNativeProviderId] = useState(
    presetForBaseUrl(nativeState?.baseUrl || "")?.id || initialNativePreset.id,
  );
  const [nativeBaseUrl, setNativeBaseUrl] = useState(
    nativeState?.baseUrl || initialNativePreset.baseUrl,
  );
  const [nativeModel, setNativeModel] = useState(
    nativeState?.model || initialNativePreset.models[0]!.id,
  );
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(statusError);
  useEffect(() => setError(statusError), [statusError]);
  const nativePreset =
    NATIVE_PROVIDER_PRESETS.find((item) => item.id === nativeProviderId) ||
    null;
  function chooseNativeProvider(id: string) {
    const preset = NATIVE_PROVIDER_PRESETS.find((item) => item.id === id);
    setNativeProviderId(id);
    setError("");
    if (preset) {
      setNativeBaseUrl(preset.baseUrl);
      setNativeModel(preset.models[0]!.id);
    }
  }
  function pasteNativeCredential(event: ClipboardEvent<HTMLInputElement>) {
    const recognized = recognizeProviderPaste(
      event.clipboardData.getData("text"),
    );
    if (recognized.unsupported) {
      event.preventDefault();
      setNativeKey("");
      setError(recognized.unsupported);
      return;
    }
    if (recognized.preset) chooseNativeProvider(recognized.preset.id);
    if (recognized.apiKey) {
      event.preventDefault();
      setNativeKey(recognized.apiKey);
      setError(
        recognized.preset
          ? `已识别为 ${recognized.preset.label}，请确认模型后保存。`
          : "Key 前缀无法唯一判断供应商，已保留当前选择；请核对供应商。",
      );
    }
  }
  function connectionMessage(cause: unknown) {
    if (cause instanceof TypeError)
      return mode === "local"
        ? "没有找到本机 relay。先在项目目录运行 npm run dev:all，再重试。"
        : "无法访问这个地址，请检查 HTTPS、网络和 Origin 配置。";
    return cause instanceof Error ? cause.message : "没有连接上服务";
  }
  async function connect(url: string, code = "") {
    setTesting(true);
    setError("");
    try {
      if (nativeAvailable && nativeState?.configured)
        throw new Error(
          "当前正在使用 Android 原生 Key。先回到‘Android 直连’清除原生配置，再切换到订阅或 relay，避免表面切换但仍消耗原生 API。",
        );
      await onSave(url, code);
      setAccessCode("");
    } catch (cause) {
      setError(connectionMessage(cause));
    } finally {
      setTesting(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await connect(draft, mode === "service" ? accessCode : "");
  }
  async function saveNative(event: FormEvent) {
    event.preventDefault();
    setTesting(true);
    setError("");
    try {
      await onSaveNative({
        apiKey: nativeKey,
        baseUrl: nativeBaseUrl,
        model: nativeModel,
      });
      setNativeKey("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "原生直连没有配置成功");
    } finally {
      setTesting(false);
    }
  }
  const tabs = nativeAvailable
    ? ([
        ["native", "Android 直连"],
        ["service", "手机服务"],
        ["advanced", "远程 relay"],
      ] as const)
    : ([
        ["local", "本机 API"],
        ["service", "手机服务"],
        ["advanced", "远程 relay"],
      ] as const);
  return (
    <div className="panel-content">
      <PanelHeader
        title="模型连接"
        note={
          nativeAvailable
            ? "Key 由 Android Keystore 加密保存，不进入 LocalData"
            : "Key 留在 relay，前端只接统一接口"
        }
        onBack={onBack}
      />
      <section className={`connection-state ${status?.ok ? "connected" : ""}`}>
        {status?.ok ? <CheckCircle /> : <CloudSlash />}
        <span>
          <strong>{status?.ok ? "模型服务已连接" : "当前是纯本地模式"}</strong>
          <small>
            {status?.ok
              ? `${status.service} · ${status.providers.length} 个 provider`
              : "聊天、人物、记忆和导出仍然可用"}
          </small>
        </span>
      </section>
      <div
        className="segment-control connection-tabs"
        role="tablist"
        aria-label="连接方式"
      >
        {tabs.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={mode === id}
            key={id}
            className={mode === id ? "active" : ""}
            onClick={() => {
              setMode(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "native" && (
        <>
          <section className="mobile-connect-lead">
            <ShieldCheck />
            <span>
              <small>只在 Android APK</small>
              <h2>选供应商，粘贴 Key</h2>
              <p>
                地址由赴约填写，避免贴错端点。Key 验证后从页面清除，并用设备
                Keystore 加密保存。
              </p>
            </span>
          </section>
          <form
            className="editor-form native-provider-form"
            onSubmit={saveNative}
          >
            <label>
              供应商
              <select
                value={nativeProviderId}
                onChange={(event) => chooseNativeProvider(event.target.value)}
              >
                {NATIVE_PROVIDER_PRESETS.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">自定义兼容接口（高级）</option>
              </select>
            </label>
            <label>
              模型
              {nativePreset ? (
                <select
                  value={nativeModel}
                  onChange={(event) => setNativeModel(event.target.value)}
                >
                  {nativePreset.models.map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={nativeModel}
                  onChange={(event) => setNativeModel(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={160}
                  required
                />
              )}
            </label>
            {!nativePreset && (
              <label>
                兼容接口地址
                <input
                  type="url"
                  inputMode="url"
                  value={nativeBaseUrl}
                  onChange={(event) => setNativeBaseUrl(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </label>
            )}
            <label>
              API Key
              <input
                type="password"
                value={nativeKey}
                onPaste={pasteNativeCredential}
                onChange={(event) => {
                  setNativeKey(event.target.value);
                  if (
                    error.startsWith("已识别") ||
                    error.startsWith("Key 前缀")
                  )
                    setError("");
                }}
                autoComplete="off"
                maxLength={512}
                placeholder={
                  nativeState?.configured
                    ? "重新粘贴会替换现有 Key"
                    : "粘贴后会尝试识别供应商"
                }
                required
              />
            </label>
            {error && (
              <p
                className={
                  error.startsWith("已识别") || error.startsWith("Key 前缀")
                    ? "field-note"
                    : "form-error"
                }
                role="status"
              >
                {error}
              </p>
            )}
            <button
              className="primary-button"
              disabled={
                !nativeKey.trim() ||
                !nativeBaseUrl.trim() ||
                !nativeModel.trim() ||
                testing
              }
            >
              {testing ? <SpinnerGap className="spin" /> : <ShieldCheck />}
              {testing
                ? "正在验证"
                : nativeState?.configured
                  ? "验证并替换"
                  : "验证并保存"}
            </button>
          </form>
          {nativeState?.configured && (
            <button
              type="button"
              className="secondary-button danger-text full-button"
              onClick={() => void onDisconnectNative()}
            >
              清除原生 API 配置
            </button>
          )}
        </>
      )}
      {mode === "local" && (
        <>
          <section className="mobile-connect-lead local-connect-lead">
            <PlugsConnected />
            <span>
              <small>DeepSeek 最短路径</small>
              <h2>Key 一次配置，之后直接聊天</h2>
              <p>
                在下载的项目目录运行下面两步。Key 只写进权限为 600 的 relay
                配置，不进入网页、导出或 Git。
              </p>
            </span>
          </section>
          <ol className="setup-steps">
            <li>
              <span>1</span>
              <code>npm run setup:deepseek</code>
              <small>粘贴 Key，终端不会回显</small>
            </li>
            <li>
              <span>2</span>
              <code>npm run dev:all</code>
              <small>同时启动网页与本机 relay</small>
            </li>
          </ol>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button full-button"
            disabled={testing}
            onClick={() => void connect("http://127.0.0.1:8787")}
          >
            {testing ? <SpinnerGap className="spin" /> : <PlugsConnected />}
            {testing ? "正在寻找" : "连接本机 DeepSeek"}
          </button>
        </>
      )}
      {mode === "service" && (
        <>
          <section className="mobile-connect-lead">
            <PlugsConnected />
            <span>
              <small>适合只用手机</small>
              <h2>粘贴服务地址和接入码</h2>
              <p>
                发行者或你信任的服务方负责模型与费用；赴约只保存服务地址，接入码兑换成功后立即从页面清掉。
              </p>
            </span>
          </section>
          <a
            className="secondary-button full-button deploy-relay-link"
            href="https://render.com/deploy?repo=https://github.com/TangfanOVO/fuyue"
            target="_blank"
            rel="noreferrer"
          >
            <CloudArrowUp />
            没有服务？一键部署私人 relay
          </a>
          <form className="editor-form" onSubmit={save}>
            <label>
              服务地址
              <input
                type="url"
                inputMode="url"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="https://service.example.com"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </label>
            <label>
              订阅接入码
              <input
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                autoComplete="one-time-code"
                maxLength={256}
                required
              />
            </label>
            <p className="field-note">
              <ShieldCheck />
              接入码只用来换取服务端 HttpOnly 会话，不写入 LocalData
              或浏览器设置。
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-button"
              disabled={!draft.trim() || !accessCode.trim() || testing}
            >
              {testing ? <SpinnerGap className="spin" /> : <PlugsConnected />}
              {testing ? "正在接入" : "接入订阅服务"}
            </button>
          </form>
        </>
      )}
      {mode === "advanced" && (
        <form className="editor-form" onSubmit={save}>
          <label>
            Relay URL
            <input
              type="url"
              inputMode="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="https://relay.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </label>
          <p className="field-note">
            <ShieldCheck />
            API Key 不进入浏览器。远程地址必须使用 HTTPS；localhost 可使用
            HTTP。
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            disabled={!draft.trim() || testing}
          >
            {testing ? <SpinnerGap className="spin" /> : <PlugsConnected />}
            {testing ? "正在检查" : "检查并保存"}
          </button>
        </form>
      )}
      {relayUrl && (
        <button
          type="button"
          className="secondary-button danger-text full-button"
          onClick={() => void onDisconnect()}
        >
          清除已保存的 relay 连接
        </button>
      )}
      {status?.providers.length ? (
        <section className="provider-list">
          <h2>服务提供的模型</h2>
          {status.providers.map((provider) => (
            <article key={provider.id}>
              <span>
                <strong>{provider.label}</strong>
                <small>{provider.capabilities.join(" · ") || "chat"}</small>
              </span>
              {provider.id === status.activeProviderId && <em>当前</em>}
            </article>
          ))}
        </section>
      ) : null}
      <section className="boundary-note">
        <h2>已有 ChatGPT / Gemini 订阅能直接用吗？</h2>
        <p>
          通常不能。消费订阅与 API 计费是两套服务；公开版不接管账号
          Cookie。手机用户最省事的路线，是使用支持这份 relay
          契约的托管订阅服务。
        </p>
      </section>
    </div>
  );
}
function DataPanel({
  onBack,
  onExport,
  onImport,
  counts,
}: {
  onBack: () => void;
  onExport: () => Promise<string>;
  onImport: () => void;
  counts: {
    messages: number;
    memories: number;
    roomEntries: number;
    toys: number;
  };
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      setNotice(await onExport());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "副本没有保存");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-content">
      <PanelHeader
        title="本地副本"
        note="把可以迁移的资料带走"
        onBack={onBack}
      />
      <section className="data-counts four">
        <div>
          <strong>{counts.messages}</strong>
          <span>句原文</span>
        </div>
        <div>
          <strong>{counts.memories}</strong>
          <span>条记忆</span>
        </div>
        <div>
          <strong>{counts.roomEntries}</strong>
          <span>条生活记录</span>
        </div>
        <div>
          <strong>{counts.toys}</strong>
          <span>个玩具</span>
        </div>
      </section>
      <button
        className="primary-button full-button"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? <SpinnerGap className="spin" /> : <DownloadSimple />}下载
        fuyue-portable JSON
      </button>
      {notice && (
        <p className="save-message" role="status">
          <CheckCircle />
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary-button full-button" onClick={onImport}>
        <UploadSimple />
        审阅并导入副本
      </button>
      <section className="boundary-note">
        <h2>导出会包含什么</h2>
        <p>
          人物资料、说话原则、聊天原文、来源标签、记忆、共同房间、玩具与游玩事件、外观和功能可见性。文件可能非常私密，不要提交进公开
          Git 仓库。
        </p>
      </section>
    </div>
  );
}

function ImportPanel({
  onBack,
  onImported,
}: {
  onBack: () => void;
  onImported: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [summary, setSummary] = useState<SnapshotImportSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const [replacePeople, setReplacePeople] = useState(false);
  const [replaceSettings, setReplaceSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SnapshotImportResult | null>(null);
  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    setSnapshot(null);
    setSummary(null);
    setFileName(file.name);
    try {
      if (file.size > 40_000_000)
        throw new Error(
          "文件超过 40 MB，当前手机版无法安全在内存中审阅；请先拆分图片或在电脑上整理副本",
        );
      const incoming = parseWorkspaceSnapshot(
        JSON.parse(await file.text()) as unknown,
      );
      const current = await repository.snapshot();
      setSnapshot(incoming);
      setSummary(previewSnapshotImport(current, incoming));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "没有读懂这个文件");
    }
  }
  async function applyImport() {
    if (!snapshot || !summary) return;
    setBusy(true);
    setError("");
    let imported: SnapshotImportResult;
    try {
      imported = await repository.importSnapshot(snapshot, {
        replacePeople,
        replaceSettings,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "副本没有导入");
      setBusy(false);
      return;
    }
    setResult(imported);
    setSnapshot(null);
    setSummary(null);
    try {
      await onImported();
    } catch {
      setError(
        "副本已经导入，但页面没有立即刷新；重新打开赴约就能重读 LocalData。",
      );
    } finally {
      setBusy(false);
    }
  }
  const conflicts = summary
    ? summary.conflicts.memories +
      summary.conflicts.conversations +
      summary.conflicts.messages +
      summary.conflicts.roomEntries +
      summary.conflicts.toys +
      summary.conflicts.toyActivityEvents
    : 0;
  return (
    <div className="panel-content">
      <PanelHeader
        title="导入副本"
        note="先看清楚，再写入 LocalData"
        onBack={onBack}
      />
      <label className="file-picker secondary-button full-button">
        <UploadSimple />
        <span>{fileName || "选择 fuyue-portable JSON"}</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => void selectFile(event)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="import-success">
          <CheckCircle />
          <span>
            <strong>导入完成</strong>
            <small>
              新增 {result.messages} 句原文、{result.memories} 条待审记忆、
              {result.roomEntries} 条生活记录、{result.toys} 个玩具、
              {result.toyActivityEvents} 条游玩事件、{result.conversations}{" "}
              段对话。
            </small>
          </span>
        </section>
      )}
      {summary && snapshot && (
        <>
          <section className="import-preview">
            <header>
              <span>待审预览</span>
              <strong>{summary.incoming.messages} 句原文</strong>
            </header>
            <div>
              <span>
                <b>{summary.addable.conversations}</b> 段新对话
              </span>
              <span>
                <b>{summary.addable.messages}</b> 句可写入
              </span>
              <span>
                <b>{summary.addable.memories}</b> 条待审记忆
              </span>
              <span>
                <b>{summary.addable.roomEntries}</b> 条生活记录
              </span>
              <span>
                <b>{summary.addable.toys}</b> 个玩具
              </span>
              <span>
                <b>{summary.addable.toyActivityEvents}</b> 条游玩事件
              </span>
              <span>
                <b>
                  {summary.skippedDuplicates.messages +
                    summary.skippedDuplicates.memories +
                    summary.skippedDuplicates.conversations +
                    summary.skippedDuplicates.roomEntries +
                    summary.skippedDuplicates.toys +
                    summary.skippedDuplicates.toyActivityEvents}
                </b>{" "}
                项完全重复
              </span>
            </div>
          </section>
          <section className="import-samples">
            <h2>作者、来源与内容抽样</h2>
            {snapshot.messages.slice(0, 3).map((item) => (
              <article key={item.id}>
                <small>
                  {item.role === "user" ? "使用者" : "陪伴者"} ·{" "}
                  {item.sourceLabel || "未标来源"}
                  {item.modelLabel ? ` · ${item.modelLabel}` : ""}
                </small>
                <p>{compact(item.content, 140)}</p>
              </article>
            ))}
            {snapshot.roomEntries.slice(0, 3).map((item) => (
              <article key={item.id}>
                <small>
                  {item.author === "user"
                    ? "使用者"
                    : item.author === "companion"
                      ? "陪伴者"
                      : "系统"}{" "}
                  · {roomConfig[item.room].title} · {item.sourceLabel}
                </small>
                <p>{compact(item.content || item.title, 140)}</p>
              </article>
            ))}
            {!snapshot.messages.length && !snapshot.roomEntries.length && (
              <p>这个文件没有原文或生活记录可供抽样。</p>
            )}
          </section>
          {conflicts > 0 && (
            <p className="import-warning">
              <WarningCircle />
              {conflicts} 个同 ID 条目内容不同，将保留本机版本。
            </p>
          )}
          <section className="boundary-note">
            <h2>记忆不会偷跑</h2>
            <p>
              {summary.incoming.memories
                ? `文件里的 ${summary.incoming.memories} 条记忆都会以待审草稿写入，默认不参与召回。`
                : "这个文件没有记忆条目。"}
            </p>
          </section>
          <label className="toggle-row import-people">
            <input
              type="checkbox"
              checked={replacePeople}
              onChange={(event) => setReplacePeople(event.target.checked)}
            />
            <span>
              <strong>同时替换人物资料</strong>
              <small>
                {summary.replaceablePeople
                  ? `${summary.replaceablePeople} 份人物资料与本机不同；不勾选就保留本机。`
                  : "人物资料与本机一致。"}
              </small>
            </span>
          </label>
          <label className="toggle-row import-people">
            <input
              type="checkbox"
              disabled={!summary.replaceableSettings}
              checked={replaceSettings}
              onChange={(event) => setReplaceSettings(event.target.checked)}
            />
            <span>
              <strong>同时恢复外观设置</strong>
              <small>
                {summary.replaceableSettings
                  ? "副本的底纸和重点色与本机不同；不勾选就保留本机。"
                  : "外观设置与本机一致。"}
              </small>
            </span>
          </label>
          <button
            className="primary-button full-button"
            disabled={busy}
            onClick={() => void applyImport()}
          >
            {busy ? <SpinnerGap className="spin" /> : <ShieldCheck />}
            {busy ? "正在写入" : "确认导入"}
          </button>
        </>
      )}
    </div>
  );
}
function AppearancePanel({
  appearance,
  onChange,
  onBack,
}: {
  appearance: AppearanceSettings;
  onChange: (value: AppearanceSettings) => void;
  onBack: () => void;
}) {
  const chooseMode = (mode: AppearanceSettings["mode"]) =>
    onChange({ ...appearance, mode });
  const changeRange = (key: "density" | "speed", delta: number) =>
    onChange({
      ...appearance,
      [key]: Math.max(1, Math.min(5, appearance[key] + delta)),
    });
  const chooseEffect = (effect: LineEffect, darkOnly = false) => {
    const next = toggleLineEffectSelection(appearance, effect);
    onChange({ ...next, mode: darkOnly && next.effects.includes(effect) ? "dark" : next.mode });
  };
  const rangeStyle = (value: number) =>
    ({ "--range-progress": `${((value - 1) / 4) * 100}%` }) as CSSProperties;
  return (
    <div className="panel-content appearance-panel">
      <PanelHeader
        title="住在哪种光里"
        note="外壳、明暗、颜色和漂浮物都随 LocalData 副本迁移"
        onBack={onBack}
      />
      <section className="choice-section">
        <h2>界面外壳</h2>
        <div className="shell-choice">
          {shellRegistry.map((item) => (
            <button
              aria-pressed={appearance.layout === item.id}
              key={item.id}
              className={appearance.layout === item.id ? "active" : ""}
              onClick={() => onChange({ ...appearance, layout: item.id })}
            >
              <span>
                <b>{item.name}</b>
                <small>{item.note}</small>
              </span>
              {appearance.layout === item.id && <CheckCircle />}
            </button>
          ))}
        </div>
      </section>
      <section className="choice-section">
        <h2>白天与黑夜</h2>
        <div className="appearance-mode-switch">
          <button
            aria-pressed={appearance.mode === "light"}
            className={appearance.mode === "light" ? "active" : ""}
            onClick={() => chooseMode("light")}
          >
            <Sun />
            <span>
              <b>白天</b>
              <small>使用当前配色的浅色底纸</small>
            </span>
          </button>
          <button
            aria-pressed={appearance.mode === "dark"}
            className={appearance.mode === "dark" ? "active" : ""}
            onClick={() => chooseMode("dark")}
          >
            <Moon />
            <span>
              <b>黑夜</b>
              <small>保留当前重点色，换成深色底纸</small>
            </span>
          </button>
        </div>
      </section>
      <section className="choice-section">
        <h2>重点色</h2>
        <div className="theme-grid">
          {themeRegistry.map((item) => (
            <button
              aria-pressed={appearance.theme === item.id}
              key={item.id}
              className={appearance.theme === item.id ? "active" : ""}
              onClick={() => onChange({ ...appearance, theme: item.id })}
            >
              <span className="theme-swatches">
                {item.colors.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <span>
                <b>{item.name}</b>
                <small>{item.note}</small>
              </span>
              {appearance.theme === item.id && <CheckCircle />}
            </button>
          ))}
        </div>
      </section>
      <section className="choice-section">
        <h2>漂浮物</h2>
        <p className="effect-note">
          可以叠加多种，点“不飘”会清空全部；星屑与萤火会自动进入黑夜。
        </p>
        <div className="effect-grid">
          {lineEffectRegistry.map((item) => {
            const active = item.id === "none" ? appearance.effects.length === 0 : appearance.effects.includes(item.id);
            return <button aria-pressed={active} key={item.id} className={active ? "active" : ""} onClick={() => chooseEffect(item.id, item.darkOnly)}>
              <LineEffectGlyph effect={item.id} />
              <span>{item.name}</span>
              {active && <CheckCircle className="effect-check" weight="fill" />}
            </button>;
          })}
        </div>
        {(
          [
            ["density", "密度"],
            ["speed", "速度"],
          ] as const
        ).map(([key, label]) => (
          <div className="range-field" key={key}>
            <span>
              <b>{label}</b>
              <small>{appearance[key]} / 5</small>
            </span>
            <div className="range-control">
              <button
                type="button"
                disabled={appearance[key] <= 1}
                onClick={() => changeRange(key, -1)}
                aria-label={`${label}减少`}
              >
                −
              </button>
              <input
                aria-label={label}
                type="range"
                min="1"
                max="5"
                step="1"
                value={appearance[key]}
                style={rangeStyle(appearance[key])}
                onChange={(event) =>
                  onChange({ ...appearance, [key]: Number(event.target.value) })
                }
              />
              <button
                type="button"
                disabled={appearance[key] >= 5}
                onClick={() => changeRange(key, 1)}
                aria-label={`${label}增加`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
function AboutPanel({
  onBack,
  onOpenConnection,
}: {
  onBack: () => void;
  onOpenConnection: () => void;
}) {
  return (
    <div className="panel-content">
      <PanelHeader
        title="边界与接口"
        note="这是一只简易小手机，不模拟完整操作系统"
        onBack={onBack}
      />
      <section className="about-lead">
        <ShieldCheck />
        <h2>LocalData 先属于使用者</h2>
        <p>
          未连接模型时，人物、原文和记忆只写入本机
          IndexedDB。只有使用者主动发送时，本轮、当前账本 48 小时内最多 100
          条原文、人物资料和明确启用的记忆才会交给当前模型。
        </p>
      </section>
      <div className="contract-list">
        <article>
          <code>GET /v1/status</code>
          <span>模型与能力状态</span>
        </article>
        <article>
          <code>POST /v1/chat/stream</code>
          <span>SSE 或 NDJSON 流式回复</span>
        </article>
        <article>
          <code>GET /v1/life/overview</code>
          <span>日程与课表</span>
        </article>
        <article>
          <code>GET /v1/companion/mood</code>
          <span>明确可见的心情，不是隐藏推理</span>
        </article>
      </div>
      <button className="primary-button full-button" onClick={onOpenConnection}>
        <PlugsConnected />
        去连接 relay
      </button>
    </div>
  );
}
function EmptyBlock({
  icon,
  title,
  note,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h2>{title}</h2>
      <p>{note}</p>
      <button className="secondary-button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
