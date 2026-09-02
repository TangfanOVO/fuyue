export type ProviderKind = "deepseek" | "openai-compatible" | "gemini" | "anthropic" | "glm" | "qwen" | "kimi" | "openrouter";
export type ProviderAdapterKind = "openai-chat" | "openai-responses" | "gemini-interactions" | "anthropic-messages";

export interface ProviderConfig {
  id: ProviderKind;
  adapter?: ProviderAdapterKind;
  label: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export type VoiceProviderKind = "elevenlabs" | "doubao" | "custom";

export interface VoiceProviderConfig {
  id: VoiceProviderKind;
  label: string;
  apiKey: string;
  voice: string;
  model: string;
  endpoint: string;
  sttEndpoint?: string;
  ttsEndpoint?: string;
}

export interface RelayConfig {
  host: string;
  port: number;
  serviceName: string;
  allowedOrigins: Set<string>;
  providers: ProviderConfig[];
  activeProviderId: ProviderKind | "";
  lifeFile: string;
  moodFile: string;
  engawaUrl: string;
  accessCode: string;
  voiceProviders: VoiceProviderConfig[];
  activeVoiceProviderId: VoiceProviderKind | "";
}

function cleanUrl(value: string, fallback: string): string {
  const parsed = new URL((value || fallback).replace(/\/+$/, ""));
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Provider base URL must use HTTPS unless it is localhost");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const host = env.FUYUE_RELAY_HOST?.trim() || "127.0.0.1";
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!loopback && env.FUYUE_TRUSTED_PROXY !== "1") {
    throw new Error("Refusing a public bind without FUYUE_TRUSTED_PROXY=1 and an authenticated HTTPS proxy");
  }
  const port = Number.parseInt(env.FUYUE_RELAY_PORT || "8787", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("FUYUE_RELAY_PORT must be between 1 and 65535");
  const allowedOrigins = new Set((env.FUYUE_ALLOWED_ORIGINS || "http://localhost:4173,http://127.0.0.1:4173")
    .split(",").map((item) => item.trim().replace(/\/$/, "")).filter(Boolean));
  if (!loopback && allowedOrigins.size === 0) throw new Error("A public relay requires FUYUE_ALLOWED_ORIGINS");
  const accessCode = env.FUYUE_ACCESS_CODE?.trim() || "";
  if (accessCode && accessCode.length < 16) throw new Error("FUYUE_ACCESS_CODE must contain at least 16 characters");
  if (env.FUYUE_REQUIRE_ACCESS_CODE === "1" && !accessCode) throw new Error("This deployment requires FUYUE_ACCESS_CODE");

  const providers: ProviderConfig[] = [];
  const deepseekKey = env.FUYUE_DEEPSEEK_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim() || "";
  if (deepseekKey) {
    const model = env.FUYUE_DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
    const defaultLabel = model === "deepseek-v4-pro" ? "DeepSeek V4 Pro" : model === "deepseek-v4-flash" ? "DeepSeek V4 Flash" : `DeepSeek · ${model}`;
    providers.push({
      id: "deepseek",
      adapter: "openai-chat",
      label: env.FUYUE_DEEPSEEK_LABEL?.trim() || defaultLabel,
      model,
      apiKey: deepseekKey,
      baseUrl: cleanUrl(env.FUYUE_DEEPSEEK_BASE_URL || "", "https://api.deepseek.com"),
    });
  }
  if (env.FUYUE_OPENAI_API_KEY?.trim() && env.FUYUE_OPENAI_MODEL?.trim()) {
    const openAiBaseUrl = cleanUrl(env.FUYUE_OPENAI_BASE_URL || "", "https://api.openai.com/v1");
    providers.push({
      id: "openai-compatible",
      adapter: openAiBaseUrl === "https://api.openai.com/v1" ? "openai-responses" : "openai-chat",
      label: env.FUYUE_OPENAI_LABEL?.trim() || (openAiBaseUrl === "https://api.openai.com/v1" ? "OpenAI" : "OpenAI-compatible"),
      model: env.FUYUE_OPENAI_MODEL.trim(),
      apiKey: env.FUYUE_OPENAI_API_KEY.trim(),
      baseUrl: openAiBaseUrl,
    });
  }
  if (env.FUYUE_GEMINI_API_KEY?.trim() && env.FUYUE_GEMINI_MODEL?.trim()) {
    providers.push({
      id: "gemini",
      adapter: "gemini-interactions",
      label: env.FUYUE_GEMINI_LABEL?.trim() || "Gemini",
      model: env.FUYUE_GEMINI_MODEL.trim(),
      apiKey: env.FUYUE_GEMINI_API_KEY.trim(),
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
  }
  const compatiblePresets: Array<{ id: ProviderKind; prefix: string; label: string; baseUrl: string; model: string }> = [
    { id: "glm", prefix: "GLM", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5-flash" },
    { id: "qwen", prefix: "QWEN", label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    { id: "kimi", prefix: "KIMI", label: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    { id: "openrouter", prefix: "OPENROUTER", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  ];
  for (const preset of compatiblePresets) {
    const key = env[`FUYUE_${preset.prefix}_API_KEY`]?.trim() || "";
    if (!key) continue;
    providers.push({
      id: preset.id,
      adapter: "openai-chat",
      label: env[`FUYUE_${preset.prefix}_LABEL`]?.trim() || preset.label,
      model: env[`FUYUE_${preset.prefix}_MODEL`]?.trim() || preset.model,
      apiKey: key,
      baseUrl: cleanUrl(env[`FUYUE_${preset.prefix}_BASE_URL`] || "", preset.baseUrl),
    });
  }
  if (env.FUYUE_ANTHROPIC_API_KEY?.trim()) {
    providers.push({
      id: "anthropic",
      adapter: "anthropic-messages",
      label: env.FUYUE_ANTHROPIC_LABEL?.trim() || "Anthropic",
      model: env.FUYUE_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
      apiKey: env.FUYUE_ANTHROPIC_API_KEY.trim(),
      baseUrl: cleanUrl(env.FUYUE_ANTHROPIC_BASE_URL || "", "https://api.anthropic.com/v1"),
    });
  }
  const requested = env.FUYUE_ACTIVE_PROVIDER?.trim() as ProviderKind | undefined;
  const active = requested ? providers.find((item) => item.id === requested) : providers[0];
  if (requested && providers.length > 0 && !active) throw new Error(`Active provider ${requested} is not fully configured`);
  const voiceProviders: VoiceProviderConfig[] = [];
  const elevenLabsKey = env.FUYUE_ELEVENLABS_API_KEY?.trim() || env.ELEVENLABS_API_KEY?.trim() || "";
  const elevenLabsVoice = env.FUYUE_ELEVENLABS_VOICE_ID?.trim() || "";
  if (elevenLabsKey && elevenLabsVoice) voiceProviders.push({
    id: "elevenlabs", label: env.FUYUE_ELEVENLABS_LABEL?.trim() || "ElevenLabs", apiKey: elevenLabsKey,
    voice: elevenLabsVoice, model: env.FUYUE_ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5", endpoint: "https://api.elevenlabs.io/v1",
  });
  const doubaoKey = env.FUYUE_DOUBAO_DUPLEX_API_KEY?.trim() || env.ARK_API_KEY?.trim() || "";
  const doubaoVoice = env.FUYUE_DOUBAO_DUPLEX_VOICE?.trim() || "";
  if (doubaoKey && doubaoVoice) voiceProviders.push({
    id: "doubao", label: env.FUYUE_DOUBAO_LABEL?.trim() || "豆包语音", apiKey: doubaoKey, voice: doubaoVoice,
    model: env.FUYUE_DOUBAO_DUPLEX_MODEL?.trim() || "1.2.6.1", endpoint: env.FUYUE_DOUBAO_DUPLEX_ENDPOINT?.trim() || "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
  });
  const customKey = env.FUYUE_CUSTOM_VOICE_API_KEY?.trim() || "";
  const customStt = env.FUYUE_CUSTOM_VOICE_STT_URL?.trim() || "";
  const customTts = env.FUYUE_CUSTOM_VOICE_TTS_URL?.trim() || "";
  if (customStt && customTts) voiceProviders.push({
    id: "custom", label: env.FUYUE_CUSTOM_VOICE_LABEL?.trim() || "自定义语音", apiKey: customKey,
    voice: env.FUYUE_CUSTOM_VOICE_ID?.trim() || "default", model: env.FUYUE_CUSTOM_VOICE_MODEL?.trim() || "default",
    endpoint: "", sttEndpoint: cleanUrl(customStt, customStt), ttsEndpoint: cleanUrl(customTts, customTts),
  });
  const requestedVoice = env.FUYUE_ACTIVE_VOICE_PROVIDER?.trim() as VoiceProviderKind | undefined;
  const activeVoice = requestedVoice ? voiceProviders.find((item) => item.id === requestedVoice) : voiceProviders[0];
  if (requestedVoice && voiceProviders.length > 0 && !activeVoice) throw new Error(`Active voice provider ${requestedVoice} is not fully configured`);
  return {
    host, port,
    serviceName: env.FUYUE_RELAY_NAME?.trim() || "fuyue-self-hosted-relay",
    allowedOrigins, providers,
    activeProviderId: active?.id || "",
    lifeFile: env.FUYUE_LIFE_FILE?.trim() || "",
    moodFile: env.FUYUE_MOOD_FILE?.trim() || "",
    engawaUrl: cleanUrl(env.FUYUE_ENGAWA_URL || "", "http://127.0.0.1:8179"),
    accessCode,
    voiceProviders,
    activeVoiceProviderId: activeVoice?.id || "",
  };
}
