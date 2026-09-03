import type { CapabilityStatus } from "./capabilities.js";
import type { MemoryItem, MessageSource, PersonProfile, ToolTraceItem } from "./types.js";
import type { VoiceAudioInput, VoiceGateway, VoiceProviderId, VoiceStatus, VoiceSynthesis, VoiceTranscript } from "./voice.js";

export type GatewayCapability = "chat" | "vision" | "tools" | "audio";
export type ReasoningEffort = "auto" | "none" | "low" | "medium" | "high" | "xhigh" | "max";
export const CLIENT_TOOL_CONTRACT_VERSION = 2;
export const CLIENT_TOOL_NAMES = [
  "update_companion_signature",
  "set_companion_mood",
  "create_memory_draft",
  "add_work_item",
  "write_room_entry",
  "set_appearance",
  "create_toy",
  "update_toy",
  "create_calendar_event",
] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

const CLIENT_TOOL_NAME_SET = new Set<string>(CLIENT_TOOL_NAMES);
export function isClientToolName(value: unknown): value is ClientToolName {
  return typeof value === "string" && CLIENT_TOOL_NAME_SET.has(value);
}

export interface ClientToolAction {
  id: string;
  name: ClientToolName;
  arguments: Record<string, unknown>;
}

export interface GatewayProvider {
  id: string;
  label: string;
  capabilities: GatewayCapability[];
  reasoningEfforts?: ReasoningEffort[];
  clientTools?: ClientToolName[];
}

export interface GatewayStatus {
  ok: boolean;
  service: string;
  providers: GatewayProvider[];
  activeProviderId: string;
  capabilities: CapabilityStatus[];
}

export interface LifeOverviewItem {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  kind?: string;
  allDay?: boolean;
  sourceId?: string;
}

export interface MoodSnapshot {
  title: string;
  detail: string;
  updatedAt: string;
  sourceLabel: string;
}

export interface CobrowseInspection {
  status: "read" | "blocked";
  requestedUrl: string;
  finalUrl: string;
  sourceLabel: string;
  title: string;
  summary: string;
  detail: string;
}

export interface CobrowseComment {
  inspection: CobrowseInspection;
  comment: string;
  sourceLabel: string;
  modelLabel: string;
}

export interface EngawaStatus {
  ok: boolean;
  service: string;
  detail: string;
  tools: string[];
}

export interface EngawaResult {
  ok: boolean;
  tool: string;
  content: unknown;
  sourceLabel: string;
}

export interface ChatHistoryItem {
  role: "user" | "companion";
  content: string;
  createdAt: string;
  source: MessageSource;
  sourceLabel: string;
  modelLabel: string;
}

export interface RoomContextItem {
  room: "timeline" | "letter" | "checkin" | "work" | "diary" | "repair" | "whisper";
  author: "user" | "companion" | "system";
  title: string;
  content: string;
  subtype: string;
  status: "active" | "done" | "archived";
  occurredAt: string;
}

export interface ChatGatewayRequest {
  conversationId: string;
  clientMessageId: string;
  input: string;
  locale: string;
  history: ChatHistoryItem[];
  people: PersonProfile[];
  memories: MemoryItem[];
  roomContext?: RoomContextItem[];
  calendarContext?: LifeOverviewItem[];
  providerId?: string;
  reasoningEffort?: ReasoningEffort;
  enabledTools?: ClientToolName[];
  speechDelivery?: "eleven_v3_audio_tags";
}

export type ChatGatewayEvent =
  | { type: "delta"; delta: string }
  | {
      type: "done";
      content?: string;
      sourceLabel?: string;
      modelLabel?: string;
      toolTrace?: ToolTraceItem[];
      clientActions?: ClientToolAction[];
    }
  | { type: "error"; message: string; retryable?: boolean };

export interface CompanionGateway {
  status(signal?: AbortSignal): Promise<GatewayStatus>;
  streamChat(request: ChatGatewayRequest, signal?: AbortSignal): AsyncIterable<ChatGatewayEvent>;
  lifeOverview(days: number, signal?: AbortSignal): Promise<LifeOverviewItem[]>;
  mood(signal?: AbortSignal): Promise<MoodSnapshot | null>;
  cobrowseComment?(url: string, note: string, signal?: AbortSignal): Promise<CobrowseComment>;
  engawaStatus?(signal?: AbortSignal): Promise<EngawaStatus>;
  engawaAction?(tool: string, argumentsValue?: Record<string, unknown>, signal?: AbortSignal): Promise<EngawaResult>;
}

