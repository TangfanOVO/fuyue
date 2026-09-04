import { ArrowLeft, CaretDown, CaretUp, CheckCircle, ClockCounterClockwise, FloppyDisk, GearSix, Microphone, MicrophoneSlash, PaperPlaneRight, PhoneCall, PhoneDisconnect, Play, SpinnerGap, Stop, WarningCircle, Waveform, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  GatewayError, hasVoiceGateway,
  type ClientToolAction, type CompanionGateway, type Conversation, type GatewayStatus, type LifeOverviewItem, type LocalDataRepository, type MemoryItem, type Message, type MessageAttachment, type PersonProfile, type ReasoningEffort, type RoomEntry, type VoiceAudioInput, type VoiceGateway, type VoiceProviderId, type VoiceStatus,
} from "@fuyue/core";
import { ENABLED_CLIENT_TOOLS, executeClientActions } from "./client-tools";
import { startBrowserLiveCall, type BrowserLiveCallController } from "./browser-live-call";
import { cancelNativeLiveResponse, clearNativeVoice, configureNativeVoice, nativeVoiceState, onNativeLiveCallEvent, requestNativeMicrophone, setNativeLiveMuted, speakNativeLiveText, startNativeLiveCall, stopNativeLiveCall, type NativeLiveCallEvent, type NativeVoiceConfiguration, type NativeVoiceState } from "./native-gateway";
import { cleanVoicePerformance, mergeStreamingText, performanceSourceSuffix, prepareElevenV3Speech } from "./voice-performance.js";
import { ProfileAvatar } from "./profile-avatar";

type CallStage = "idle" | "connecting" | "live" | "listening" | "transcribing" | "thinking" | "tools" | "speaking";
type VoiceLanguage = "zh" | "en";
type CallView = "dial" | "records";
type CallTurn = { id: string; user: string; companion: string; toolTrace?: NonNullable<Message["toolTrace"]>; audioDataUrl?: string; createdAt: string; mode: "microphone" | "typed" | "full_duplex" };
type CallRecord = { id: string; startedAt: string; endedAt: string; messages: Message[]; turns: number; hasAudio: boolean; label: string };
type RecorderSession = { context: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode; processor: AudioWorkletNode; chunks: Int16Array[]; timer: number };
const effortLabels: Record<ReasoningEffort, string> = { auto: "跟随模型", none: "直接回答", low: "轻想", medium: "适中", high: "深入", xhigh: "更深入", max: "最深" };

async function createPcmCapture(context: AudioContext, frameSize: number, onFrame: (frame: Float32Array) => void): Promise<AudioWorkletNode> {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") throw new Error("这台设备没有 AudioWorklet，请改用轮流语音模式");
  await context.audioWorklet.addModule("/fuyue-pcm-capture.js");
  const node = new AudioWorkletNode(context, "fuyue-pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { frameSize } });
  node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onFrame(new Float32Array(event.data));
  return node;
}

function formatCallClock(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatCallDate(value: string): string {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function groupedCallRecords(messages: Message[]): CallRecord[] {
  const phoneMessages = messages.filter((message) => message.sourceLabel.includes("电话")).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-240);
  const records: CallRecord[] = [];
  for (const message of phoneMessages) {
    const previous = records.at(-1); const at = Date.parse(message.createdAt); const previousAt = previous ? Date.parse(previous.endedAt) : 0;
    if (!previous || !Number.isFinite(at) || !Number.isFinite(previousAt) || at - previousAt > 15 * 60_000) {
      records.push({ id: message.id, startedAt: message.createdAt, endedAt: message.createdAt, messages: [message], turns: message.role === "companion" ? 1 : 0, hasAudio: message.attachments.some((item) => item.mediaType.startsWith("audio/")), label: message.sourceLabel.includes("全双工") ? "实时全双工" : message.sourceLabel.includes("文字") ? "文字试话" : "语音通话" });
      continue;
    }
    previous.messages.push(message); previous.endedAt = message.createdAt;
    if (message.role === "companion") previous.turns += 1;
    if (message.attachments.some((item) => item.mediaType.startsWith("audio/"))) previous.hasAudio = true;
    if (message.sourceLabel.includes("全双工")) previous.label = "实时全双工";
  }
  return records.reverse();
}

function downsample(input: Float32Array, inputRate: number, outputRate = 16_000): Int16Array {
  if (outputRate >= inputRate) { const direct = new Int16Array(input.length); for (let index = 0; index < input.length; index++) direct[index] = Math.max(-1, Math.min(1, input[index] || 0)) * 0x7fff; return direct; }
  const ratio = inputRate / outputRate; const length = Math.max(1, Math.round(input.length / ratio)); const result = new Int16Array(length);
  for (let output = 0; output < length; output++) {
    const start = Math.round(output * ratio); const end = Math.min(input.length, Math.round((output + 1) * ratio)); let sum = 0; let count = 0;
    for (let index = start; index < end; index++) { sum += input[index] || 0; count++; }
    result[output] = Math.max(-1, Math.min(1, count ? sum / count : 0)) * 0x7fff;
  }
  return result;
}

function joinedPcm(chunks: Int16Array[]): Uint8Array {
  const samples = chunks.reduce((sum, item) => sum + item.length, 0); const output = new Uint8Array(samples * 2); const view = new DataView(output.buffer); let offset = 0;
  for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2; }
  return output;
}

function base64(bytes: Uint8Array): string {
  let value = ""; const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) value += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + size)));
  return btoa(value);
}

function wav(bytes: Uint8Array, sampleRate = 16_000): Uint8Array {
  const output = new Uint8Array(44 + bytes.length); const view = new DataView(output.buffer); const write = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) output[offset + index] = value.charCodeAt(index); };
  write(0, "RIFF"); view.setUint32(4, 36 + bytes.length, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, bytes.length, true); output.set(bytes, 44); return output;
}

