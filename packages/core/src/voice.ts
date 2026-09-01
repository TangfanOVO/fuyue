export type VoiceProviderId = "elevenlabs" | "doubao" | "custom";

export interface VoiceProviderStatus {
  id: VoiceProviderId;
  label: string;
  configured: boolean;
  voice: string;
  model: string;
}

export interface VoiceStatus {
  ok: boolean;
  service: string;
  activeProviderId: VoiceProviderId | "";
  providers: VoiceProviderStatus[];
  detail?: string;
}

export interface VoiceAudioInput {
  audioBase64: string;
  sampleRate: 16000;
  encoding: "pcm_s16le";
  providerId?: VoiceProviderId;
}

export interface VoiceTranscript {
  text: string;
  providerId: VoiceProviderId;
  providerLabel: string;
}

export interface VoiceSynthesis {
  audioBase64: string;
  mediaType: "audio/mpeg" | "audio/wav";
  providerId: VoiceProviderId;
  providerLabel: string;
}

export interface VoiceGateway {
  voiceStatus(signal?: AbortSignal): Promise<VoiceStatus>;
  transcribeVoice(input: VoiceAudioInput, signal?: AbortSignal): Promise<VoiceTranscript>;
  synthesizeVoice(text: string, providerId?: VoiceProviderId, signal?: AbortSignal): Promise<VoiceSynthesis>;
}

export function hasVoiceGateway(value: unknown): value is VoiceGateway {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VoiceGateway>;
  return typeof item.voiceStatus === "function" && typeof item.transcribeVoice === "function" && typeof item.synthesizeVoice === "function";
}