export class GatewayError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = "GatewayError";
  }
}

function normalizedBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new GatewayError("请先填写 relay 地址");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new GatewayError("relay 地址不是有效 URL");
  }
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new GatewayError("远程 relay 必须使用 HTTPS；本机 localhost 可以使用 HTTP");
  }
  return url.toString().replace(/\/$/, "");
}

async function responseError(response: Response): Promise<GatewayError> {
  let detail = "";
  try {
    const body = await response.json() as { detail?: string; message?: string };
    detail = body.detail || body.message || "";
  } catch {
    detail = "";
  }
  if (response.status === 401) return new GatewayError(detail || "relay 需要重新登录", 401);
  if (response.status === 403) return new GatewayError(detail || "relay 拒绝了这次请求", 403);
  if (response.status === 429) return new GatewayError(detail || "请求太频繁，请稍后再试", 429);
  return new GatewayError(detail || `relay 返回 ${response.status}`, response.status);
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
const relaySessionTokens = new Map<string, string>();
function sessionStorageKey(baseUrl: string): string { return `fuyue.relay-session:${baseUrl}`; }
function readSessionToken(baseUrl: string): string {
  const memory = relaySessionTokens.get(baseUrl); if (memory) return memory;
  try { return globalThis.sessionStorage?.getItem(sessionStorageKey(baseUrl)) || ""; } catch { return ""; }
}
function writeSessionToken(baseUrl: string, token: string): void {
  if (token) relaySessionTokens.set(baseUrl, token); else relaySessionTokens.delete(baseUrl);
  try { if (token) globalThis.sessionStorage?.setItem(sessionStorageKey(baseUrl), token); else globalThis.sessionStorage?.removeItem(sessionStorageKey(baseUrl)); } catch { /* Memory fallback still works. */ }
}
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function validStatus(value: unknown): GatewayStatus {
  const item = object(value); const providers = item?.providers; const capabilities = item?.capabilities;
  if (!item || typeof item.ok !== "boolean" || typeof item.service !== "string" || typeof item.activeProviderId !== "string" || !Array.isArray(providers)) throw new GatewayError("relay 状态格式不完整");
  const parsed = providers.map((provider) => {
    const entry = object(provider); const capabilities = entry?.capabilities;
    if (!entry || typeof entry.id !== "string" || typeof entry.label !== "string" || !Array.isArray(capabilities) || capabilities.some((capability) => !["chat", "vision", "tools", "audio"].includes(String(capability)))) throw new GatewayError("relay provider 格式不完整");
    const reasoningEfforts = entry.reasoningEfforts;
    const clientTools = entry.clientTools;
    if (reasoningEfforts !== undefined && (!Array.isArray(reasoningEfforts) || reasoningEfforts.some((effort) => !["auto", "none", "low", "medium", "high", "xhigh", "max"].includes(String(effort))))) throw new GatewayError("relay 思考深度格式不完整");
    if (clientTools !== undefined && (!Array.isArray(clientTools) || clientTools.some((name) => !isClientToolName(name)))) throw new GatewayError("relay 本机工具契约不完整");
    return { id: entry.id, label: entry.label, capabilities: capabilities as GatewayCapability[], ...(Array.isArray(reasoningEfforts) ? { reasoningEfforts: reasoningEfforts as ReasoningEffort[] } : {}), ...(Array.isArray(clientTools) ? { clientTools: clientTools as ClientToolName[] } : {}) };
  });
  const parsedCapabilities: CapabilityStatus[] = Array.isArray(capabilities) ? capabilities.map((capability) => {
    const entry = object(capability);
    if (!entry || typeof entry.id !== "string" || !["local", "custom_backend", "fuyue_service", "disabled"].includes(String(entry.mode)) || !["ready", "local_only", "surface_only", "needs_backend", "disabled", "error"].includes(String(entry.state))) throw new GatewayError("relay capability 格式不完整");
    return {
      id: entry.id as CapabilityStatus["id"],
      mode: entry.mode as CapabilityStatus["mode"],
      state: entry.state as CapabilityStatus["state"],
      ...(typeof entry.service === "string" ? { service: entry.service } : {}),
      ...(typeof entry.detail === "string" ? { detail: entry.detail } : {}),
    };
  }) : [];
  return { ok: item.ok, service: item.service, activeProviderId: item.activeProviderId, providers: parsed, capabilities: parsedCapabilities };
}
function validLife(value: unknown): LifeOverviewItem[] {
  if (!Array.isArray(value)) throw new GatewayError("relay 日程格式不完整");
  return value.map((entry) => { const item = object(entry); if (!item || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.startAt !== "string" || Number.isNaN(Date.parse(item.startAt))) throw new GatewayError("relay 日程条目格式不完整"); return { id: item.id, title: item.title, startAt: item.startAt, ...(typeof item.endAt === "string" ? { endAt: item.endAt } : {}), ...(typeof item.location === "string" ? { location: item.location } : {}), ...(typeof item.kind === "string" ? { kind: item.kind } : {}) }; });
}
function validMood(value: unknown): MoodSnapshot | null {
  if (value == null) return null; const item = object(value);
  if (!item || typeof item.title !== "string" || typeof item.detail !== "string" || typeof item.updatedAt !== "string" || Number.isNaN(Date.parse(item.updatedAt)) || typeof item.sourceLabel !== "string" || !item.sourceLabel.trim()) throw new GatewayError("relay 心情格式不完整");
  return { title: item.title, detail: item.detail, updatedAt: item.updatedAt, sourceLabel: item.sourceLabel.trim() };
}

function validCobrowseInspection(value: unknown): CobrowseInspection {
  const item = object(value);
  if (!item || !["read", "blocked"].includes(String(item.status)) || typeof item.requestedUrl !== "string" || typeof item.finalUrl !== "string" || typeof item.sourceLabel !== "string" || typeof item.title !== "string" || typeof item.summary !== "string" || typeof item.detail !== "string") throw new GatewayError("relay 共看读回格式不完整");
  return { status: item.status as CobrowseInspection["status"], requestedUrl: item.requestedUrl, finalUrl: item.finalUrl, sourceLabel: item.sourceLabel, title: item.title, summary: item.summary, detail: item.detail };
}

function validCobrowseComment(value: unknown): CobrowseComment {
  const item = object(value);
  if (!item || typeof item.comment !== "string" || !item.comment.trim() || typeof item.sourceLabel !== "string" || typeof item.modelLabel !== "string") throw new GatewayError("relay 没有返回可保存的共看评论");
  return { inspection: validCobrowseInspection(item.inspection), comment: item.comment.trim(), sourceLabel: item.sourceLabel, modelLabel: item.modelLabel };
}

function validEngawaStatus(value: unknown): EngawaStatus {
  const item = object(value);
  if (!item || typeof item.ok !== "boolean" || typeof item.service !== "string" || typeof item.detail !== "string" || !Array.isArray(item.tools) || item.tools.some((tool) => typeof tool !== "string")) throw new GatewayError("Engawa 状态格式不完整");
  return { ok: item.ok, service: item.service, detail: item.detail, tools: item.tools as string[] };
}

function validEngawaResult(value: unknown): EngawaResult {
  const item = object(value);
  if (!item || typeof item.ok !== "boolean" || typeof item.tool !== "string" || typeof item.sourceLabel !== "string" || !("content" in item)) throw new GatewayError("Engawa 读回格式不完整");
  return { ok: item.ok, tool: item.tool, content: item.content, sourceLabel: item.sourceLabel };
}

function validVoiceStatus(value: unknown): VoiceStatus {
  const item = object(value); const providers = item?.providers;
  if (!item || typeof item.ok !== "boolean" || typeof item.service !== "string" || typeof item.activeProviderId !== "string" || !Array.isArray(providers)) throw new GatewayError("relay 语音状态格式不完整");
  const parsed = providers.map((provider) => {
    const entry = object(provider);
    if (!entry || !["elevenlabs", "doubao", "custom"].includes(String(entry.id)) || typeof entry.label !== "string" || typeof entry.configured !== "boolean" || typeof entry.voice !== "string" || typeof entry.model !== "string") throw new GatewayError("relay 语音 provider 格式不完整");
    return { id: entry.id as VoiceProviderId, label: entry.label, configured: entry.configured, voice: entry.voice, model: entry.model };
  });
  if (item.activeProviderId && !["elevenlabs", "doubao", "custom"].includes(item.activeProviderId)) throw new GatewayError("relay 默认语音 provider 不可识别");
  return { ok: item.ok, service: item.service, activeProviderId: item.activeProviderId as VoiceProviderId | "", providers: parsed, ...(typeof item.detail === "string" ? { detail: item.detail } : {}) };
}

function validVoiceTranscript(value: unknown): VoiceTranscript {
  const item = object(value);
  if (!item || typeof item.text !== "string" || !item.text.trim() || !["elevenlabs", "doubao", "custom"].includes(String(item.providerId)) || typeof item.providerLabel !== "string") throw new GatewayError("relay 没有返回可保存的转写");
  return { text: item.text.trim(), providerId: item.providerId as VoiceProviderId, providerLabel: item.providerLabel };
}

function validVoiceSynthesis(value: unknown): VoiceSynthesis {
  const item = object(value);
  if (!item || typeof item.audioBase64 !== "string" || item.audioBase64.length < 16 || !["audio/mpeg", "audio/wav"].includes(String(item.mediaType)) || !["elevenlabs", "doubao", "custom"].includes(String(item.providerId)) || typeof item.providerLabel !== "string") throw new GatewayError("relay 没有返回可播放的语音");
  return { audioBase64: item.audioBase64, mediaType: item.mediaType as VoiceSynthesis["mediaType"], providerId: item.providerId as VoiceProviderId, providerLabel: item.providerLabel };
}

function parseEvent(value: unknown): ChatGatewayEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<ChatGatewayEvent>;
  if (event.type === "delta" && typeof event.delta === "string") return { type: "delta", delta: event.delta };
  if (event.type === "error" && typeof event.message === "string") {
    return typeof event.retryable === "boolean"
      ? { type: "error", message: event.message, retryable: event.retryable }
      : { type: "error", message: event.message };
  }
  if (event.type === "done") {
    const item = object(value);
    const toolTrace = item?.toolTrace;
    const clientActions = item?.clientActions;
    if (!item
      || (item.content !== undefined && typeof item.content !== "string")
      || (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string")
      || (item.modelLabel !== undefined && typeof item.modelLabel !== "string")
      || (clientActions !== undefined && (!Array.isArray(clientActions) || clientActions.some((action) => {
        const entry = object(action); const args = object(entry?.arguments);
        return !entry || typeof entry.id !== "string" || !isClientToolName(entry.name) || !args;
      })))
      || (toolTrace !== undefined && (!Array.isArray(toolTrace) || toolTrace.some((trace) => {
        const entry = object(trace);
        return !entry || typeof entry.name !== "string" || !["success", "failed"].includes(String(entry.status)) || typeof entry.summary !== "string";
      })))) throw new GatewayError("relay 完成事件格式不完整");
    return {
      type: "done",
      ...(typeof item.content === "string" ? { content: item.content } : {}),
      ...(typeof item.sourceLabel === "string" ? { sourceLabel: item.sourceLabel } : {}),
      ...(typeof item.modelLabel === "string" ? { modelLabel: item.modelLabel } : {}),
      ...(Array.isArray(toolTrace) ? { toolTrace: toolTrace as ToolTraceItem[] } : {}),
      ...(Array.isArray(clientActions) ? { clientActions: clientActions as ClientToolAction[] } : {}),
    };
  }
  return null;
}

async function* parseEventStream(response: Response): AsyncGenerator<ChatGatewayEvent> {
  if (!response.body) throw new GatewayError("relay 没有返回响应正文", response.status);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let terminalEvent = false;
  while (true) {
    const { done, value } = await reader.read();
    buffer += value || "";
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":")) continue;
      const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = parseEvent(JSON.parse(payload));
        if (event) {
          if (event.type === "done" || event.type === "error") terminalEvent = true;
          yield event;
        }
      } catch {
        throw new GatewayError("relay 返回了无法识别的流事件", response.status);
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    try {
      const event = parseEvent(JSON.parse(buffer.trim().replace(/^data:\s*/, "")));
      if (event) {
        if (event.type === "done" || event.type === "error") terminalEvent = true;
        yield event;
      }
    } catch {
      throw new GatewayError("relay 的最后一段响应不完整", response.status);
    }
  }
  if (!terminalEvent) throw new GatewayError("relay 的回复没有完整结束；半截内容没有写入原文账本", response.status);
}

