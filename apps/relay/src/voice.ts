import WebSocket from "ws";
import type { VoiceAudioInput, VoiceProviderId, VoiceSynthesis, VoiceTranscript } from "@fuyue/core";
import type { VoiceProviderConfig } from "./config.js";
import { ProviderError } from "./providers.js";

const AUDIO_LIMIT = 2_400_000;
const PERFORMANCE_CUE = /\[([^\[\]\r\n]{1,80})\]|【([^【】\r\n]{1,80})】/g;

function cleanPerformanceText(text: string): string {
  return text.replace(PERFORMANCE_CUE, " ").replace(/[ \t]{2,}/g, " ").trim();
}

export function elevenLabsSpeechText(text: string, model: string): string {
  // Eleven v3 interprets inline audio tags. Other models may pronounce them,
  // so the relay strips all stage directions even if a client forgets to.
  return model.trim().toLowerCase().startsWith("eleven_v3") ? text.trim() : cleanPerformanceText(text);
}

function decodedAudio(input: VoiceAudioInput): Buffer {
  if (input.encoding !== "pcm_s16le" || input.sampleRate !== 16000 || typeof input.audioBase64 !== "string") throw new ProviderError("录音格式必须是 16kHz 单声道 PCM", 400);
  const audio = Buffer.from(input.audioBase64, "base64");
  if (audio.length < 1_600) throw new ProviderError("这段录音太短，再说一次试试", 400);
  if (audio.length > AUDIO_LIMIT) throw new ProviderError("单次语音最长约 75 秒", 413);
  return audio;
}

function chunks(audio: Buffer, size = 16_000): Buffer[] {
  const result: Buffer[] = [];
  for (let offset = 0; offset < audio.length; offset += size) result.push(audio.subarray(offset, Math.min(audio.length, offset + size)));
  return result;
}

function wavFromPcm(pcm: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try { const data = await response.json() as { detail?: string; message?: string }; return data.detail || data.message || fallback; }
  catch { return fallback; }
}

function socketTurn<T>({ url, headers, signal, timeoutMs = 45_000, onOpen, onEvent }: {
  url: string; headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number;
  onOpen: (socket: WebSocket) => void; onEvent: (event: Record<string, unknown>, socket: WebSocket, finish: (result: T) => void, fail: (error: Error) => void) => void;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(url, headers ? { headers } : undefined);
    const finish = (result: T) => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); resolve(result); };
    const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); reject(error); };
    const timer = setTimeout(() => fail(new ProviderError("语音服务等待超时", 504)), timeoutMs);
    const abort = () => fail(new ProviderError("通话已停止", 499));
    signal?.addEventListener("abort", abort, { once: true });
    socket.once("open", () => { try { onOpen(socket); } catch (cause) { fail(cause instanceof Error ? cause : new Error("Voice socket failed")); } });
    socket.on("message", (raw) => {
      try {
        const value = JSON.parse(raw.toString()) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) onEvent(value as Record<string, unknown>, socket, finish, fail);
      } catch (cause) { fail(cause instanceof Error ? cause : new Error("Voice socket returned invalid JSON")); }
    });
    socket.once("error", (error) => fail(new ProviderError(error.message || "语音服务无法连接", 502)));
    socket.once("close", () => { signal?.removeEventListener("abort", abort); if (!settled) fail(new ProviderError("语音服务提前断开", 502)); });
  });
}

async function elevenToken(config: VoiceProviderConfig, fetcher: typeof fetch, kind: "realtime_scribe" | "tts_websocket", signal?: AbortSignal): Promise<string> {
  const response = await fetcher(`https://api.elevenlabs.io/v1/single-use-token/${kind}`, { method: "POST", headers: { "xi-api-key": config.apiKey }, ...(signal ? { signal } : {}) });
  if (!response.ok) throw new ProviderError(await responseMessage(response, "ElevenLabs 没有接受这个 Key"), response.status);
  const data = await response.json() as { token?: unknown };
  if (typeof data.token !== "string" || !data.token) throw new ProviderError("ElevenLabs 没有返回临时语音凭据", 502);
  return data.token;
}

async function transcribeElevenLabs(config: VoiceProviderConfig, audio: Buffer, fetcher: typeof fetch, signal?: AbortSignal): Promise<string> {
  const token = await elevenToken(config, fetcher, "realtime_scribe", signal);
  const url = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
  url.searchParams.set("model_id", "scribe_v2_realtime"); url.searchParams.set("audio_format", "pcm_16000"); url.searchParams.set("commit_strategy", "manual"); url.searchParams.set("token", token);
  return socketTurn<string>({ url: url.toString(), ...(signal ? { signal } : {}), onOpen: (socket) => {
    const parts = chunks(audio);
    for (let index = 0; index < parts.length; index++) socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: parts[index]!.toString("base64"), sample_rate: 16000, ...(index === parts.length - 1 ? { commit: true } : {}) }));
  }, onEvent: (event, _socket, finish, fail) => {
    const type = String(event.message_type || "");
    if (type === "committed_transcript") { const text = String(event.text || "").trim(); if (text) finish(text); else fail(new ProviderError("这次没有听清，再说一次试试", 422)); }
    else if (["auth_error", "quota_exceeded", "rate_limited", "input_error", "transcriber_error", "invalid_request", "error"].includes(type)) fail(new ProviderError(String(event.error || event.message || "ElevenLabs 转写失败"), 502));
  } });
}