function audioAttachment(pcm: Uint8Array): MessageAttachment {
  const bytes = wav(pcm); return { id: crypto.randomUUID(), name: `电话录音-${new Date().toISOString().replaceAll(":", "-")}.wav`, mediaType: "audio/wav", byteSize: bytes.length, dataUrl: `data:audio/wav;base64,${base64(bytes)}` };
}

function currentCallHistory(turns: CallTurn[]) {
  return turns.slice(-8).flatMap((turn) => [
    { role: "user" as const, content: turn.user, createdAt: turn.createdAt, source: "local_manual" as const, sourceLabel: "本通电话", modelLabel: "" },
    { role: "companion" as const, content: turn.toolTrace?.length ? `${turn.companion}\n[本机工具审计结果]\n${turn.toolTrace.map((item) => `- ${item.status === "success" ? "成功" : "失败"}：${item.summary}`).join("\n")}` : turn.companion, createdAt: turn.createdAt, source: "relay" as const, sourceLabel: "本通电话", modelLabel: "" },
  ]);
}

function fallbackPerson(id: "user" | "companion", displayName: string): PersonProfile { return { id, displayName, signature: "", avatarDataUrl: null, bio: "", voiceNotes: "", updatedAt: new Date(0).toISOString() }; }

export function VoiceCallPanel({ repository, conversation, messages, people, memories, roomEntries, calendarItems, companionName, chatGateway, voiceGateway, gatewayStatus, nativeAvailable, relayUrl, relaySessionToken, onBack, onChange, onDeviceChange, onOpenConnection }: {
  repository: LocalDataRepository; conversation: Conversation; messages: Message[]; people: PersonProfile[]; memories: MemoryItem[]; roomEntries: RoomEntry[]; calendarItems: LifeOverviewItem[]; companionName: string;
  chatGateway: CompanionGateway | null; voiceGateway: VoiceGateway | null; gatewayStatus: GatewayStatus | null; nativeAvailable: boolean;
  relayUrl: string; relaySessionToken: string;
  onBack: () => void; onChange: () => Promise<void>; onDeviceChange: () => Promise<void>; onOpenConnection: () => void;
}) {
  const [stage, setStage] = useState<CallStage>("idle"); const [status, setStatus] = useState<VoiceStatus | null>(null); const [nativeState, setNativeState] = useState<NativeVoiceState | null>(null);
  const [statusError, setStatusError] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [partial, setPartial] = useState(""); const [turns, setTurns] = useState<CallTurn[]>([]); const [typedInput, setTypedInput] = useState("");
  const [callView, setCallView] = useState<CallView>("dial"); const [settingsOpen, setSettingsOpen] = useState(false); const [transcriptOpen, setTranscriptOpen] = useState(false); const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false); const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [provider, setProvider] = useState<VoiceProviderId>("elevenlabs"); const [apiKey, setApiKey] = useState(""); const [voice, setVoice] = useState(""); const [model, setModel] = useState("eleven_v3");
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() => window.localStorage.getItem("fuyue-public-voice-language") === "en" ? "en" : "zh");
  const [endpoint, setEndpoint] = useState("wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue"); const [sttEndpoint, setSttEndpoint] = useState(""); const [ttsEndpoint, setTtsEndpoint] = useState(""); const [configuring, setConfiguring] = useState(false); const [advanced, setAdvanced] = useState(false);
  const [keepRecordings, setKeepRecordings] = useState(() => window.localStorage.getItem("fuyue-public-keep-call-audio") !== "false");
  const [directDuplex, setDirectDuplex] = useState(() => window.localStorage.getItem("fuyue-public-direct-duplex") !== "false");
  const [providerId, setProviderId] = useState(() => window.localStorage.getItem("fuyue-public-provider") || ""); const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => (window.localStorage.getItem("fuyue-public-reasoning") as ReasoningEffort | null) || "auto");
  const recorderRef = useRef<RecorderSession | null>(null); const abortRef = useRef<AbortController | null>(null); const audioRef = useRef<HTMLAudioElement | null>(null);
  const callTurnsRef = useRef<CallTurn[]>([]);
  const liveTurnRef = useRef<{ userText: string; replyText: string; userMessage: Message | null; userSave: Promise<Message> | null }>({ userText: "", replyText: "", userMessage: null, userSave: null });
  const liveEventQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nativeLiveActive = useRef(false);
  const browserLiveRef = useRef<BrowserLiveCallController | null>(null);
  const nativeLiveTimerRef = useRef<number | null>(null);
  const liveBrainAbortRef = useRef<AbortController | null>(null);
  const liveExternalSpeechRef = useRef(false);
  const callStartedAtRef = useRef(0);
  const voiceLanguageWasChosen = useRef(Boolean(window.localStorage.getItem("fuyue-public-voice-language")));
  const companion = useMemo(() => people.find((item) => item.id === "companion") || fallbackPerson("companion", companionName), [companionName, people]);
  const callRecords = useMemo(() => groupedCallRecords(messages), [messages]);
  const activeModel = gatewayStatus?.providers.find((item) => item.id === providerId) || gatewayStatus?.providers.find((item) => item.id === gatewayStatus.activeProviderId) || gatewayStatus?.providers[0];
  const reasoningOptions = activeModel?.reasoningEfforts?.length ? activeModel.reasoningEfforts : ["auto" as const];

  async function refreshVoice() {
    setStatusError("");
    try {
      if (nativeAvailable) { const next = await nativeVoiceState(); setNativeState(next); setProvider(next.provider); setVoice(next.voice); setModel(next.model || defaultModel(next.provider)); if (!voiceLanguageWasChosen.current && next.providers?.length === 1) { setVoiceLanguage(next.providers[0]?.id === "doubao" ? "zh" : "en"); voiceLanguageWasChosen.current = true; } }
      if (voiceGateway) { const next = await voiceGateway.voiceStatus(); setStatus(next); if (!voiceLanguageWasChosen.current && next.providers.length === 1) { setVoiceLanguage(next.providers[0]?.id === "doubao" ? "zh" : "en"); voiceLanguageWasChosen.current = true; } } else setStatus(null);
    } catch (cause) { setStatus(null); setStatusError(cause instanceof Error ? cause.message : "语音服务状态不可用"); }
  }
  useEffect(() => { void refreshVoice(); return () => { if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); liveBrainAbortRef.current?.abort(); void stopRecorder(false); void browserLiveRef.current?.stop(); browserLiveRef.current = null; void stopNativeLiveCall().catch(() => undefined); abortRef.current?.abort(); audioRef.current?.pause(); }; }, [voiceGateway]);
  useEffect(() => {
    if (!nativeAvailable) return;
    let listener: { remove: () => Promise<void> } | null = null; let disposed = false;
    void onNativeLiveCallEvent((event) => handleNativeLiveEvent(event)).then((handle) => { if (disposed) void handle.remove(); else listener = handle; });
    return () => { disposed = true; if (listener) void listener.remove(); };
  }, [nativeAvailable, conversation.id, companion.displayName]);
  useEffect(() => { if (providerId) window.localStorage.setItem("fuyue-public-provider", providerId); }, [providerId]);
  useEffect(() => { window.localStorage.setItem("fuyue-public-voice-language", voiceLanguage); }, [voiceLanguage]);
  useEffect(() => { if (!reasoningOptions.includes(reasoningEffort)) setReasoningEffort(reasoningOptions[0] || "auto"); else window.localStorage.setItem("fuyue-public-reasoning", reasoningEffort); }, [reasoningEffort, reasoningOptions]);
  useEffect(() => {
    if (stage === "idle") return;
    if (!callStartedAtRef.current) callStartedAtRef.current = Date.now();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1_000)));
    tick(); const timer = window.setInterval(tick, 1_000); return () => window.clearInterval(timer);
  }, [stage]);
  function defaultModel(next: VoiceProviderId) { return next === "doubao" ? "1.2.6.1" : next === "custom" ? "default" : "eleven_v3"; }
  function chooseProvider(next: VoiceProviderId) { const saved = (nativeState?.providers || status?.providers || []).find((item) => item.id === next); setProvider(next); setVoice(saved?.voice || ""); setModel(saved?.model || defaultModel(next)); setApiKey(""); setNotice(""); setError(""); }
  async function saveVoice() {
    if (!nativeAvailable || configuring) return; setConfiguring(true); setError(""); setNotice("");
    try {
      const configuration: NativeVoiceConfiguration = { provider, apiKey, voice, model, ...(provider === "doubao" ? { endpoint } : {}), ...(provider === "custom" ? { sttEndpoint, ttsEndpoint } : {}) };
      const saved = await configureNativeVoice(configuration); setNativeState(saved); setApiKey(""); if (provider === "elevenlabs" || provider === "doubao") { voiceLanguageWasChosen.current = true; setVoiceLanguage(provider === "doubao" ? "zh" : "en"); } setNotice(provider === "elevenlabs" ? `${saved.providerLabel} Key 已验证并存入 Android Keystore；Voice ID 与模型会在首次合成时实测` : `${saved.providerLabel} 配置已存入 Android Keystore；仍须完成一次真实转写或合成才能算厂商通过`); await refreshVoice();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "语音 API 没有保存成功"); } finally { setConfiguring(false); }
  }
  async function disconnectVoice() { await clearNativeVoice(); setNativeState(null); setStatus(null); setNotice("语音 Key 已从这台手机清除"); await refreshVoice(); }

  function fullDuplexInstructions(): string {
    return "只负责 16 kHz 实时语音识别和 24 kHz 语音合成；最终回复由外部伴侣模型提供。不自行承诺工具、记忆或本机操作。";
  }

  function resetCallTurns() { callTurnsRef.current = []; setTurns([]); }
  function appendCallTurn(turn: CallTurn) {
    callTurnsRef.current = [...callTurnsRef.current, turn].slice(-8);
    setTurns(callTurnsRef.current);
  }

  function handleNativeLiveEvent(event: NativeLiveCallEvent) {
    if (event.eventType === "connected") { setStage("live"); setNotice(`已连接 ${event.providerLabel || "豆包 Seeduplex"} ${event.model || ""}· 可以连续说，插话会立即停止播报`); return; }
    if (event.eventType === "transcription_started") { liveBrainAbortRef.current?.abort(); liveBrainAbortRef.current = null; liveExternalSpeechRef.current = false; liveTurnRef.current = { userText: "", replyText: "", userMessage: null, userSave: null }; setStage("live"); setPartial("正在听…"); return; }
    if (event.eventType === "transcript_delta") { liveTurnRef.current.userText = mergeStreamingText(liveTurnRef.current.userText, event.text || ""); setPartial(liveTurnRef.current.userText); return; }
    if (event.eventType === "transcript_completed") {
      const text = (event.text || liveTurnRef.current.userText).trim(); liveTurnRef.current.userText = text; setPartial(text);
      if (!text || liveTurnRef.current.userSave) return;
      const save = liveEventQueueRef.current.then(async () => {
        const message = await repository.appendMessage({ conversationId: conversation.id, role: "user", content: text, sourceLabel: "实时电话转写 · 豆包 Seeduplex" });
        liveTurnRef.current.userMessage = message; await onChange(); return message;
      });
      liveTurnRef.current.userSave = save; liveEventQueueRef.current = save.then(() => undefined); void completeLiveBrainTurn(text, save); return;
    }
    if (event.eventType === "reply_delta" || event.eventType === "reply_completed") return;
    if (event.eventType === "audio_started") { setStage("speaking"); return; }
    if (event.eventType === "turn_completed") { if (liveExternalSpeechRef.current) { liveExternalSpeechRef.current = false; setStage("live"); setPartial(""); } return; }
    if (event.eventType === "turn_canceled") { liveTurnRef.current.replyText = ""; setStage("live"); setPartial(liveTurnRef.current.userText); setNotice("她停下了，正在听你。未说完的那句不会留进原文。"); return; }
    if (event.eventType === "turn_error") { setError(event.message || "这轮实时识别失败，可以直接重说"); setStage("live"); return; }
    if (event.eventType === "error") { if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); nativeLiveTimerRef.current = null; browserLiveRef.current = null; nativeLiveActive.current = false; callStartedAtRef.current = 0; setMuted(false); setError(event.message || "实时电话连接中断"); setStage("idle"); void stopRecorder(false); return; }
    if (event.eventType === "closed") { if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); nativeLiveTimerRef.current = null; browserLiveRef.current = null; nativeLiveActive.current = false; callStartedAtRef.current = 0; setMuted(false); setStage("idle"); setPartial(""); void stopRecorder(false); }
  }

  async function completeLiveBrainTurn(text: string, userSave: Promise<Message>) {
    if (!chatGateway) { setError("当前没有可为电话组织回答的聊天模型"); return; }
    liveBrainAbortRef.current?.abort(); const controller = new AbortController(); liveBrainAbortRef.current = controller; setStage("thinking");
    try {
      const userMessage = await userSave; const reply = await modelReply(text, userMessage.id, controller, false);
      if (controller.signal.aborted) return;
      liveTurnRef.current.replyText = reply.text; setPartial(reply.text);
      await repository.appendMessage({ conversationId: conversation.id, role: "companion", content: reply.text, source: nativeAvailable ? "direct_provider" : "relay", sourceLabel: `实时全双工电话 · ${reply.sourceLabel}`, modelLabel: reply.modelLabel, toolTrace: reply.toolTrace, parentMessageId: userMessage.id });
      await onChange(); appendCallTurn({ id: crypto.randomUUID(), user: text, companion: reply.text, toolTrace: reply.toolTrace, createdAt: new Date().toISOString(), mode: "full_duplex" });
      liveExternalSpeechRef.current = true;
      if (browserLiveRef.current) browserLiveRef.current.speakText(reply.speechText); else await speakNativeLiveText(reply.speechText);
      setStage("speaking");
    } catch (cause) { liveExternalSpeechRef.current = false; if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "这轮电话回复没有完成"); setStage("live"); } }
    finally { if (liveBrainAbortRef.current === controller) liveBrainAbortRef.current = null; }
  }

  async function startNativeFullDuplex() {
    if (stage !== "idle") return; if (!chatGateway) { setError("先连接一个聊天模型，豆包只负责实时听和说。"); return; } resetCallTurns(); setError(""); setNotice(""); setPartial(""); setMuted(false); setTranscriptOpen(false); setElapsedSeconds(0); callStartedAtRef.current = Date.now(); setStage("connecting");
    try {
      if (nativeState?.microphone !== "granted") { const next = await requestNativeMicrophone(); setNativeState(next); if (next.microphone !== "granted") throw new Error("没有麦克风权限，实时电话没有开始"); }
      await startNativeLiveCall(fullDuplexInstructions()); nativeLiveActive.current = true;
      nativeLiveTimerRef.current = window.setTimeout(() => void stopEverything(), 20 * 60_000); setStage("live");
    } catch (cause) { if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); nativeLiveTimerRef.current = null; nativeLiveActive.current = false; callStartedAtRef.current = 0; await stopNativeLiveCall().catch(() => undefined); setError(cause instanceof Error ? cause.message : "实时电话没有开始"); setStage("idle"); }
  }

  async function startBrowserFullDuplex() {
    if (stage !== "idle") return; if (!chatGateway) { setError("请先连接聊天模型；实时语音服务只负责听和说。"); return; } resetCallTurns(); setError(""); setNotice(""); setPartial(""); setMuted(false); setTranscriptOpen(false); setElapsedSeconds(0); callStartedAtRef.current = Date.now(); setStage("connecting");
    try {
      const controller = await startBrowserLiveCall({ relayUrl, sessionToken: relaySessionToken, instructions: fullDuplexInstructions(), onEvent: handleNativeLiveEvent });
      browserLiveRef.current = controller; nativeLiveActive.current = true;
      nativeLiveTimerRef.current = window.setTimeout(() => void stopEverything(), 20 * 60_000); setStage("live");
    } catch (cause) { if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); nativeLiveTimerRef.current = null; browserLiveRef.current = null; nativeLiveActive.current = false; callStartedAtRef.current = 0; setError(cause instanceof Error ? cause.message : "实时电话没有开始，请检查语音服务后重试"); setStage("idle"); }
  }

  async function startPlatformFullDuplex() { if (nativeAvailable) await startNativeFullDuplex(); else await startBrowserFullDuplex(); }

  async function startRecorder() {
    if (isTrueDuplex) { await startPlatformFullDuplex(); return; }
    if (stage !== "idle") return; resetCallTurns(); setError(""); setNotice(""); setPartial(""); setMuted(false); setTranscriptOpen(false); setElapsedSeconds(0); callStartedAtRef.current = Date.now();
    if (!chatGateway) { setError("请先连接聊天模型；语音服务只负责听和说。"); return; }
    if (!voiceGateway || !selectedVoiceProvider) { setError(languageSetupMessage); return; }
    try {
      if (nativeAvailable && nativeState?.microphone !== "granted") { const next = await requestNativeMicrophone(); setNativeState(next); if (next.microphone !== "granted") throw new Error("没有麦克风权限，电话没有开始"); }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("这个浏览器没有提供麦克风录音");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const context = new AudioContext(); await context.resume(); const source = context.createMediaStreamSource(stream); const chunks: Int16Array[] = []; const processor = await createPcmCapture(context, 4096, (frame) => chunks.push(downsample(frame, context.sampleRate)));
      source.connect(processor); processor.connect(context.destination);
      const timer = window.setTimeout(() => { if (recorderRef.current) void finishTurn(); }, 60_000); recorderRef.current = { context, stream, source, processor, chunks, timer }; setStage("listening");
    } catch (cause) { callStartedAtRef.current = 0; setError(cause instanceof Error ? cause.message : "麦克风没有打开"); setStage("idle"); }
  }

  async function stopRecorder(returnAudio = true): Promise<Uint8Array | null> {
    const session = recorderRef.current; if (!session) return null; recorderRef.current = null; window.clearTimeout(session.timer); session.processor.port.onmessage = null; session.processor.disconnect(); session.source.disconnect(); session.stream.getTracks().forEach((track) => track.stop()); await session.context.close().catch(() => undefined); return returnAudio ? joinedPcm(session.chunks) : null;
  }

  function stopEverything() {
    abortRef.current?.abort(); abortRef.current = null; liveBrainAbortRef.current?.abort(); liveBrainAbortRef.current = null; liveExternalSpeechRef.current = false; audioRef.current?.pause(); audioRef.current = null; void stopRecorder(false);
    if (nativeLiveTimerRef.current !== null) window.clearTimeout(nativeLiveTimerRef.current); nativeLiveTimerRef.current = null;
    if (nativeLiveActive.current) { nativeLiveActive.current = false; if (browserLiveRef.current) { void browserLiveRef.current.stop(); browserLiveRef.current = null; } else void stopNativeLiveCall().catch(() => undefined); setNotice("电话已挂断；未完成的半截回复没有写入原文"); }
    else setNotice("这一轮已停止");
    setMuted(false); setTranscriptOpen(false); setStage("idle"); setPartial(""); callStartedAtRef.current = 0;
  }

  async function toggleNativeMute() {
    const next = !muted;
    try { if (browserLiveRef.current) browserLiveRef.current.setMuted(next); else await setNativeLiveMuted(next); setMuted(next); setNotice(next ? "麦克风已静音；她不会听见你这边。" : "已继续收音，直接说就好。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "麦克风静音没有切换成功"); }
  }

  async function interruptCompanion() {
    try { if (browserLiveRef.current) browserLiveRef.current.cancelResponse(); else await cancelNativeLiveResponse(); setStage("live"); setNotice("她停下了，正在听你。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "这次没有成功插话"); }
  }

  async function modelReply(input: string, userMessageId: string, controller: AbortController, useElevenV3Tags: boolean): Promise<{ text: string; speechText: string; performanceTags: string[]; modelLabel: string; sourceLabel: string; toolTrace: NonNullable<Message["toolTrace"]> }> {
    if (!chatGateway) throw new GatewayError("聊天模型未连接"); let collected = ""; let done = ""; let modelLabel = activeModel?.label || ""; let sourceLabel = "电话模型"; let toolTrace: NonNullable<Message["toolTrace"]> = []; let clientActions: ClientToolAction[] = [];
    const callBoundary = voiceLanguage === "en"
      ? "[Phone runtime boundary, not user-authored text] This is a live voice call. Respond directly in natural spoken English. When interrupted, briefly confirm that you stopped and keep listening. The system provides no real playback cursor, so never guess or claim an exact number, word, or sentence where playback stopped. Return only words meant to be spoken."
      : "【电话运行边界，不是用户原话】这是正在进行的语音通话。被插话时自然确认已经停下并继续听。系统没有提供真实播放游标，不得猜测或声称自己停在第几、哪个字或哪句。只回复真正要说出口的话。";
    const callInput = `${input}\n\n${callBoundary}`;
    const roomContext = roomEntries.filter((entry) => entry.status !== "archived").sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).slice(-80).map(({ room, author, title, content, subtype, status: entryStatus, occurredAt }) => ({ room, author, title, content, subtype, status: entryStatus, occurredAt }));
    for await (const item of chatGateway.streamChat({ conversationId: conversation.id, clientMessageId: userMessageId, input: callInput, locale: voiceLanguage === "en" ? "en-US" : "zh-CN", history: currentCallHistory(callTurnsRef.current), people, memories: memories.filter((memory) => memory.injectionEnabled).slice(0, 200), roomContext, calendarContext: calendarItems.slice(0, 100), ...(activeModel?.id ? { providerId: activeModel.id } : {}), reasoningEffort, enabledTools: activeModel?.capabilities.includes("tools") ? ENABLED_CLIENT_TOOLS.filter((name) => activeModel.clientTools?.includes(name)) : [], ...(useElevenV3Tags ? { speechDelivery: "eleven_v3_audio_tags" as const } : {}) }, controller.signal)) {
      if (item.type === "delta") { collected += item.delta; setPartial(cleanVoicePerformance(collected)); }
      else if (item.type === "error") throw new GatewayError(item.message);
      else { done = item.content || ""; modelLabel = item.modelLabel || modelLabel; sourceLabel = item.sourceLabel || sourceLabel; toolTrace = item.toolTrace || []; clientActions = item.clientActions || []; }
    }
    if (clientActions.length) {
      setStage("tools");
      toolTrace = [...toolTrace, ...await executeClientActions({ actions: clientActions, repository, companion, sourceLabel: activeModel?.label || "电话模型工具", input })];
      if (clientActions.some((action) => action.name === "create_calendar_event")) await onDeviceChange();
    }
    let text = (done || collected).trim();
    if (!text && toolTrace.length) { text = "模型没有返回可播放文字；本机操作结果见工具痕迹。"; sourceLabel = `${sourceLabel} · 本机审计提示`; }
    if (!text) throw new GatewayError("模型没有返回可播放的回复");
    const prepared = prepareElevenV3Speech(text);
    const performance = useElevenV3Tags ? prepared : { cleanText: prepared.cleanText, speechText: prepared.cleanText, tags: [] };
    if (!performance.cleanText) throw new GatewayError("模型只返回了语音标签，没有可入账的台词");
    return { text: performance.cleanText, speechText: performance.speechText, performanceTags: performance.tags, modelLabel, sourceLabel, toolTrace };
  }

  async function finishTurn() {
    if (stage !== "listening" || !voiceGateway) return; const pcm = await stopRecorder(); if (!pcm) { setStage("idle"); return; }
    const controller = new AbortController(); abortRef.current = controller; setStage("transcribing"); setPartial(""); setError("");
    try {
      const activeVoice = selectedVoiceProvider?.id; const input: VoiceAudioInput = { audioBase64: base64(pcm), sampleRate: 16000, encoding: "pcm_s16le", ...(activeVoice ? { providerId: activeVoice } : {}) };
      const transcript = await voiceGateway.transcribeVoice(input, controller.signal); setPartial(transcript.text);
      const userMessage = await repository.appendMessage({ conversationId: conversation.id, role: "user", content: transcript.text, sourceLabel: `电话转写 · ${transcript.providerLabel}`, ...(keepRecordings ? { attachments: [audioAttachment(pcm)] } : {}) }); await onChange();
      await completeTurn({ text: transcript.text, userMessage, voiceProviderId: transcript.providerId, controller, mode: "microphone" });
    } catch (cause) {
      setPartial(""); if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "这轮电话没有完成"); setStage("idle");
    } finally { abortRef.current = null; }
  }

  async function completeTurn({ text, userMessage, voiceProviderId, controller, mode }: { text: string; userMessage: Message; voiceProviderId: VoiceProviderId; controller: AbortController; mode: CallTurn["mode"] }) {
    if (!voiceGateway) throw new GatewayError("语音服务未连接");
    const configuredVoiceModel = voiceProviders.find((item) => item.id === voiceProviderId)?.model || "";
    const useElevenV3Tags = voiceProviderId === "elevenlabs" && configuredVoiceModel === "eleven_v3";
    setStage("thinking"); const reply = await modelReply(text, userMessage.id, controller, useElevenV3Tags);
    setStage("speaking"); setPartial(reply.text);
    const speech = await voiceGateway.synthesizeVoice(reply.speechText, voiceProviderId, controller.signal);
    const dataUrl = `data:${speech.mediaType};base64,${speech.audioBase64}`;
    await repository.appendMessage({ conversationId: conversation.id, role: "companion", content: reply.text, source: "relay", sourceLabel: `${mode === "typed" ? "电话文字试跑" : "电话"} · ${reply.sourceLabel}${performanceSourceSuffix(reply.performanceTags)}`, modelLabel: reply.modelLabel, toolTrace: reply.toolTrace, parentMessageId: userMessage.id, attachments: [{ id: crypto.randomUUID(), name: `电话回复-${new Date().toISOString().replaceAll(":", "-")}.${speech.mediaType === "audio/wav" ? "wav" : "mp3"}`, mediaType: speech.mediaType, byteSize: Math.round(speech.audioBase64.length * 0.75), dataUrl }] });
    await onChange(); appendCallTurn({ id: crypto.randomUUID(), user: text, companion: reply.text, toolTrace: reply.toolTrace, audioDataUrl: dataUrl, createdAt: new Date().toISOString(), mode });
    const player = new Audio(dataUrl); audioRef.current = player; player.onended = () => { audioRef.current = null; callStartedAtRef.current = 0; setStage("idle"); setPartial(""); }; await player.play().catch(() => { callStartedAtRef.current = 0; setNotice("回复和语音已经写入原文账本；手机拦下了自动播放，点下方播放即可。"); setStage("idle"); });
  }

  async function submitTypedTurn(event: FormEvent) {
    event.preventDefault(); const text = typedInput.trim(); if (!text || stage !== "idle") return;
    if (!chatGateway) { setError("先连接一个聊天模型。"); return; }
    if (!voiceGateway || !selectedVoiceProvider) { setError(languageSetupMessage); return; }
    const voiceProviderId = selectedVoiceProvider.id;
    const controller = new AbortController(); abortRef.current = controller; setError(""); setNotice(""); setPartial(text); setTypedInput("");
    try { const userMessage = await repository.appendMessage({ conversationId: conversation.id, role: "user", content: text, sourceLabel: "电话文字输入 · 本机" }); await onChange(); await completeTurn({ text, userMessage, voiceProviderId, controller, mode: "typed" }); }
    catch (cause) { callStartedAtRef.current = 0; setPartial(""); if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "文字试电话没有完成"); setStage("idle"); }
    finally { abortRef.current = null; }
  }

  function play(dataUrl: string) { audioRef.current?.pause(); const player = new Audio(dataUrl); audioRef.current = player; void player.play().catch(() => setError("这台手机没有接住播放请求")); }
  const voiceProviders = status?.providers?.length ? status.providers : nativeState?.providers || [];
  const desiredVoiceProviderId: VoiceProviderId = voiceLanguage === "zh" ? "doubao" : "elevenlabs";
  const selectedVoiceProvider = voiceProviders.find((item) => item.id === desiredVoiceProviderId);
  const languageSetupMessage = voiceLanguage === "zh" ? "中文语音尚未配置。到下方高级设置保存豆包 Key 与中文声音 ID。" : "English voice is not configured. Add an ElevenLabs key and English Voice ID in advanced settings.";
  const configured = Boolean(selectedVoiceProvider); const canUseDirectDuplex = voiceLanguage === "zh" && selectedVoiceProvider?.id === "doubao" && (nativeAvailable || Boolean(relayUrl)); const isTrueDuplex = canUseDirectDuplex && directDuplex;
  const stageLabel = muted ? "麦克风已静音" : stage === "connecting" ? "正在接通" : stage === "live" ? "我在听" : stage === "listening" ? "正在听你说" : stage === "transcribing" ? "正在听清" : stage === "thinking" ? `${companion.displayName} 正在想` : stage === "tools" ? `${companion.displayName} 正在调用本机工具` : stage === "speaking" ? `${companion.displayName} 正在说` : "等你拨过去";
  const activeRecord = callRecords.find((record) => record.id === selectedRecordId) || null;

  if (stage !== "idle") return <article className={`public-call-screen stage-${stage}`} aria-label={`与${companion.displayName}通话中`}>
    <div className="public-call-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <header className="public-call-screen-header"><span><i />赴约通话</span><time>{formatCallClock(elapsedSeconds)}</time></header>
    <main className="public-call-screen-main">
      <ProfileAvatar profile={companion} className="call-person-avatar" />
      <h1>{companion.displayName}</h1>
      <p className="public-call-model">{isTrueDuplex ? selectedVoiceProvider?.label || "豆包语音" : `${activeModel?.label || "聊天模型"} · ${selectedVoiceProvider?.label || "语音"}`}</p>
      <div className="public-call-listening" aria-live="polite"><span><i /><i /><i /><i /><i /></span><b>{stageLabel}</b><p>{partial || (stage === "live" ? "你开口就好，她在这里。" : "每句完整的话都会留在原文账本里。")}</p></div>
      <section className="public-call-live-transcript" aria-label="实时通话原文">
        <header><span><Waveform /><b>实时原文</b></span><button type="button" onClick={() => setTranscriptOpen(true)}>{turns.length ? `全部 ${turns.length * 2} 句` : "展开"}</button></header>
        <div>{turns.length ? turns.slice(-2).flatMap((turn) => [<p className="user" key={`${turn.id}-user`}><b>我</b><span>{turn.user}</span></p>, <p key={`${turn.id}-companion`}><b>{companion.displayName}</b><span>{turn.companion}</span></p>]) : <p className="empty">你们说完的句子会出现在这里。</p>}</div>
      </section>
      {error && <p className="public-call-error" role="alert"><WarningCircle />{error}</p>}{notice && <p className="public-call-notice" role="status">{notice}</p>}
    </main>
    <footer className="public-call-footer">
      <div className="public-call-controls">
        {nativeLiveActive.current ? stage === "speaking" ? <button onClick={() => void interruptCompanion()}><Microphone /><span>插话</span></button> : <button className={muted ? "is-on" : ""} onClick={() => void toggleNativeMute()} aria-pressed={muted}>{muted ? <MicrophoneSlash /> : <Microphone />}<span>{muted ? "继续" : "静音"}</span></button> : stage === "listening" ? <button onClick={() => void finishTurn()}><Stop /><span>说完了</span></button> : <button disabled><Microphone /><span>等一下</span></button>}
        <button className={transcriptOpen ? "is-on" : ""} onClick={() => setTranscriptOpen(true)} aria-expanded={transcriptOpen}><Waveform /><span>原文</span></button>
        <button className="hangup" onClick={stopEverything}><PhoneDisconnect /><span>挂断</span></button>
      </div>
      <small>这通电话仍在同一份赴约里</small>
    </footer>
    {transcriptOpen && <><button className="public-call-sheet-scrim" aria-label="关闭通话原文" onClick={() => setTranscriptOpen(false)} /><section className="public-call-sheet" aria-label="通话原文"><button className="public-call-sheet-handle" onClick={() => setTranscriptOpen(false)}><span>通话原文</span><X /></button><small>{turns.length ? `${turns.length * 2} 句，挂断后仍可在聊天和通话记录里找到` : "说完的话会从这里开始留下"}</small><div>{turns.length ? turns.flatMap((turn) => [<p className="user" key={`${turn.id}-sheet-user`}><b>我</b><span>{turn.user}</span></p>, <p key={`${turn.id}-sheet-companion`}><b>{companion.displayName}</b><span>{turn.companion}</span></p>]) : <p className="empty">还没有完整原文</p>}</div></section></>}
  </article>;

  return <div className="panel-content voice-call-panel"><header className="panel-header"><button data-panel-back className="icon-button quiet sticky-back" onClick={onBack} aria-label="返回"><ArrowLeft /></button><div><h1 id="panel-title">电话</h1><p>想听见彼此时，就拨过去。</p></div></header>
    <nav className="public-call-tabs" aria-label="电话页面"><button className={callView === "dial" ? "is-on" : ""} onClick={() => setCallView("dial")}><PhoneCall /><span>打电话</span></button><button className={callView === "records" ? "is-on" : ""} onClick={() => setCallView("records")}><ClockCounterClockwise /><span>通话记录</span>{callRecords.length > 0 && <small>{callRecords.length}</small>}</button></nav>
    {callView === "dial" ? <>
      <section className="public-call-dialer">
        <ProfileAvatar profile={companion} className="call-person-avatar" />
        <h2>打给{companion.displayName}</h2>
        <p>{isTrueDuplex ? "接通后直接说，对方说话时也可以插话。" : "说完一句后送出，仍由当前聊天模型和同一份记忆回答。"}</p>
        <div className="voice-language-tabs" role="group" aria-label="通话语言"><button className={voiceLanguage === "zh" ? "active" : ""} aria-pressed={voiceLanguage === "zh"} onClick={() => { voiceLanguageWasChosen.current = true; setVoiceLanguage("zh"); setError(""); }}>中文</button><button className={voiceLanguage === "en" ? "active" : ""} aria-pressed={voiceLanguage === "en"} onClick={() => { voiceLanguageWasChosen.current = true; setVoiceLanguage("en"); setError(""); }}>English</button></div>
        <div className={`public-call-voice-state ${configured ? "is-ready" : ""}`}><span><i /><b>{selectedVoiceProvider?.label || (voiceLanguage === "zh" ? "中文声音未设置" : "English voice not set")}</b></span><small>{configured ? isTrueDuplex ? "实时全双工" : "轮流语音" : "在语音设置中完成"}</small></div>
        <button className="public-call-start" disabled={!configured || !chatGateway} onClick={() => void startRecorder()}><PhoneCall weight="fill" />拨号</button>
      </section>
      {error && <p className="form-error" role="alert"><WarningCircle />{error}</p>}{notice && <p className="save-message"><CheckCircle />{notice}</p>}
      <details className="public-call-settings" open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)}><summary><span><GearSix /><span><b>语音设置</b><small>声音、模型和 Key</small></span></span>{settingsOpen ? <CaretUp /> : <CaretDown />}</summary><div>
        <p className="call-tech-note">{isTrueDuplex ? "豆包只负责实时听和说；当前聊天模型带人物、启用记忆、本通电话原文、已选日历和白名单工具组织回答。" : "默认由当前聊天模型组织回答，可读人物、记忆、本通电话原文和已选日历、调用本机工具，再交给当前声音。"}</p>
        {!isTrueDuplex && (gatewayStatus?.ok ? <div className="call-selectors"><label>聊天模型<select value={activeModel?.id || ""} onChange={(event) => setProviderId(event.target.value)}>{gatewayStatus.providers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>思考<select value={reasoningOptions.includes(reasoningEffort) ? reasoningEffort : reasoningOptions[0]} disabled={reasoningOptions.length < 2} onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}>{reasoningOptions.map((item) => <option value={item} key={item}>{effortLabels[item]}</option>)}</select></label></div> : <button className="secondary-button full-button" onClick={onOpenConnection}>连接聊天模型</button>)}
        {canUseDirectDuplex && <label className="call-retention"><input type="checkbox" checked={directDuplex} onChange={(event) => { setDirectDuplex(event.target.checked); window.localStorage.setItem("fuyue-public-direct-duplex", String(event.target.checked)); }} /><span><strong>豆包实时全双工</strong><small>保留当前聊天模型、人物、记忆和工具；豆包只负责听和说。</small></span></label>}
        <form className="typed-call-card" onSubmit={submitTypedTurn}><label><strong>文字试音</strong><small>不方便开麦时，打字听一次当前声音。</small><span><input value={typedInput} onChange={(event) => setTypedInput(event.target.value)} placeholder="打字给她" /><button aria-label="发送文字试音" disabled={!typedInput.trim() || !configured || !chatGateway}><PaperPlaneRight weight="fill" /></button></span></label></form>
        {nativeAvailable && <section className="voice-config-card"><header><span><small>Android Keystore</small><h2>{voiceProviders.length ? `已保存 ${voiceProviders.length} 套语音` : "添加语音"}</h2></span>{nativeState?.configured && <button className="text-button danger" onClick={() => void disconnectVoice()}>清除 Key</button>}</header>
          <div className="voice-provider-tabs" role="group" aria-label="语音供应商"><button aria-pressed={provider === "elevenlabs"} className={provider === "elevenlabs" ? "active" : ""} onClick={() => chooseProvider("elevenlabs")}>ElevenLabs</button><button aria-pressed={provider === "doubao"} className={provider === "doubao" ? "active" : ""} onClick={() => chooseProvider("doubao")}>豆包</button><button aria-pressed={provider === "custom"} className={provider === "custom" ? "active" : ""} onClick={() => chooseProvider("custom")}>其他</button></div>
          <div className="voice-config-grid"><label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder={nativeState?.configured ? "更换时重新粘贴" : "粘贴你自己的 Key"} /></label><label>Voice ID<input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder={provider === "doubao" ? "豆包声音 ID" : provider === "custom" ? "自定义 Voice ID" : "ElevenLabs Voice ID"} /></label><label>语音模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label></div>
          {provider === "doubao" && <><button className="text-button" onClick={() => setAdvanced((current) => !current)}>{advanced ? "收起高级设置" : "双工地址"}</button>{advanced && <label>豆包 WebSocket<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label>}</>}
          {provider === "custom" && <div className="voice-config-grid"><label>STT HTTPS<input value={sttEndpoint} onChange={(event) => setSttEndpoint(event.target.value)} placeholder="https://…/stt" /></label><label>TTS HTTPS<input value={ttsEndpoint} onChange={(event) => setTtsEndpoint(event.target.value)} placeholder="https://…/tts" /></label></div>}
          <button className="primary-button full-button" disabled={!apiKey.trim() || !voice.trim() || configuring} onClick={() => void saveVoice()}>{configuring ? <SpinnerGap className="spin" /> : <FloppyDisk />}{configuring ? "正在验证" : "保存语音"}</button>
        </section>}
        <label className="call-retention"><input type="checkbox" checked={keepRecordings} disabled={isTrueDuplex} onChange={(event) => { setKeepRecordings(event.target.checked); window.localStorage.setItem("fuyue-public-keep-call-audio", String(event.target.checked)); }} /><span><strong>{isTrueDuplex ? "这条全双工链只留文字" : "保留通话录音"}</strong><small>{isTrueDuplex ? "每轮完成后保存转写和回复。" : "录音会和转写一起留在本机。"}</small></span></label>
        {statusError && <p className="form-error">{statusError}</p>}{!nativeAvailable && !status?.ok && <p className="call-tech-note">网页版需要先连接自己的转接服务，才能使用语音。</p>}
      </div></details>
    </> : <section className="public-call-records" aria-label="通话记录列表">
      <header><div><h2>我们的通话原文</h2><p>从同一份聊天账本整理，录到声音的还可以回放。</p></div></header>
      {callRecords.length ? <div className="public-call-record-list">{callRecords.map((record) => <div key={record.id}><button className={`public-call-record-row ${selectedRecordId === record.id ? "is-open" : ""}`} onClick={() => setSelectedRecordId((current) => current === record.id ? null : record.id)} aria-expanded={selectedRecordId === record.id}><span className="record-mark">{record.hasAudio ? <Play /> : <Waveform />}</span><span><b>{formatCallDate(record.startedAt)}</b><small>{record.label} · {record.turns} 轮</small></span><span><em>{record.hasAudio ? "可回放" : "只留原文"}</em>{selectedRecordId === record.id ? <CaretUp /> : <CaretDown />}</span></button>{selectedRecordId === record.id && activeRecord?.id === record.id && <div className="public-call-record-detail">{activeRecord.messages.map((message) => <article className={message.role} key={message.id}><b>{message.role === "user" ? "我" : companion.displayName}</b><div><p>{message.content}</p>{message.attachments.filter((item) => item.mediaType.startsWith("audio/")).map((item) => <button key={item.id} onClick={() => play(item.dataUrl)}><Play />播放这段</button>)}</div></article>)}</div>}</div>)}</div> : <p className="public-call-record-empty">下一通电话完整结束后，会从这里开始留下。</p>}
    </section>}
  </div>;
}
