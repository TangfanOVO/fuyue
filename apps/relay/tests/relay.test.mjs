import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_TOOL_NAMES } from "@fuyue/core";
import WebSocket, { WebSocketServer } from "ws";

import { loadConfig } from "../dist/config.js";
import { createRelayServer } from "../dist/server.js";
import { createProvider } from "../dist/providers.js";
import { buildPrompt } from "../dist/prompt.js";
import { inspectCobrowseUrl, supportedCobrowseUrls } from "../dist/cobrowse.js";
import { elevenLabsSpeechText } from "../dist/voice.js";

test("Eleven Flash never receives literal performance tags", () => {
  assert.equal(
    elevenLabsSpeechText("[softly] Mm, only for you. 【叹气】Still here.", "eleven_flash_v2_5"),
    "Mm, only for you. Still here.",
  );
  assert.equal(elevenLabsSpeechText("[softly] Mm.", "eleven_v3"), "[softly] Mm.");
});

test("configuration exposes only providers with both a key and model", () => {
  const config = loadConfig({
    FUYUE_OPENAI_API_KEY: "server-secret",
    FUYUE_OPENAI_MODEL: "compatible-model",
    FUYUE_OPENAI_BASE_URL: "https://compatible.example/v1",
    FUYUE_GEMINI_API_KEY: "incomplete",
  });
  assert.deepEqual(config.providers.map((item) => item.id), ["openai-compatible"]);
  assert.equal(config.activeProviderId, "openai-compatible");
});

