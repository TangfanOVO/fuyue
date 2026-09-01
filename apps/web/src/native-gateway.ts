import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { CLIENT_TOOL_NAMES, localCapabilityStatus, type ChatGatewayEvent, type ChatGatewayRequest, type ClientToolAction, type CompanionGateway, type GatewayStatus, type LifeOverviewItem, type MoodSnapshot, type VoiceAudioInput, type VoiceGateway, type VoiceProviderId, type VoiceStatus, type VoiceSynthesis, type VoiceTranscript } from "@fuyue/core";
import { readNativeCalendar } from "./device-bridge";

export interface NativeGatewayConfiguration { apiKey: string; baseUrl: string; model: string }
export interface NativeGatewayState { configured: boolean; baseUrl: string; model: string }
interface NativeGatewayPlugin {
  getStatus(): Promise<NativeGatewayState>;
  configure(configuration: NativeGatewayConfiguration): Promise<NativeGatewayState>;
  clear(): Promise<void>;
  chat(request: ChatGatewayRequest): Promise<{ content: string; sourceLabel: string; modelLabel: string; clientActions?: ClientToolAction[] }>;
}
export interface NativeVoiceConfiguration { provider: VoiceProviderId; apiKey: string; voice: string; model: string; endpoint?: string; sttEndpoint?: string; ttsEndpoint?: string }
export interface NativeVoiceState { ok: boolean; configured: boolean; service: string; activeProviderId: VoiceProviderId | ""; provider: VoiceProviderId; providerLabel: string; voice: string; model: string; microphone: "granted" | "denied" | "prompt"; providers: VoiceStatus["providers"] }
export type NativeLiveCallEventType = "connected" | "transcription_started" | "transcript_delta" | "transcript_completed" | "reply_delta" | "reply_completed" | "audio_started" | "audio_completed" | "turn_completed" | "turn_canceled" | "turn_error" | "closed" | "error";
export interface NativeLiveCallEvent { eventType: NativeLiveCallEventType; text?: string; itemId?: string; message?: string; providerLabel?: string; model?: string }
export interface NativeLiveCallState { ok: boolean; providerId: "doubao"; providerLabel: string; model: string; mode: "end_to_end_full_duplex" }
interface NativeVoicePlugin {
  getStatus(): Promise<NativeVoiceState>;
  requestMicrophone(): Promise<NativeVoiceState>;
  configure(configuration: NativeVoiceConfiguration): Promise<NativeVoiceState>;
  clear(): Promise<void>;
  transcribe(input: VoiceAudioInput): Promise<VoiceTranscript>;
  synthesize(input: { text: string; providerId?: VoiceProviderId }): Promise<VoiceSynthesis>;
  startLiveCall(input: { providerId: "doubao"; instructions: string }): Promise<NativeLiveCallState>;
  appendLiveAudio(input: { audioBase64: string }): Promise<void>;
  commitLiveAudio(): Promise<void>;
  cancelLiveResponse(): Promise<void>;
  speakLiveText(input: { text: string }): Promise<void>;
  setLiveMuted(input: { muted: boolean }): Promise<void>;
  stopLiveCall(): Promise<void>;
  addListener(eventName: "liveCallEvent", listener: (event: NativeLiveCallEvent) => void): Promise<PluginListenerHandle>;
}

const nativePlugin = (import.meta.hot?.data.nativeGatewayPlugin as NativeGatewayPlugin | undefined)
  ?? registerPlugin<NativeGatewayPlugin>("FuyueNativeGateway");
if (import.meta.hot) import.meta.hot.data.nativeGatewayPlugin = nativePlugin;
const nativeVoicePlugin = (import.meta.hot?.data.nativeVoicePlugin as NativeVoicePlugin | undefined)
  ?? registerPlugin<NativeVoicePlugin>("FuyueVoice");