export class RelayApiClient implements CompanionGateway, VoiceGateway {
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, fetcher?: typeof fetch) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  get sessionToken(): string { return readSessionToken(this.baseUrl); }

  private async request(input: string, init: RequestInit): Promise<Response> {
    try {
      const headers = new Headers(init.headers); const token = this.sessionToken;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return await this.fetcher(input, { ...init, headers });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      if (cause instanceof Error && cause.name === "TimeoutError") {
        throw new GatewayError("relay 响应超时，请检查网络后重试");
      }
      throw new GatewayError("连接不到 relay，请检查服务是否启动、地址是否正确");
    }
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
      signal: requestSignal(signal, 15_000),
    });
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<unknown>;
  }

  async status(signal?: AbortSignal): Promise<GatewayStatus> {
    return validStatus(await this.getJson("/v1/status", signal));
  }

  async exchangeAccessCode(code: string, signal?: AbortSignal): Promise<void> {
    let bearer = true;
    try { bearer = !globalThis.location || new URL(this.baseUrl).origin !== globalThis.location.origin; } catch { /* Non-browser clients use bearer. */ }
    const response = await this.request(`${this.baseUrl}/v1/session/exchange`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, ...(bearer ? { bearer: true } : {}) }),
      signal: requestSignal(signal, 15_000),
    });
    if (!response.ok) throw await responseError(response);
    const result = object(await response.json()); const token = result?.sessionToken;
    writeSessionToken(this.baseUrl, bearer && typeof token === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : "");
  }

  async revokeSession(signal?: AbortSignal): Promise<void> {
    let response: Response;
    try { response = await this.request(`${this.baseUrl}/v1/session/logout`, {
      method: "POST", credentials: "include", signal: requestSignal(signal, 10_000),
    }); } finally { writeSessionToken(this.baseUrl, ""); }
    if (!response.ok) throw await responseError(response);
  }

  async lifeOverview(days: number, signal?: AbortSignal): Promise<LifeOverviewItem[]> {
    const safeDays = Math.max(1, Math.min(31, Math.trunc(days)));
    return validLife(await this.getJson(`/v1/life/overview?days=${safeDays}`, signal));
  }

  async mood(signal?: AbortSignal): Promise<MoodSnapshot | null> {
    return validMood(await this.getJson("/v1/companion/mood", signal));
  }

  async cobrowseComment(url: string, note: string, signal?: AbortSignal): Promise<CobrowseComment> {
    const response = await this.request(`${this.baseUrl}/v1/cobrowse/comment`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ url, note }), signal: requestSignal(signal, 45_000),
    });
    if (!response.ok) throw await responseError(response);
    return validCobrowseComment(await response.json());
  }

  async engawaStatus(signal?: AbortSignal): Promise<EngawaStatus> {
    return validEngawaStatus(await this.getJson("/v1/reading/engawa/status", signal));
  }

  async engawaAction(tool: string, argumentsValue: Record<string, unknown> = {}, signal?: AbortSignal): Promise<EngawaResult> {
    const response = await this.request(`${this.baseUrl}/v1/reading/engawa/action`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ tool, arguments: argumentsValue }), signal: requestSignal(signal, 30_000),
    });
    if (!response.ok) throw await responseError(response);
    return validEngawaResult(await response.json());
  }

  async voiceStatus(signal?: AbortSignal): Promise<VoiceStatus> {
    return validVoiceStatus(await this.getJson("/v1/voice/status", signal));
  }

  async transcribeVoice(input: VoiceAudioInput, signal?: AbortSignal): Promise<VoiceTranscript> {
    const response = await this.request(`${this.baseUrl}/v1/voice/transcribe`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify(input), signal: requestSignal(signal, 60_000),
    });
    if (!response.ok) throw await responseError(response);
    return validVoiceTranscript(await response.json());
  }

  async synthesizeVoice(text: string, providerId?: VoiceProviderId, signal?: AbortSignal): Promise<VoiceSynthesis> {
    const response = await this.request(`${this.baseUrl}/v1/voice/synthesize`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ text, ...(providerId ? { providerId } : {}) }), signal: requestSignal(signal, 60_000),
    });
    if (!response.ok) throw await responseError(response);
    return validVoiceSynthesis(await response.json());
  }

  async *streamChat(request: ChatGatewayRequest, signal?: AbortSignal): AsyncGenerator<ChatGatewayEvent> {
    const response = await this.request(`${this.baseUrl}/v1/chat/stream`, {
      method: "POST",
      headers: { Accept: "text/event-stream, application/x-ndjson", "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(request),
      signal: requestSignal(signal, 120_000),
    });
    if (!response.ok) throw await responseError(response);
    yield* parseEventStream(response);
  }
}