test("co-watch reads only allowlisted public XHS and GitHub metadata", async () => {
  const fakeFetch = async (url) => new Response('<html><head><meta property="og:title" content="真实标题"><meta property="og:description" content="真实摘要"></head></html>', { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const github = await inspectCobrowseUrl("https://github.com/example/project", fakeFetch);
  assert.equal(github.status, "read");
  assert.equal(github.title, "真实标题");
  assert.equal(github.summary, "真实摘要");
  assert.equal(github.sourceLabel, "GitHub 公开页面");
  assert.deepEqual(supportedCobrowseUrls("看 https://github.com/a/b 和 https://www.xiaohongshu.com/explore/123"), ["https://github.com/a/b", "https://www.xiaohongshu.com/explore/123"]);
  await assert.rejects(() => inspectCobrowseUrl("https://internal.example/private", fakeFetch), /只读取公开的小红书和 GitHub/);
});

test("co-watch reports a login wall instead of inventing page content", async () => {
  const fakeFetch = async () => new Response('<html><head><title>登录后查看</title><meta name="description" content="扫码登录"></head></html>', { status: 200, headers: { "content-type": "text/html" } });
  const result = await inspectCobrowseUrl("https://www.xiaohongshu.com/explore/locked", fakeFetch);
  assert.equal(result.status, "blocked");
  assert.match(result.detail, /要求登录/);
});

test("co-watch comments only after a successful public read", async (context) => {
  const upstreamRequests = [];
  const fakeFetch = async (url, init = {}) => {
    if (String(url).startsWith("https://github.com/")) {
      return new Response('<html><head><meta property="og:title" content="公开仓库"><meta property="og:description" content="可核对摘要"></head></html>', { status: 200, headers: { "content-type": "text/html" } });
    }
    upstreamRequests.push(JSON.parse(init.body));
    return new Response('data: {"choices":[{"delta":{"content":"我只根据公开摘要评论。"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const config = loadConfig({
    FUYUE_OPENAI_API_KEY: "server-secret",
    FUYUE_OPENAI_MODEL: "compatible-model",
    FUYUE_OPENAI_BASE_URL: "https://compatible.example/v1",
  });
  config.port = 0;
  const relay = createRelayServer(config, fakeFetch);
  const address = await relay.listen();
  context.after(() => new Promise((resolve) => relay.server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/cobrowse/comment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://github.com/example/project", note: "一起看" }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.inspection.status, "read");
  assert.equal(result.inspection.title, "公开仓库");
  assert.equal(result.comment, "我只根据公开摘要评论。");
  assert.match(upstreamRequests[0].messages.at(-1).content, /公开仓库[\s\S]*可核对摘要/);
});

test("a DeepSeek key alone selects safe current defaults", () => {
  const config = loadConfig({ FUYUE_DEEPSEEK_API_KEY: "server-secret" });
  assert.equal(config.activeProviderId, "deepseek");
  assert.deepEqual(config.providers.map(({ id, model, baseUrl }) => ({ id, model, baseUrl })), [{
    id: "deepseek",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
  }]);
});

test("an empty example configuration can start in honest zero-provider mode", () => {
  const config = loadConfig({ FUYUE_ACTIVE_PROVIDER: "deepseek" });
  assert.equal(config.activeProviderId, "");
  assert.deepEqual(config.providers, []);
});

test("voice providers are opt-in and default to ElevenLabs or Doubao", () => {
  const eleven = loadConfig({ FUYUE_ELEVENLABS_API_KEY: "voice-secret", FUYUE_ELEVENLABS_VOICE_ID: "voice-id" });
  assert.equal(eleven.activeVoiceProviderId, "elevenlabs");
  assert.deepEqual(eleven.voiceProviders.map(({ id, model }) => ({ id, model })), [{ id: "elevenlabs", model: "eleven_flash_v2_5" }]);
  const doubao = loadConfig({ FUYUE_DOUBAO_DUPLEX_API_KEY: "voice-secret", FUYUE_DOUBAO_DUPLEX_VOICE: "voice-id" });
  assert.equal(doubao.activeVoiceProviderId, "doubao");
  assert.equal(doubao.voiceProviders[0].endpoint, "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue");
});

test("PWA duplex websocket keeps the provider key in relay and forwards only bounded live-call messages", async (context) => {
  const provider = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => provider.once("listening", resolve));
  const providerPort = provider.address().port; const providerMessages = []; let providerKey = ""; let resolveSpeechForwarded;
  const speechForwarded = new Promise((resolve) => { resolveSpeechForwarded = resolve; });
  provider.on("connection", (socket, request) => {
    providerKey = String(request.headers["x-api-key"] || "");
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()); providerMessages.push(message);
      if (message.type === "session.create") socket.send(JSON.stringify({ type: "session.created", session: { model: "1.2.6.1" } }));
      if (message.type === "response.cancel") socket.send(JSON.stringify({ type: "response.canceled" }));
      if (message.type === "speech_text_buffer.commit") resolveSpeechForwarded();
    });
  });
  const config = loadConfig({ FUYUE_ACCESS_CODE: "phone-access-code-1234", FUYUE_DOUBAO_DUPLEX_API_KEY: "voice-secret", FUYUE_DOUBAO_DUPLEX_VOICE: "voice-id", FUYUE_DOUBAO_DUPLEX_ENDPOINT: `ws://127.0.0.1:${providerPort}` });
  config.port = 0; const relay = createRelayServer(config); const address = await relay.listen();
  const exchange = await fetch(`http://127.0.0.1:${address.port}/v1/session/exchange`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" }, body: JSON.stringify({ code: "phone-access-code-1234", bearer: true }) }).then((response) => response.json());
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/v1/voice/live`, [`fuyue-session.${exchange.sessionToken}`], { headers: { Origin: "http://127.0.0.1:4173" } });
  context.after(async () => {
    if (client.readyState !== WebSocket.CLOSED) { client.terminate(); await new Promise((resolve) => setImmediate(resolve)); }
    relay.server.closeAllConnections(); await new Promise((resolve) => relay.server.close(resolve));
    provider.clients.forEach((socket) => socket.terminate()); await new Promise((resolve) => provider.close(resolve));
  });
  await new Promise((resolve, reject) => { client.once("open", resolve); client.once("error", reject); });
  const createdPromise = new Promise((resolve, reject) => { client.once("message", (raw) => resolve(JSON.parse(raw.toString()))); client.once("error", reject); });
  client.send(JSON.stringify({ type: "start", instructions: "你是测试伙伴。" }));
  const created = await createdPromise;
  assert.equal(created.type, "session.created"); assert.equal(providerKey, "voice-secret");
  const canceledPromise = new Promise((resolve) => client.once("message", (raw) => resolve(JSON.parse(raw.toString()))));
  client.send(JSON.stringify({ type: "input_audio_buffer.append", audio: Buffer.alloc(1_280, 1).toString("base64") }));
  client.send(JSON.stringify({ type: "response.cancel" }));
  const canceled = await canceledPromise;
  assert.equal(canceled.type, "response.canceled");
  client.send(JSON.stringify({ type: "speech_text_buffer.commit", text: "这是外部伙伴模型组织好的回复。" }));
  await speechForwarded;
  assert.equal(providerMessages[0].session.instructions, "你是测试伙伴。");
  assert.equal(providerMessages[1].type, "input_audio_buffer.append");
  assert.equal(providerMessages[2].type, "response.cancel");
  assert.equal(providerMessages[3].type, "speech_text_buffer.commit");
  assert.equal(providerMessages[3].text, "这是外部伙伴模型组织好的回复。");
  assert.doesNotMatch(JSON.stringify(created), /voice-secret/);
});

test("configuration refuses accidental public binding", () => {
  assert.throws(() => loadConfig({ FUYUE_RELAY_HOST: "0.0.0.0" }), /Refusing a public bind/);
  assert.throws(() => loadConfig({ FUYUE_ACCESS_CODE: "too-short" }), /at least 16/);
  assert.throws(() => loadConfig({ FUYUE_REQUIRE_ACCESS_CODE: "1" }), /requires FUYUE_ACCESS_CODE/);
});

test("README relay path accepts the complete client-tool contract and reaches its upstream", async (context) => {
  const upstreamBodies = [];
  const fakeFetch = async (_url, init) => {
    upstreamBodies.push(JSON.parse(init.body));
    return new Response([
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      "data: [DONE]",
      "",
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const config = loadConfig({
    FUYUE_RELAY_PORT: "8787",
    FUYUE_OPENAI_API_KEY: "server-secret",
    FUYUE_OPENAI_MODEL: "compatible-model",
    FUYUE_OPENAI_BASE_URL: "https://compatible.example/v1",
  });
  config.port = 0;
  const relay = createRelayServer(config, fakeFetch);
  const address = await relay.listen();
  context.after(() => new Promise((resolve) => relay.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const status = await fetch(`${baseUrl}/v1/status`).then((response) => response.json());
  assert.equal(status.providers.length, 1);
  assert.equal(status.providers[0].id, "openai-compatible");
  assert.deepEqual(status.providers[0].clientTools, [...CLIENT_TOOL_NAMES]);
  assert.ok(status.capabilities.some((item) => item.id === "chat.continuous" && item.state === "ready"));
  assert.ok(status.capabilities.some((item) => item.id === "companion.mood" && item.state === "surface_only"));

  const chat = await fetch(`${baseUrl}/v1/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: "conversation", clientMessageId: "message", input: "你好", locale: "zh-CN", history: [],
      people: [{ id: "user", displayName: "我", bio: "", voiceNotes: "", updatedAt: new Date().toISOString() }],
      memories: [], enabledTools: [...CLIENT_TOOL_NAMES],
    }),
  }).then((response) => response.text());
  assert.match(chat, /"delta":"你"/);
  assert.match(chat, /"delta":"好"/);
  assert.match(chat, /"type":"done"/);
  assert.equal(upstreamBodies[0].model, "compatible-model");
  assert.equal(upstreamBodies[0].max_tokens, 32768);
  assert.equal(upstreamBodies[0].messages.at(-1).content, "你好");
  assert.deepEqual(upstreamBodies[0].tools.map((item) => item.function.name), [...CLIENT_TOOL_NAMES]);
});