function doubaoSession(config: VoiceProviderConfig, instructions = "只负责语音识别与语音合成；最终回复由外部伴侣模型提供。"): Record<string, unknown> {
  return { type: "session.create", event_id: `event_${crypto.randomUUID()}`, session: { id: crypto.randomUUID(), model: config.model, instructions: instructions.trim().slice(0, 10_000) || "你正在进行一通自然的中文电话。说话简短，允许对方随时插话。", audio: { input: { format: { type: "pcm", rate: 16000 } }, output: { format: { type: "pcm_s16le", rate: 24000 }, voice: config.voice } }, tools: [] }, extension: { asr: { extra: {} }, tts: { extra: {} }, dialog: { extra: { enable_music: false } } } };
}

export function bridgeDoubaoLiveCall(client: WebSocket, config: VoiceProviderConfig): void {
  let upstream: WebSocket | null = null;
  let started = false;
  let closed = false;
  const closeBoth = () => {
    if (closed) return; closed = true;
    try { upstream?.close(); } catch {}
    try { client.close(); } catch {}
  };
  const clientError = (message: string) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "error", message }));
  };
  client.on("message", (raw) => {
    let message: Record<string, unknown>;
    try { const value = JSON.parse(raw.toString()) as unknown; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); message = value as Record<string, unknown>; }
    catch { clientError("实时电话消息格式不完整"); return; }
    const type = String(message.type || "");
    if (!started) {
      if (type !== "start") { clientError("实时电话握手不完整"); closeBoth(); return; }
      const instructions = typeof message.instructions === "string" ? message.instructions : "";
      if (instructions.length > 10_000) { clientError("电话上下文过长"); closeBoth(); return; }
      started = true;
      upstream = new WebSocket(config.endpoint, { headers: { "X-Api-Key": config.apiKey } });
      upstream.once("open", () => upstream?.send(JSON.stringify(doubaoSession(config, instructions))));
      upstream.on("message", (providerRaw) => { if (client.readyState === WebSocket.OPEN) client.send(providerRaw.toString()); });
      upstream.once("error", () => { clientError("语音供应商全双工连接中断"); closeBoth(); });
      upstream.once("close", () => closeBoth());
      return;
    }
    if (!upstream || upstream.readyState !== WebSocket.OPEN) { clientError("实时语音尚未接通"); return; }
    if (type === "input_audio_buffer.append") {
      const audio = typeof message.audio === "string" ? message.audio : "";
      if (!audio || audio.length > 100_000 || Buffer.from(audio, "base64").length > 65_536) { clientError("实时音频块大小不合法"); return; }
      upstream.send(JSON.stringify({ type, event_id: `event_${crypto.randomUUID()}`, audio })); return;
    }
    if (type === "speech_text_buffer.commit") {
      const text = typeof message.text === "string" ? message.text.trim() : "";
      if (!text || text.length > 8_000) { clientError("这轮电话回复太长或为空"); return; }
      upstream.send(JSON.stringify({ type, event_id: `event_${crypto.randomUUID()}`, speech_id: crypto.randomUUID(), text })); return;
    }
    if (type === "input_audio_buffer.commit" || type === "response.cancel" || type === "session.close") {
      upstream.send(JSON.stringify({ type, event_id: `event_${crypto.randomUUID()}` }));
      if (type === "session.close") closeBoth();
      return;
    }
    clientError("实时电话不允许转发这类指令");
  });
  client.once("error", closeBoth);
  client.once("close", closeBoth);
}

async function transcribeDoubao(config: VoiceProviderConfig, audio: Buffer, signal?: AbortSignal): Promise<string> {
  return socketTurn<string>({ url: config.endpoint, headers: { "X-Api-Key": config.apiKey }, ...(signal ? { signal } : {}), onOpen: (socket) => socket.send(JSON.stringify(doubaoSession(config))), onEvent: (event, socket, finish, fail) => {
    const type = String(event.type || "");
    if (type === "session.created") { for (const part of chunks(audio)) socket.send(JSON.stringify({ type: "input_audio_buffer.append", event_id: `event_${crypto.randomUUID()}`, audio: part.toString("base64") })); socket.send(JSON.stringify({ type: "input_audio_buffer.commit", event_id: `event_${crypto.randomUUID()}` })); }
    else if (type === "conversation.item.input_audio_transcription.completed") { const text = String(event.transcript || event.text || "").trim(); if (text) finish(text); else fail(new ProviderError("这次没有听清，再说一次试试", 422)); }
    else if (type === "conversation.item.input_audio_transcription.failed" || type === "error") fail(new ProviderError(String(event.message || "豆包转写失败"), 502));
  } });
}