if (import.meta.hot) import.meta.hot.data.nativeVoicePlugin = nativeVoicePlugin;
export function hasNativeGateway(): boolean { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"; }
export function nativeGatewayState(): Promise<NativeGatewayState> { return nativePlugin.getStatus(); }
export function configureNativeGateway(configuration: NativeGatewayConfiguration): Promise<NativeGatewayState> { return nativePlugin.configure(configuration); }
export function clearNativeGateway(): Promise<void> { return nativePlugin.clear(); }
export function nativeVoiceState(): Promise<NativeVoiceState> { return nativeVoicePlugin.getStatus(); }
export function requestNativeMicrophone(): Promise<NativeVoiceState> { return nativeVoicePlugin.requestMicrophone(); }
export function configureNativeVoice(configuration: NativeVoiceConfiguration): Promise<NativeVoiceState> { return nativeVoicePlugin.configure(configuration); }
export function clearNativeVoice(): Promise<void> { return nativeVoicePlugin.clear(); }
export function startNativeLiveCall(instructions: string): Promise<NativeLiveCallState> { return nativeVoicePlugin.startLiveCall({ providerId: "doubao", instructions }); }
export function appendNativeLiveAudio(audioBase64: string): Promise<void> { return nativeVoicePlugin.appendLiveAudio({ audioBase64 }); }
export function commitNativeLiveAudio(): Promise<void> { return nativeVoicePlugin.commitLiveAudio(); }
export function cancelNativeLiveResponse(): Promise<void> { return nativeVoicePlugin.cancelLiveResponse(); }
export function speakNativeLiveText(text: string): Promise<void> { return nativeVoicePlugin.speakLiveText({ text }); }
export function setNativeLiveMuted(muted: boolean): Promise<void> { return nativeVoicePlugin.setLiveMuted({ muted }); }
export function stopNativeLiveCall(): Promise<void> { return nativeVoicePlugin.stopLiveCall(); }
export function onNativeLiveCallEvent(listener: (event: NativeLiveCallEvent) => void): Promise<PluginListenerHandle> { return nativeVoicePlugin.addListener("liveCallEvent", listener); }

export class AndroidNativeGateway implements CompanionGateway, VoiceGateway {
  async status(): Promise<GatewayStatus> {
    const state = await nativePlugin.getStatus();
    const deepseek = state.baseUrl.includes("api.deepseek.com");
    const reasoningEfforts = deepseek ? ["auto", "none", "low", "high", "max"] as const : ["auto"] as const;
    const nativeCapabilities: GatewayStatus["providers"][number]["capabilities"] = ["chat", "tools"];
    const providers: GatewayStatus["providers"] = !state.configured ? [] : deepseek
      ? [
          ...(state.model !== "deepseek-v4-flash" && state.model !== "deepseek-v4-pro" ? [{ id: "android-native", label: state.model, capabilities: [...nativeCapabilities], reasoningEfforts: [...reasoningEfforts], clientTools: [...CLIENT_TOOL_NAMES] }] : []),
          { id: "android-deepseek-flash", label: "DeepSeek V4 Flash", capabilities: [...nativeCapabilities], reasoningEfforts: [...reasoningEfforts], clientTools: [...CLIENT_TOOL_NAMES] },
          { id: "android-deepseek-pro", label: "DeepSeek V4 Pro", capabilities: [...nativeCapabilities], reasoningEfforts: [...reasoningEfforts], clientTools: [...CLIENT_TOOL_NAMES] },
        ]
      : [{ id: "android-native", label: state.model, capabilities: [...nativeCapabilities], reasoningEfforts: [...reasoningEfforts], clientTools: [...CLIENT_TOOL_NAMES] }];
    const activeProviderId = !state.configured ? "" : state.model === "deepseek-v4-flash" ? "android-deepseek-flash" : state.model === "deepseek-v4-pro" ? "android-deepseek-pro" : "android-native";
    const capabilities = localCapabilityStatus().map((item) => item.id === "chat.continuous" && state.configured
      ? { ...item, mode: "custom_backend" as const, state: "ready" as const, service: "Android 原生直连", detail: "Keystore 密钥桥已连接模型" }
      : item);
    return { ok: state.configured, service: "Android 原生直连", activeProviderId, providers, capabilities };
  }
  async *streamChat(request: ChatGatewayRequest): AsyncGenerator<ChatGatewayEvent> {
    const result = await nativePlugin.chat(request);
    yield { type: "done", content: result.content, sourceLabel: result.sourceLabel, modelLabel: result.modelLabel, toolTrace: [], clientActions: result.clientActions || [] };
  }
  async lifeOverview(days: number): Promise<LifeOverviewItem[]> { try { return await readNativeCalendar(days); } catch { return []; } }
  async mood(): Promise<MoodSnapshot | null> { return null; }
  async voiceStatus(): Promise<VoiceStatus> {
    const state = await nativeVoicePlugin.getStatus();
    return { ok: state.configured, service: state.service, activeProviderId: state.activeProviderId, providers: state.providers || (state.configured ? [{ id: state.provider, label: state.providerLabel, configured: true, voice: state.voice, model: state.model }] : []), detail: state.configured ? "API Key 已加密保存在 Android Keystore" : "选择 ElevenLabs 或豆包，填入自己的语音 API" };
  }
  async transcribeVoice(input: VoiceAudioInput): Promise<VoiceTranscript> { return nativeVoicePlugin.transcribe(input); }
  async synthesizeVoice(text: string, providerId?: VoiceProviderId): Promise<VoiceSynthesis> { return nativeVoicePlugin.synthesize({ text, ...(providerId ? { providerId } : {}) }); }
}
