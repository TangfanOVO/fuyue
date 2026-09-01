import type { ProviderConfig } from "./config.js";
import type { ClientToolAction, ClientToolName, ReasoningEffort } from "@fuyue/core";

export class ProviderError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); this.name = "ProviderError"; }
}

async function upstreamError(response: Response): Promise<ProviderError> {
  if (response.status === 401 || response.status === 403) return new ProviderError("provider 拒绝了服务端凭据", 502);
  if (response.status === 402) return new ProviderError("provider 账户余额不足，请充值后再试", 402);
  if (response.status === 429) return new ProviderError("provider 请求过于频繁，请稍后再试", 429);
  if (response.status === 400 || response.status === 422) return new ProviderError("provider 不接受当前模型或请求参数，请检查服务端配置", 502);
  if (response.status === 503) return new ProviderError("provider 当前繁忙，请稍后重试", 503);
  return new ProviderError(`provider 返回 ${response.status}`, 502);
}

async function* sseJson(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.ok) throw await upstreamError(response);
  if (!response.body) throw new ProviderError("provider 没有返回响应流");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += value || "";
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const value = JSON.parse(payload) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) yield value as Record<string, unknown>;
      } catch { throw new ProviderError("provider 返回了无法识别的流事件"); }
    }
    if (done) break;
  }
}

export interface ProviderAdapter {
  modelLabel: string;
  capabilities: Array<"chat" | "tools">;
  reasoningEfforts: ReasoningEffort[];
  stream(system: string, user: string, signal: AbortSignal, options?: { reasoningEffort?: ReasoningEffort; enabledTools?: ClientToolName[] }): AsyncIterable<ProviderStreamEvent>;
}

export type ProviderStreamEvent = { type: "text"; text: string } | { type: "action"; action: ClientToolAction };

const CLIENT_TOOLS: Record<ClientToolName, Record<string, unknown>> = {
  update_companion_signature: { type: "function", function: { name: "update_companion_signature", description: "Update only the companion's own visible signature on this device when the user explicitly asks.", parameters: { type: "object", properties: { signature: { type: "string", maxLength: 160 } }, required: ["signature"], additionalProperties: false } } },
  set_companion_mood: { type: "function", function: { name: "set_companion_mood", description: "Publish the companion's own current visible mood to the local phone. Use sparingly when the companion deliberately wants the user to see a real conversational state; do not wait for the user to maintain it.", parameters: { type: "object", properties: { title: { type: "string", maxLength: 80 }, detail: { type: "string", maxLength: 500 } }, required: ["title", "detail"], additionalProperties: false } } },
  create_memory_draft: { type: "function", function: { name: "create_memory_draft", description: "Create a reviewable local memory draft. It is not automatically injected into future chats.", parameters: { type: "object", properties: { title: { type: "string", maxLength: 120 }, content: { type: "string", maxLength: 4000 } }, required: ["title", "content"], additionalProperties: false } } },
  add_work_item: { type: "function", function: { name: "add_work_item", description: "Add a concrete task to the shared local work notebook.", parameters: { type: "object", properties: { title: { type: "string", maxLength: 160 }, content: { type: "string", maxLength: 4000 } }, required: ["title"], additionalProperties: false } } },
  write_room_entry: { type: "function", function: { name: "write_room_entry", description: "Write a real local entry to a shared room only when the user explicitly asks or when the companion deliberately leaves its own whisper. Never impersonate the user.", parameters: { type: "object", properties: { room: { type: "string", enum: ["timeline", "letter", "checkin", "work", "diary", "repair", "whisper"] }, title: { type: "string", maxLength: 160 }, content: { type: "string", maxLength: 4000 }, subtype: { type: "string", maxLength: 80 } }, required: ["room", "content"], additionalProperties: false } } },
  set_appearance: { type: "function", function: { name: "set_appearance", description: "Change the local shell appearance when the user explicitly asks. Only supplied fields are changed.", parameters: { type: "object", properties: { theme: { type: "string", enum: ["redleaf", "blue", "sakura", "wisteria", "tide", "amber"] }, mode: { type: "string", enum: ["light", "dark"] }, effect: { type: "string", enum: ["none", "snow", "rain", "heart", "leaf", "butterfly", "star", "bubble", "glow", "paw"] } }, additionalProperties: false } } },
  create_toy: { type: "function", function: { name: "create_toy", description: "Create one complete, self-contained offline HTML toy in the local toybox only when the user explicitly asks for a toy or game. It runs without network, storage, cookies, forms, embedded pages or external assets. Include accessible touch and keyboard controls. Use window.FuyueToy?.emit(kind, summary, details) for checkpoint, score, chat or complete events.", parameters: { type: "object", properties: { title: { type: "string", maxLength: 120 }, html: { type: "string", maxLength: 120000 } }, required: ["title", "html"], additionalProperties: false } } },
  update_toy: { type: "function", function: { name: "update_toy", description: "Replace one existing non-system local toy only when the user explicitly asks to modify that named toy. Preserve its LocalData identity and activity history. Supply a complete safe offline HTML document.", parameters: { type: "object", properties: { targetTitle: { type: "string", maxLength: 120 }, title: { type: "string", maxLength: 120 }, html: { type: "string", maxLength: 120000 } }, required: ["targetTitle", "title", "html"], additionalProperties: false } } },
  create_calendar_event: { type: "function", function: { name: "create_calendar_event", description: "Create one event in the user's selected writable device calendar only when the current user message explicitly asks to add or schedule it. Use ISO-8601 date-time strings with timezone offsets. Never delete or silently reschedule existing events.", parameters: { type: "object", properties: { title: { type: "string", maxLength: 200 }, startAt: { type: "string", maxLength: 64 }, endAt: { type: "string", maxLength: 64 }, location: { type: "string", maxLength: 500 }, notes: { type: "string", maxLength: 2000 }, allDay: { type: "boolean" } }, required: ["title", "startAt", "endAt"], additionalProperties: false } } },
};