async function synthesizeElevenLabs(config: VoiceProviderConfig, text: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<VoiceSynthesis> {
  const speechText = elevenLabsSpeechText(text, config.model);
  const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voice)}/stream?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": config.apiKey, Accept: "audio/mpeg", "Content-Type": "application/json" },
    body: JSON.stringify({ text: speechText, model_id: config.model, ...(/[\u3400-\u9fff]/.test(speechText) ? { language_code: "zh" } : {}) }), ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new ProviderError(await responseMessage(response, "ElevenLabs 语音合成失败"), response.status);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 512) throw new ProviderError("ElevenLabs 返回的语音不完整", 502);
  return { audioBase64: audio.toString("base64"), mediaType: "audio/mpeg", providerId: "elevenlabs", providerLabel: config.label };
}

async function synthesizeDoubao(config: VoiceProviderConfig, text: string, signal?: AbortSignal): Promise<VoiceSynthesis> {
  const pcm = await socketTurn<Buffer>({ url: config.endpoint, headers: { "X-Api-Key": config.apiKey }, ...(signal ? { signal } : {}), onOpen: (socket) => socket.send(JSON.stringify(doubaoSession(config))), onEvent: (() => {
    const audio: Buffer[] = [];
    return (event: Record<string, unknown>, socket: WebSocket, finish: (result: Buffer) => void, fail: (error: Error) => void) => {
      const type = String(event.type || "");
      if (type === "session.created") socket.send(JSON.stringify({ type: "speech_text_buffer.commit", event_id: `event_${crypto.randomUUID()}`, speech_id: crypto.randomUUID(), text }));
      else if (type === "response.output_audio.delta") { const encoded = String(event.delta || ""); if (encoded) audio.push(Buffer.from(encoded, "base64")); }
      else if (type === "response.output_audio.done") { const joined = Buffer.concat(audio); if (joined.length < 512) fail(new ProviderError("豆包返回的语音不完整", 502)); else finish(joined); }
      else if (type === "error") fail(new ProviderError(String(event.message || "豆包语音合成失败"), 502));
    };
  })() });
  return { audioBase64: wavFromPcm(pcm).toString("base64"), mediaType: "audio/wav", providerId: "doubao", providerLabel: config.label };
}

async function customJson(config: VoiceProviderConfig, endpoint: string, payload: unknown, fetcher: typeof fetch, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetcher(endpoint, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) }, body: JSON.stringify(payload), ...(signal ? { signal } : {}) });
  if (!response.ok) throw new ProviderError(await responseMessage(response, "自定义语音服务请求失败"), response.status);
  const data = await response.json() as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ProviderError("自定义语音服务返回格式不完整", 502);
  return data as Record<string, unknown>;
}

export function voiceProvider(providers: VoiceProviderConfig[], requested: VoiceProviderId | undefined, active: VoiceProviderId | ""): VoiceProviderConfig {
  const provider = providers.find((item) => item.id === requested) || providers.find((item) => item.id === active) || providers[0];
  if (!provider) throw new ProviderError("还没有配置 ElevenLabs、豆包或自定义语音服务", 422);
  return provider;
}

export async function transcribeVoice(config: VoiceProviderConfig, input: VoiceAudioInput, fetcher: typeof fetch, signal?: AbortSignal): Promise<VoiceTranscript> {
  const audio = decodedAudio(input); let text = "";
  if (config.id === "elevenlabs") text = await transcribeElevenLabs(config, audio, fetcher, signal);
  else if (config.id === "doubao") text = await transcribeDoubao(config, audio, signal);
  else { const data = await customJson(config, config.sttEndpoint || "", input, fetcher, signal); text = String(data.text || data.transcript || "").trim(); }
  if (!text) throw new ProviderError("语音服务没有返回可保存的转写", 502);
  return { text, providerId: config.id, providerLabel: config.label };
}

export async function synthesizeVoice(config: VoiceProviderConfig, text: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<VoiceSynthesis> {
  const safeText = text.trim().slice(0, 4_000); if (!safeText) throw new ProviderError("没有可合成的文字", 400);
  if (config.id === "elevenlabs") return synthesizeElevenLabs(config, safeText, fetcher, signal);
  if (config.id === "doubao") return synthesizeDoubao(config, safeText, signal);
  const data = await customJson(config, config.ttsEndpoint || "", { text: safeText, voice: config.voice, model: config.model }, fetcher, signal);
  const audioBase64 = typeof data.audioBase64 === "string" ? data.audioBase64 : ""; const mediaType = data.mediaType === "audio/wav" ? "audio/wav" : "audio/mpeg";
  if (audioBase64.length < 16) throw new ProviderError("自定义语音服务没有返回音频", 502);
  return { audioBase64, mediaType, providerId: "custom", providerLabel: config.label };
}
