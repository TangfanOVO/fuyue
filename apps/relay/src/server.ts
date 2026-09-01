import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { BUILTIN_CAPABILITIES, CLIENT_TOOL_NAMES, isClientToolName, localCapabilityStatus, type CapabilityStatus, type ChatGatewayRequest, type ClientToolAction, type LifeOverviewItem, type MoodSnapshot, type VoiceAudioInput, type VoiceProviderId } from "@fuyue/core";
import type { ProviderKind, RelayConfig } from "./config.js";
import { buildPrompt } from "./prompt.js";
import { createProvider, ProviderError } from "./providers.js";
import { bridgeDoubaoLiveCall, synthesizeVoice, transcribeVoice, voiceProvider } from "./voice.js";
import { inspectCobrowseUrl, inspectionContext, supportedCobrowseUrls } from "./cobrowse.js";
import { engawaAction, engawaStatus } from "./engawa.js";

const MAX_BODY = 1_000_000;
const MAX_INPUT = 40_000;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
function detail(response: ServerResponse, status: number, message: string) { json(response, status, { detail: message }); }
function originAllowed(request: IncomingMessage, config: RelayConfig): boolean {
  const origin = request.headers.origin?.replace(/\/$/, "");
  return !origin || config.allowedOrigins.has(origin);
}
function cors(request: IncomingMessage, response: ServerResponse, config: RelayConfig) {
  const origin = request.headers.origin?.replace(/\/$/, "");
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}
async function body(request: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += next.length; if (size > limit) throw new ProviderError("Request body is too large", 413); chunks.push(next);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ProviderError("Request body must be valid JSON", 400); }
}
function validChat(value: unknown): value is ChatGatewayRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ChatGatewayRequest>;
  return typeof item.conversationId === "string" && item.conversationId.length <= 200
    && typeof item.clientMessageId === "string" && item.clientMessageId.length > 0 && item.clientMessageId.length <= 200
    && typeof item.input === "string" && item.input.trim().length > 0 && item.input.length <= MAX_INPUT
    && typeof item.locale === "string" && item.locale.length <= 40
    && Array.isArray(item.history) && item.history.length <= 100
    && item.history.every((message) => Boolean(message && typeof message === "object" && !Array.isArray(message)
      && (message.role === "user" || message.role === "companion") && typeof message.content === "string" && message.content.length > 0
      && message.content.length <= 20_000 && typeof message.createdAt === "string" && !Number.isNaN(Date.parse(message.createdAt))
      && (message.source === undefined || ["local_manual", "system_seed", "chatgpt_work", "codex", "relay", "external_import"].includes(message.source))
      && (message.sourceLabel === undefined || (typeof message.sourceLabel === "string" && message.sourceLabel.length <= 200))
      && (message.modelLabel === undefined || (typeof message.modelLabel === "string" && message.modelLabel.length <= 200))))
    && Array.isArray(item.people) && item.people.length <= 4
    && item.people.every((person) => Boolean(person && typeof person === "object" && !Array.isArray(person)
      && (person.id === "user" || person.id === "companion") && typeof person.displayName === "string" && person.displayName.length <= 80
      && typeof person.bio === "string" && person.bio.length <= 8_000 && typeof person.voiceNotes === "string" && person.voiceNotes.length <= 12_000))
    && Array.isArray(item.memories) && item.memories.length <= 200
    && item.memories.every((memory) => Boolean(memory && typeof memory === "object" && !Array.isArray(memory)
      && typeof memory.id === "string" && memory.id.length <= 200 && typeof memory.title === "string" && memory.title.length <= 300
      && typeof memory.content === "string" && memory.content.length <= 20_000 && typeof memory.injectionEnabled === "boolean"))
    && (item.roomContext === undefined || (Array.isArray(item.roomContext) && item.roomContext.length <= 80
      && item.roomContext.every((entry) => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)
        && ["timeline", "letter", "checkin", "work", "diary", "repair", "whisper"].includes(entry.room)
        && ["user", "companion", "system"].includes(entry.author)
        && typeof entry.title === "string" && entry.title.length <= 300
        && typeof entry.content === "string" && entry.content.length <= 20_000
        && typeof entry.subtype === "string" && entry.subtype.length <= 200
        && ["active", "done", "archived"].includes(entry.status)
        && typeof entry.occurredAt === "string" && !Number.isNaN(Date.parse(entry.occurredAt))))))
    && (item.calendarContext === undefined || (Array.isArray(item.calendarContext) && item.calendarContext.length <= 100
      && item.calendarContext.every((entry) => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)
        && typeof entry.id === "string" && entry.id.length <= 300
        && typeof entry.title === "string" && entry.title.length <= 500
        && typeof entry.startAt === "string" && !Number.isNaN(Date.parse(entry.startAt))
        && (entry.endAt === undefined || (typeof entry.endAt === "string" && !Number.isNaN(Date.parse(entry.endAt))))
        && (entry.location === undefined || (typeof entry.location === "string" && entry.location.length <= 1_000))
        && (entry.kind === undefined || (typeof entry.kind === "string" && entry.kind.length <= 200))
        && (entry.allDay === undefined || typeof entry.allDay === "boolean")
        && (entry.sourceId === undefined || (typeof entry.sourceId === "string" && entry.sourceId.length <= 300))))))
    && (item.providerId === undefined || (typeof item.providerId === "string" && item.providerId.length <= 100))
    && (item.reasoningEffort === undefined || ["auto", "none", "low", "medium", "high", "xhigh", "max"].includes(item.reasoningEffort))
    && (item.speechDelivery === undefined || item.speechDelivery === "eleven_v3_audio_tags")
    && (item.enabledTools === undefined || (Array.isArray(item.enabledTools) && item.enabledTools.length <= CLIENT_TOOL_NAMES.length && item.enabledTools.every(isClientToolName)));
}
async function optionalJson<T>(path: string, fallback: T): Promise<T> {
  if (!path) return fallback;
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function streamEvent(response: ServerResponse, value: unknown) { response.write(`data: ${JSON.stringify(value)}\n\n`); }
function cookie(request: IncomingMessage, name: string): string {
  for (const part of (request.headers.cookie || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}
function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createRelayServer(config: RelayConfig, fetcher: typeof fetch = fetch) {
  const completed = new Map<string, { content: string; modelLabel: string; clientActions: ClientToolAction[] }>();
  const inflight = new Set<string>();
  const sessions = new Map<string, number>();
  const failedAccess = new Map<string, { count: number; resetAt: number }>();
  const providers = new Map(config.providers.map((item) => [item.id, { config: item, adapter: createProvider(item, fetcher) }]));
  const capabilityStatus = (engawaReady = false): CapabilityStatus[] => {
    const localStatuses = new Map(localCapabilityStatus().map((item) => [item.id, item]));
    return BUILTIN_CAPABILITIES.map((item) => {
      if (item.id === "chat.continuous") return {
        id: item.id, mode: "custom_backend", state: config.providers.length ? "ready" : "needs_backend",
        service: config.serviceName, detail: config.providers.length ? "relay 已连接模型" : "relay 尚未配置模型",
      };
      if (item.id === "life.calendar") return {
        id: item.id, mode: "custom_backend", state: config.lifeFile ? "ready" : "surface_only",
        service: config.serviceName, detail: config.lifeFile ? "已连接日程文件" : "只有日程入口，尚未连接来源",
      };
      if (item.id === "companion.mood") return {
        id: item.id, mode: "custom_backend", state: config.moodFile ? "ready" : "surface_only",
        service: config.serviceName, detail: config.moodFile ? "已连接可审计的心情文件" : "只有心情入口，尚未连接可刷新来源",
      };
      if (item.id === "call.realtime") return {
        id: item.id, mode: "custom_backend", state: config.voiceProviders.length ? "ready" : "needs_backend",
        service: config.serviceName, detail: config.voiceProviders.length ? `已连接 ${config.voiceProviders.map((provider) => provider.label).join(" / ")}` : "电话页已随壳提供，relay 尚未配置语音 provider",
      };
      if (item.id === "reading.engawa") return {
        id: item.id, mode: "custom_backend", state: engawaReady ? "ready" : "needs_backend",
        service: "Engawa MCP", detail: engawaReady ? "MIT 侧车已连接" : "适配器已内置；运行 npm run setup:engawa 并重开全家",
      };
      return localStatuses.get(item.id)!;
    });
  };

  const server = createServer(async (request, response) => {
    cors(request, response, config);
    if (!originAllowed(request, config)) { detail(response, 403, "Origin is not allowed"); return; }
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Accept" }); response.end(); return;
    }
    const url = new URL(request.url || "/", "http://relay.local");
    try {
      if (request.method === "POST" && url.pathname === "/v1/session/exchange") {
        if (!config.accessCode) { detail(response, 404, "这个 relay 没有启用接入码"); return; }
        const address = request.socket.remoteAddress || "unknown"; const now = Date.now(); const attempt = failedAccess.get(address);
        if (attempt && attempt.resetAt > now && attempt.count >= 5) { detail(response, 429, "接入尝试过多，请十分钟后再试"); return; }
        const requestBody = await body(request) as { code?: unknown };
        const supplied = typeof requestBody?.code === "string" && requestBody.code.length <= 256 ? requestBody.code : "";
        if (!equalSecret(supplied, config.accessCode)) {
          failedAccess.set(address, attempt && attempt.resetAt > now ? { count: attempt.count + 1, resetAt: attempt.resetAt } : { count: 1, resetAt: now + 600_000 });
          detail(response, 401, "服务地址或接入码不正确"); return;
        }
        failedAccess.delete(address);
        const token = randomBytes(32).toString("base64url"); sessions.set(token, now + 30 * 86_400_000);
        const secure = ["localhost", "127.0.0.1", "::1"].includes(config.host) ? "SameSite=Lax" : "SameSite=None; Secure";
        response.setHeader("Set-Cookie", `fuyue_session=${encodeURIComponent(token)}; HttpOnly; ${secure}; Path=/v1; Max-Age=2592000`);
        json(response, 200, { ok: true }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/session/logout") {
        const token = cookie(request, "fuyue_session"); if (token) sessions.delete(token);
        const secure = ["localhost", "127.0.0.1", "::1"].includes(config.host) ? "SameSite=Lax" : "SameSite=None; Secure";
        response.setHeader("Set-Cookie", `fuyue_session=; HttpOnly; ${secure}; Path=/v1; Max-Age=0`);
        json(response, 200, { ok: true }); return;
      }
      if (config.accessCode) {
        const token = cookie(request, "fuyue_session"); const expiresAt = sessions.get(token) || 0;
        if (!token || expiresAt <= Date.now()) { if (token) sessions.delete(token); detail(response, 401, "请先使用订阅接入码连接"); return; }
      }
      if (request.method === "GET" && url.pathname === "/v1/status") {
        const engawa = await engawaStatus(config.engawaUrl, fetcher);
        json(response, 200, { ok: true, service: config.serviceName, activeProviderId: config.activeProviderId,
          providers: config.providers.map((item) => { const adapter = providers.get(item.id)!.adapter; return { id: item.id, label: item.label, capabilities: adapter.capabilities, reasoningEfforts: adapter.reasoningEfforts, clientTools: adapter.capabilities.includes("tools") ? [...CLIENT_TOOL_NAMES] : [] }; }), capabilities: capabilityStatus(engawa.ok) }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/life/overview") {
        const days = Math.max(1, Math.min(31, Number.parseInt(url.searchParams.get("days") || "14", 10) || 14));
        const items = await optionalJson<LifeOverviewItem[]>(config.lifeFile, []);
        const cutoff = Date.now() + days * 86_400_000;
        json(response, 200, Array.isArray(items) ? items.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.startAt === "string" && !Number.isNaN(Date.parse(item.startAt)) && Date.parse(item.startAt) <= cutoff) : []); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/companion/mood") {
        const mood = await optionalJson<MoodSnapshot | null>(config.moodFile, null);
        const validMood = mood && typeof mood.title === "string" && typeof mood.detail === "string" && typeof mood.updatedAt === "string" && !Number.isNaN(Date.parse(mood.updatedAt)) && typeof mood.sourceLabel === "string" && Boolean(mood.sourceLabel.trim());
        json(response, 200, validMood ? mood : null); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/reading/engawa/status") {
        json(response, 200, await engawaStatus(config.engawaUrl, fetcher)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/reading/engawa/action") {
        const requestBody = await body(request) as { tool?: unknown; arguments?: unknown };
        const tool = typeof requestBody?.tool === "string" ? requestBody.tool : "";
        const args = requestBody?.arguments && typeof requestBody.arguments === "object" && !Array.isArray(requestBody.arguments) ? requestBody.arguments as Record<string, unknown> : {};
        json(response, 200, await engawaAction(config.engawaUrl, tool, args, fetcher)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/cobrowse/comment") {
        const requestBody = await body(request) as { url?: unknown; note?: unknown; providerId?: unknown };
        const link = typeof requestBody?.url === "string" ? requestBody.url.trim() : "";
        const note = typeof requestBody?.note === "string" ? requestBody.note.trim() : "";
        if (!link || link.length > 2_000 || note.length > 4_000) { detail(response, 400, "一起看的链接或留言不完整"); return; }
        let inspection;
        try { inspection = await inspectCobrowseUrl(link, fetcher); }
        catch (cause) { detail(response, 400, cause instanceof Error ? cause.message : "链接无法读取"); return; }
        if (inspection.status !== "read") { detail(response, 422, inspection.detail); return; }
        const requestedProvider = typeof requestBody.providerId === "string" ? requestBody.providerId as ProviderKind : undefined;
        const selectedId: ProviderKind | undefined = requestedProvider && providers.has(requestedProvider) ? requestedProvider : config.activeProviderId || undefined;
        const selected = selectedId ? providers.get(selectedId) : undefined;
        if (!selected) { detail(response, 503, "当前 relay 没有配置可评论的模型"); return; }
        const controller = new AbortController(); request.once("aborted", () => controller.abort());
        let comment = "";
        const system = "你正在和用户一起看一个已由 relay 读取的公开链接。只根据提供的标题与摘要自然评论；若信息有限就明确说有限。不要声称看见图片、视频、评论区或摘要没有写出的细节。";
        const user = `${inspectionContext([inspection])}\n\n用户想对你说：${note || "一起看看这个。"}`;
        for await (const event of selected.adapter.stream(system, user, controller.signal, { reasoningEffort: "none", enabledTools: [] })) if (event.type === "text") comment += event.text;
        if (!comment.trim()) { detail(response, 502, "模型没有返回可保存的共看评论"); return; }
        json(response, 200, { inspection, comment: comment.trim(), sourceLabel: `${config.serviceName} · ${inspection.sourceLabel}`, modelLabel: selected.adapter.modelLabel }); return;
      }
      if (request.method === "GET" && url.pathname === "/v1/voice/status") {
        json(response, 200, { ok: config.voiceProviders.length > 0, service: config.serviceName, activeProviderId: config.activeVoiceProviderId,
          providers: config.voiceProviders.map((item) => ({ id: item.id, label: item.label, configured: true, voice: item.voice, model: item.model })),
          detail: config.voiceProviders.length ? "语音密钥保留在 relay 服务端" : "在 relay 环境变量中配置 ElevenLabs、豆包或自定义语音服务",
        }); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/voice/transcribe") {
        const requestBody = await body(request, 3_400_000) as Partial<VoiceAudioInput>;
        if (!requestBody || requestBody.encoding !== "pcm_s16le" || requestBody.sampleRate !== 16000 || typeof requestBody.audioBase64 !== "string" || requestBody.audioBase64.length > 3_300_000 || (requestBody.providerId !== undefined && !["elevenlabs", "doubao", "custom"].includes(requestBody.providerId))) { detail(response, 400, "Voice transcription request is invalid or too large"); return; }
        const provider = voiceProvider(config.voiceProviders, requestBody.providerId, config.activeVoiceProviderId);
        const controller = new AbortController(); request.once("aborted", () => controller.abort()); response.once("close", () => { if (!response.writableEnded) controller.abort(); });
        json(response, 200, await transcribeVoice(provider, requestBody as VoiceAudioInput, fetcher, controller.signal)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/voice/synthesize") {
        const requestBody = await body(request) as { text?: unknown; providerId?: unknown };
        const text = typeof requestBody?.text === "string" ? requestBody.text.trim() : "";
        const providerId = typeof requestBody?.providerId === "string" && ["elevenlabs", "doubao", "custom"].includes(requestBody.providerId) ? requestBody.providerId as VoiceProviderId : undefined;
        if (!text || text.length > 4_000) { detail(response, 400, "Voice synthesis text is invalid or too large"); return; }
        const provider = voiceProvider(config.voiceProviders, providerId, config.activeVoiceProviderId);
        const controller = new AbortController(); request.once("aborted", () => controller.abort()); response.once("close", () => { if (!response.writableEnded) controller.abort(); });
        json(response, 200, await synthesizeVoice(provider, text, fetcher, controller.signal)); return;
      }
      if (request.method === "POST" && url.pathname === "/v1/chat/stream") {
        const requestBody = await body(request);
        if (!validChat(requestBody)) { detail(response, 400, "Chat request fields are invalid or too large"); return; }
        const cached = completed.get(requestBody.clientMessageId);
        response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        if (cached) { streamEvent(response, { type: "done", content: cached.content, modelLabel: cached.modelLabel, sourceLabel: config.serviceName, toolTrace: [], clientActions: cached.clientActions }); response.end(); return; }
        if (inflight.has(requestBody.clientMessageId)) { streamEvent(response, { type: "error", message: "这条消息正在处理中", retryable: true }); response.end(); return; }
        const requestedProvider = requestBody.providerId as ProviderKind | undefined;
        const selectedId: ProviderKind | undefined = requestedProvider && providers.has(requestedProvider) ? requestedProvider : config.activeProviderId || undefined;
        const selected = selectedId ? providers.get(selectedId) : undefined;
        if (!selected) { streamEvent(response, { type: "error", message: "当前 relay 没有配置可用的 provider", retryable: false }); response.end(); return; }
        inflight.add(requestBody.clientMessageId);
        const controller = new AbortController();
        request.once("aborted", () => controller.abort());
        response.once("close", () => { if (!response.writableEnded) controller.abort(); });
        let content = ""; let streamedText = false; const clientActions: ClientToolAction[] = [];
        try {
          const inspections: Awaited<ReturnType<typeof inspectCobrowseUrl>>[] = [];
          for (const link of supportedCobrowseUrls(requestBody.input)) {
            try { inspections.push(await inspectCobrowseUrl(link, fetcher, controller.signal)); }
            catch (cause) { inspections.push({ status: "blocked" as const, requestedUrl: link, finalUrl: link, sourceLabel: "公开链接", title: "没有读到公开正文", summary: "", detail: cause instanceof Error ? cause.message : "链接读取失败" }); }
          }
          const prompt = buildPrompt(inspections.length ? { ...requestBody, input: `${requestBody.input}${inspectionContext(inspections)}` } : requestBody);
          for await (const event of selected.adapter.stream(prompt.system, prompt.user, controller.signal, { ...(requestBody.reasoningEffort ? { reasoningEffort: requestBody.reasoningEffort } : {}), ...(requestBody.enabledTools ? { enabledTools: requestBody.enabledTools } : {}) })) {
            if (event.type === "text") { content += event.text; streamedText = true; streamEvent(response, { type: "delta", delta: event.text }); }
            else clientActions.push(event.action);
          }
          if (!content.trim() && clientActions.length) content = "我已经把这件事交给小手机执行，结果会显示在这句话下面。";
          completed.set(requestBody.clientMessageId, { content, modelLabel: selected.adapter.modelLabel, clientActions });
          if (completed.size > 1_000) completed.delete(completed.keys().next().value as string);
          streamEvent(response, { type: "done", ...(!streamedText ? { content } : {}), modelLabel: selected.adapter.modelLabel, sourceLabel: config.serviceName, toolTrace: [], clientActions });
        } catch (cause) {
          if (!controller.signal.aborted) streamEvent(response, { type: "error", message: cause instanceof ProviderError ? cause.message : "Provider request failed", retryable: true });
        } finally { inflight.delete(requestBody.clientMessageId); response.end(); }
        return;
      }
      detail(response, 404, "Route not found");
    } catch (cause) {
      const status = cause instanceof ProviderError ? cause.status : 500;
      detail(response, status, cause instanceof ProviderError ? cause.message : "Relay request failed");
    }
  });
  const liveVoiceServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://relay.local");
    if (url.pathname !== "/v1/voice/live" || !originAllowed(request, config)) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    if (config.accessCode) {
      const token = cookie(request, "fuyue_session"); const expiresAt = sessions.get(token) || 0;
      if (!token || expiresAt <= Date.now()) { if (token) sessions.delete(token); socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    }
    const doubao = config.voiceProviders.find((item) => item.id === "doubao");
    if (!doubao) { socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    liveVoiceServer.handleUpgrade(request, socket, head, (client) => bridgeDoubaoLiveCall(client, doubao));
  });
  return {
    server,
    listen: () => new Promise<AddressInfo>((resolve, reject) => {
      server.once("error", reject); server.listen(config.port, config.host, () => resolve(server.address() as AddressInfo));
    }),
  };
}