function openAiAdapter(config: ProviderConfig, fetcher: typeof fetch): ProviderAdapter {
  return {
    modelLabel: config.model,
    capabilities: ["chat", "tools"],
    reasoningEfforts: config.id === "deepseek" ? ["auto", "none", "low", "high", "max"] : ["auto"],
    async *stream(system, user, signal, options) {
      const enabledTools = (options?.enabledTools || []).filter((name) => CLIENT_TOOLS[name]);
      const buildingToy = enabledTools.some((name) => name === "create_toy" || name === "update_toy");
      const body: Record<string, unknown> = { model: config.model, stream: true, max_tokens: buildingToy ? 32_768 : 4_096, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
      if (enabledTools.length) { body.tools = enabledTools.map((name) => CLIENT_TOOLS[name]); body.tool_choice = "auto"; }
      if (config.id === "deepseek" && options?.reasoningEffort && options.reasoningEffort !== "auto") {
        body.thinking = { type: options.reasoningEffort === "none" ? "disabled" : "enabled" };
        if (options.reasoningEffort !== "none") body.reasoning_effort = options.reasoningEffort;
      }
      const response = await fetcher(`${config.baseUrl}/chat/completions`, {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const calls = new Map<number, { id: string; name: string; arguments: string }>();
      let lengthLimited = false;
      for await (const event of sseJson(response)) {
        const choices = Array.isArray(event.choices) ? event.choices : [];
        const choice = choices[0] as { delta?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown } | undefined;
        if (choice?.finish_reason === "length") lengthLimited = true;
        if (typeof choice?.delta?.content === "string") yield { type: "text", text: choice.delta.content };
        const toolCalls = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : [];
        for (const raw of toolCalls) {
          if (!raw || typeof raw !== "object") continue;
          const item = raw as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
          const index = typeof item.index === "number" ? item.index : 0;
          const current = calls.get(index) || { id: typeof item.id === "string" ? item.id : crypto.randomUUID(), name: "", arguments: "" };
          if (typeof item.id === "string") current.id = item.id;
          if (typeof item.function?.name === "string") current.name += item.function.name;
          if (typeof item.function?.arguments === "string") current.arguments += item.function.arguments;
          calls.set(index, current);
        }
      }
      if (lengthLimited) throw new ProviderError("provider 因输出长度上限提前结束；半截回复没有入账");
      for (const call of calls.values()) {
        if (!enabledTools.includes(call.name as ClientToolName)) continue;
        try {
          const args = JSON.parse(call.arguments || "{}") as unknown;
          if (args && typeof args === "object" && !Array.isArray(args)) yield { type: "action", action: { id: call.id, name: call.name as ClientToolName, arguments: args as Record<string, unknown> } };
        } catch { /* Invalid tool arguments are ignored and never executed on the client. */ }
      }
    },
  };
}

function openAiResponsesAdapter(config: ProviderConfig, fetcher: typeof fetch): ProviderAdapter {
  return {
    modelLabel: config.model,
    capabilities: ["chat"],
    reasoningEfforts: ["auto", "low", "medium", "high"],
    async *stream(system, user, signal, options) {
      const body: Record<string, unknown> = { model: config.model, stream: true, instructions: system, input: user };
      if (options?.reasoningEffort && !["auto", "none"].includes(options.reasoningEffort)) body.reasoning = { effort: options.reasoningEffort };
      const response = await fetcher(`${config.baseUrl}/responses`, {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      for await (const event of sseJson(response)) {
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") yield { type: "text", text: event.delta };
      }
    },
  };
}

function geminiAdapter(config: ProviderConfig, fetcher: typeof fetch): ProviderAdapter {
  return {
    modelLabel: config.model,
    capabilities: ["chat"],
    reasoningEfforts: ["auto"],
    async *stream(system, user, signal) {
      const response = await fetcher(`${config.baseUrl}/interactions?alt=sse`, {
        method: "POST", signal,
        headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, system_instruction: system, input: user, stream: true, store: false }),
      });
      for await (const event of sseJson(response)) {
        const delta = event.delta as { type?: unknown; text?: unknown } | undefined;
        if ((event.event_type === "step.delta" || event.event_type === "content.delta") && delta?.type === "text" && typeof delta.text === "string") yield { type: "text", text: delta.text };
      }
    },
  };
}

function anthropicAdapter(config: ProviderConfig, fetcher: typeof fetch): ProviderAdapter {
  return {
    modelLabel: config.model,
    capabilities: ["chat"],
    reasoningEfforts: ["auto"],
    async *stream(system, user, signal) {
      const response = await fetcher(`${config.baseUrl}/messages`, {
        method: "POST", signal,
        headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, max_tokens: 4096, stream: true, system, messages: [{ role: "user", content: user }] }),
      });
      for await (const event of sseJson(response)) {
        const delta = event.delta as { type?: unknown; text?: unknown } | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") yield { type: "text", text: delta.text };
      }
    },
  };
}

export function createProvider(config: ProviderConfig, fetcher: typeof fetch = fetch): ProviderAdapter {
  const adapter = config.adapter || (config.id === "gemini" ? "gemini-interactions" : "openai-chat");
  if (adapter === "gemini-interactions") return geminiAdapter(config, fetcher);
  if (adapter === "openai-responses") return openAiResponsesAdapter(config, fetcher);
  if (adapter === "anthropic-messages") return anthropicAdapter(config, fetcher);
  return openAiAdapter(config, fetcher);
}