test("custom voice contract can transcribe and synthesize without exposing its key", async (context) => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url: String(url), authorization: init.headers.Authorization, body: JSON.parse(init.body) });
    if (String(url).endsWith("/stt")) return Response.json({ text: "你好，我在。" });
    return Response.json({ audioBase64: Buffer.alloc(768, 1).toString("base64"), mediaType: "audio/mpeg" });
  };
  const config = loadConfig({
    FUYUE_RELAY_PORT: "8787",
    FUYUE_CUSTOM_VOICE_API_KEY: "voice-secret",
    FUYUE_CUSTOM_VOICE_STT_URL: "https://voice.example/stt",
    FUYUE_CUSTOM_VOICE_TTS_URL: "https://voice.example/tts",
  });
  config.port = 0;
  const relay = createRelayServer(config, fakeFetch);
  const address = await relay.listen();
  context.after(() => new Promise((resolve) => relay.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const voiceStatus = await fetch(`${baseUrl}/v1/voice/status`).then((response) => response.json());
  assert.equal(voiceStatus.ok, true);
  assert.equal(voiceStatus.activeProviderId, "custom");

  const transcription = await fetch(`${baseUrl}/v1/voice/transcribe`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioBase64: Buffer.alloc(3_200, 0).toString("base64"), sampleRate: 16_000, encoding: "pcm_s16le", providerId: "custom" }),
  }).then((response) => response.json());
  assert.equal(transcription.text, "你好，我在。");

  const synthesis = await fetch(`${baseUrl}/v1/voice/synthesize`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "我也在。", providerId: "custom" }),
  }).then((response) => response.json());
  assert.equal(synthesis.mediaType, "audio/mpeg");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.authorization === "Bearer voice-secret"));
  assert.doesNotMatch(JSON.stringify({ voiceStatus, transcription, synthesis }), /voice-secret/);
});

test("mood refresh is advertised only when a real source is configured", async (context) => {
  const config = loadConfig({ FUYUE_RELAY_PORT: "8787", FUYUE_MOOD_FILE: "/tmp/fuyue-qa-mood.json" });
  config.port = 0;
  const relay = createRelayServer(config);
  const address = await relay.listen();
  context.after(() => new Promise((resolve) => relay.server.close(resolve)));
  const status = await fetch(`http://127.0.0.1:${address.port}/v1/status`).then((response) => response.json());
  assert.ok(status.capabilities.some((item) => item.id === "companion.mood" && item.state === "ready"));
});

test("DeepSeek uses its official chat-completions endpoint without exposing the key", async () => {
  let capturedUrl = "";
  let capturedAuthorization = "";
  const fakeFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedAuthorization = init.headers.Authorization;
    return new Response('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
  };
  const adapter = createProvider({ id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash", apiKey: "server-secret", baseUrl: "https://api.deepseek.com" }, fakeFetch);
  const output = [];
  for await (const event of adapter.stream("system", "user", new AbortController().signal)) if (event.type === "text") output.push(event.text);
  assert.equal(output.join(""), "好");
  assert.equal(capturedUrl, "https://api.deepseek.com/chat/completions");
  assert.equal(capturedAuthorization, "Bearer server-secret");
  assert.doesNotMatch(JSON.stringify({ model: adapter.modelLabel }), /server-secret/);
});

test("OpenAI-compatible adapters reject provider length truncation", async () => {
  const fakeFetch = async () => new Response([
    'data: {"choices":[{"delta":{"content":"半截"}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    'data: [DONE]',
    "",
  ].join("\n\n"), { status: 200 });
  const adapter = createProvider({ id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash", apiKey: "server-secret", baseUrl: "https://api.deepseek.com" }, fakeFetch);
  await assert.rejects(async () => {
    for await (const event of adapter.stream("system", "user", new AbortController().signal)) void event;
  }, /半截回复没有入账/);
});

test("DeepSeek forwards selected effort and returns bounded client actions", async () => {
  let capturedBody;
  const fakeFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-signature","function":{"name":"update_companion_signature","arguments":"{\\"signature\\":\\"我在这里\\"}"}}]}}]}',
      'data: [DONE]',
      "",
    ].join("\n\n"), { status: 200 });
  };
  const adapter = createProvider({ id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash", apiKey: "server-secret", baseUrl: "https://api.deepseek.com" }, fakeFetch);
  const actions = [];
  for await (const event of adapter.stream("system", "user", new AbortController().signal, { reasoningEffort: "high", enabledTools: ["update_companion_signature"] })) if (event.type === "action") actions.push(event.action);
  assert.equal(capturedBody.thinking.type, "enabled");
  assert.equal(capturedBody.reasoning_effort, "high");
  assert.equal(capturedBody.tools[0].function.name, "update_companion_signature");
  assert.deepEqual(actions, [{ id: "call-signature", name: "update_companion_signature", arguments: { signature: "我在这里" } }]);
});

test("chat prompt can read current work and mood while mood remains a bounded local tool", () => {
  const prompt = buildPrompt({
    conversationId: "conversation", clientMessageId: "message", input: "我们接着做", locale: "zh-CN", history: [], people: [], memories: [],
    roomContext: [
      { room: "work", author: "user", title: "修聊天顶栏", content: "去掉重复模型和空白", subtype: "task", status: "active", occurredAt: "2026-08-30T02:00:00.000Z" },
      { room: "checkin", author: "companion", title: "认真", content: "正在收口", subtype: "companion_mood", status: "active", occurredAt: "2026-08-30T02:01:00.000Z" },
    ],
  });
  assert.match(prompt.system, /修聊天顶栏/);
  assert.match(prompt.system, /正在收口/);
  assert.match(prompt.system, /set_companion_mood/);
});

test("chat prompt receives only the selected device calendar context", () => {
  const prompt = buildPrompt({
    conversationId: "conversation", clientMessageId: "message", input: "我明天有什么安排", locale: "zh-CN", history: [], people: [], memories: [],
    calendarContext: [{ id: "calendar:event", title: "上午课程", startAt: "2026-09-01T09:30:00+10:00", endAt: "2026-09-01T10:30:00+10:00", location: "教学楼", kind: "系统日历", sourceId: "course-calendar" }],
  });
  assert.match(prompt.system, /上午课程/);
  assert.match(prompt.system, /教学楼/);
  assert.match(prompt.system, /create_calendar_event/);
});

test("phone speech mode asks for per-line Eleven v3 tags instead of one fixed style", () => {
  const prompt = buildPrompt({
    conversationId: "conversation", clientMessageId: "voice-message", input: "Tell me the good news", locale: "en-US", history: [], people: [], memories: [],
    speechDelivery: "eleven_v3_audio_tags",
  });
  assert.match(prompt.system, /\[softly\]/);
  assert.match(prompt.system, /\[sighs\]/);
  assert.match(prompt.system, /never force one fixed tone/);
  assert.equal(prompt.user, "Tell me the good news");
});

test("Gemini interactions adapter stays stateless and exposes only text deltas", async () => {
  let capturedUrl = "";
  let capturedHeaders;
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = String(url); capturedHeaders = init.headers; capturedBody = JSON.parse(init.body);
    return new Response([
    'data: {"event_type":"step.delta","delta":{"type":"text","text":"早"}}',
    'data: {"event_type":"step.delta","delta":{"type":"thought_summary","text":"private"}}',
    'data: {"event_type":"step.delta","delta":{"type":"text","text":"安"}}',
    "",
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const adapter = createProvider({ id: "gemini", label: "Gemini", model: "configured-model", apiKey: "server-secret", baseUrl: "https://generativelanguage.googleapis.com/v1beta" }, fakeFetch);
  const output = [];
  for await (const event of adapter.stream("system", "user", new AbortController().signal)) if (event.type === "text") output.push(event.text);
  assert.equal(output.join(""), "早安");
  assert.equal(capturedUrl, "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse");
  assert.equal(capturedHeaders["x-goog-api-key"], "server-secret");
  assert.deepEqual(capturedBody, { model: "configured-model", system_instruction: "system", input: "user", stream: true, store: false });
});

test("official OpenAI configuration uses the Responses streaming API", async () => {
  let capturedUrl = "";
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = String(url); capturedBody = JSON.parse(init.body);
    return new Response('data: {"type":"response.output_text.delta","delta":"你好"}\n\ndata: [DONE]\n\n', { status: 200 });
  };
  const config = loadConfig({ FUYUE_OPENAI_API_KEY: "server-secret", FUYUE_OPENAI_MODEL: "gpt-model" });
  const adapter = createProvider(config.providers[0], fakeFetch);
  const output = [];
  for await (const event of adapter.stream("system", "user", new AbortController().signal)) if (event.type === "text") output.push(event.text);
  assert.equal(output.join(""), "你好");
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedBody.instructions, "system");
  assert.equal(capturedBody.input, "user");
});

test("Anthropic uses the Messages streaming contract without exposing its key", async () => {
  let capturedUrl = "";
  let capturedHeaders;
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = String(url); capturedHeaders = init.headers; capturedBody = JSON.parse(init.body);
    return new Response([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}',
      "",
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const adapter = createProvider({ id: "anthropic", adapter: "anthropic-messages", label: "Anthropic", model: "configured-model", apiKey: "server-secret", baseUrl: "https://api.anthropic.com/v1" }, fakeFetch);
  const output = [];
  for await (const event of adapter.stream("system", "user", new AbortController().signal)) if (event.type === "text") output.push(event.text);
  assert.equal(output.join(""), "你好");
  assert.equal(capturedUrl, "https://api.anthropic.com/v1/messages");
  assert.equal(capturedHeaders["x-api-key"], "server-secret");
  assert.equal(capturedHeaders["anthropic-version"], "2023-06-01");
  assert.deepEqual(capturedBody.messages, [{ role: "user", content: "user" }]);
  assert.equal(capturedBody.system, "system");
});

test("compatible presets send the same bounded chat contract to their own endpoints", async () => {
  const config = loadConfig({
    FUYUE_GLM_API_KEY: "glm-secret",
    FUYUE_QWEN_API_KEY: "qwen-secret",
    FUYUE_KIMI_API_KEY: "kimi-secret",
    FUYUE_OPENROUTER_API_KEY: "router-secret",
  });
  const expected = new Map([
    ["glm", ["https://open.bigmodel.cn/api/paas/v4/chat/completions", "glm-secret"]],
    ["qwen", ["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "qwen-secret"]],
    ["kimi", ["https://api.moonshot.cn/v1/chat/completions", "kimi-secret"]],
    ["openrouter", ["https://openrouter.ai/api/v1/chat/completions", "router-secret"]],
  ]);
  for (const provider of config.providers) {
    let capturedUrl = "";
    let capturedHeaders;
    let capturedBody;
    const fakeFetch = async (url, init) => {
      capturedUrl = String(url); capturedHeaders = init.headers; capturedBody = JSON.parse(init.body);
      return new Response('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    };
    const output = [];
    for await (const event of createProvider(provider, fakeFetch).stream("system", "user", new AbortController().signal)) if (event.type === "text") output.push(event.text);
    assert.equal(output.join(""), "好");
    assert.equal(capturedUrl, expected.get(provider.id)[0]);
    assert.equal(capturedHeaders.Authorization, `Bearer ${expected.get(provider.id)[1]}`);
    assert.deepEqual(capturedBody.messages, [{ role: "system", content: "system" }, { role: "user", content: "user" }]);
  }
});

test("mainstream compatible presets and Anthropic stay server-side", () => {
  const config = loadConfig({
    FUYUE_GLM_API_KEY: "glm-secret",
    FUYUE_QWEN_API_KEY: "qwen-secret",
    FUYUE_KIMI_API_KEY: "kimi-secret",
    FUYUE_OPENROUTER_API_KEY: "router-secret",
    FUYUE_ANTHROPIC_API_KEY: "anthropic-secret",
  });
  assert.deepEqual(config.providers.map((item) => item.id), ["glm", "qwen", "kimi", "openrouter", "anthropic"]);
  assert.ok(config.providers.every((item) => item.apiKey.endsWith("secret")));
});

test("phone access code supports both HttpOnly cookie and Safari bearer sessions", async (context) => {
  const config = loadConfig({ FUYUE_RELAY_PORT: "8787", FUYUE_ACCESS_CODE: "phone-access-code-1234" });
  config.port = 0;
  const relay = createRelayServer(config);
  const address = await relay.listen();
  context.after(() => new Promise((resolve) => relay.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "fuyue-self-hosted-relay" });
  const missingSession = await fetch(`${baseUrl}/v1/status`);
  assert.equal(missingSession.status, 401);
  assert.match((await missingSession.json()).detail, /休眠中恢复.*重新输入接入码/);
  assert.equal((await fetch(`${baseUrl}/v1/session/exchange`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" }, body: JSON.stringify({ code: "wrong" }) })).status, 401);
  const cookieExchange = await fetch(`${baseUrl}/v1/session/exchange`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" }, body: JSON.stringify({ code: "phone-access-code-1234" }) });
  assert.deepEqual(await cookieExchange.clone().json(), { ok: true });
  assert.match(cookieExchange.headers.get("set-cookie"), /HttpOnly/);
  const exchange = await fetch(`${baseUrl}/v1/session/exchange`, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" }, body: JSON.stringify({ code: "phone-access-code-1234", bearer: true }) });
  assert.equal(exchange.status, 200);
  const session = await exchange.json();
  assert.match(session.sessionToken, /^[A-Za-z0-9_-]{32,256}$/);
  const sessionCookie = exchange.headers.get("set-cookie");
  assert.match(sessionCookie, /HttpOnly/);
  assert.doesNotMatch(sessionCookie, /phone-access-code/);
  const authenticated = await fetch(`${baseUrl}/v1/status`, { headers: { cookie: sessionCookie.split(";")[0] } });
  assert.equal(authenticated.status, 200);
  const bearerAuthenticated = await fetch(`${baseUrl}/v1/status`, { headers: { authorization: `Bearer ${session.sessionToken}` } });
  assert.equal(bearerAuthenticated.status, 200);
  const preflight = await fetch(`${baseUrl}/v1/status`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:4173" } });
  assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);
  const logout = await fetch(`${baseUrl}/v1/session/logout`, { method: "POST", headers: { authorization: `Bearer ${session.sessionToken}` } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await fetch(`${baseUrl}/v1/status`, { headers: { cookie: sessionCookie.split(";")[0] } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/v1/status`, { headers: { authorization: `Bearer ${session.sessionToken}` } })).status, 401);
});
