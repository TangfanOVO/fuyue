import assert from "node:assert/strict";
import test from "node:test";

import { GatewayError, RelayApiClient } from "../dist/index.js";

test("relay client accepts HTTPS and localhost HTTP but rejects insecure remote URLs", () => {
  assert.equal(new RelayApiClient("https://relay.example.com/").baseUrl, "https://relay.example.com");
  assert.equal(new RelayApiClient("http://localhost:8787/").baseUrl, "http://localhost:8787");
  assert.throws(() => new RelayApiClient("http://relay.example.com"), GatewayError);
});

test("relay client reads status and clamps life overview days", async () => {
  const requests = [];
  const fetcher = async (input) => {
    requests.push(String(input));
    if (String(input).endsWith("/v1/status")) {
      return Response.json({ ok: true, service: "demo", providers: [{ id: "demo", label: "Demo", capabilities: ["chat", "tools"], clientTools: ["set_companion_mood", "create_calendar_event"] }], activeProviderId: "demo", capabilities: [] });
    }
    return Response.json([]);
  };
  const client = new RelayApiClient("https://relay.example.com", fetcher);
  const status = await client.status();
  assert.equal(status.ok, true);
  assert.deepEqual(status.providers[0].clientTools, ["set_companion_mood", "create_calendar_event"]);
  await client.lifeOverview(400);
  assert.equal(requests[1], "https://relay.example.com/v1/life/overview?days=31");
});

test("relay client validates co-watch and Engawa contracts", async () => {
  const requests = [];
  const client = new RelayApiClient("https://relay.example.com", async (input, init = {}) => {
    requests.push({ input: String(input), body: init.body ? JSON.parse(init.body) : null });
    if (String(input).endsWith("/v1/cobrowse/comment")) return Response.json({ inspection: { status: "read", requestedUrl: "https://github.com/a/b", finalUrl: "https://github.com/a/b", sourceLabel: "GitHub 公开页面", title: "A/B", summary: "README 摘要", detail: "真实读回" }, comment: "我读到的是这个仓库的公开摘要。", sourceLabel: "relay · GitHub 公开页面", modelLabel: "model" });
    if (String(input).endsWith("/status")) return Response.json({ ok: true, service: "Engawa MCP", detail: "侧车已连接", tools: ["daily_poem"] });
    return Response.json({ ok: true, tool: "daily_poem", content: "一首诗", sourceLabel: "Engawa MCP · 本机侧车" });
  });
  assert.equal((await client.cobrowseComment("https://github.com/a/b", "一起看")).inspection.status, "read");
  assert.equal((await client.engawaStatus()).tools[0], "daily_poem");
  assert.equal((await client.engawaAction("daily_poem")).content, "一首诗");
  assert.deepEqual(requests.map((item) => item.input), ["https://relay.example.com/v1/cobrowse/comment", "https://relay.example.com/v1/reading/engawa/status", "https://relay.example.com/v1/reading/engawa/action"]);
});

test("relay client consumes SSE and NDJSON chat events", async () => {
  const body = [
    'data: {"type":"delta","delta":"你"}\n\n',
    '{"type":"delta","delta":"好"}\n',
    'data: {"type":"done","modelLabel":"Demo"}\n\n',
  ].join("");
  const fetcher = async () => new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const client = new RelayApiClient("https://relay.example.com", fetcher);
  const events = [];
  for await (const event of client.streamChat({
    conversationId: "conversation",
    clientMessageId: "message",
    input: "你好",
    locale: "zh-CN",
    history: [],
    people: [],
    memories: [],
  })) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ["delta", "delta", "done"]);
});

test("relay client rejects a stream that ends before a terminal event", async () => {
  const client = new RelayApiClient("https://relay.example.com", async () => new Response(
    'data: {"type":"delta","delta":"这只是半截"}\n\n',
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  await assert.rejects(async () => {
    for await (const event of client.streamChat({ conversationId: "conversation", clientMessageId: "message", input: "你好", locale: "zh-CN", history: [], people: [], memories: [] })) void event;
  }, (error) => error instanceof GatewayError && /半截内容/.test(error.message));
});

test("relay client accepts the complete bounded local action set", async () => {
  const body = `data: ${JSON.stringify({
    type: "done",
    content: "已经写下。",
    clientActions: [
      { id: "mood-1", name: "set_companion_mood", arguments: { title: "安静", detail: "在这里。" } },
      { id: "room-1", name: "write_room_entry", arguments: { room: "whisper", content: "想到你了。" } },
      { id: "toy-1", name: "create_toy", arguments: { title: "敲一敲", html: "<!doctype html><html><body>toy</body></html>" } },
      { id: "toy-2", name: "update_toy", arguments: { targetTitle: "敲一敲", title: "敲两下", html: "<!doctype html><html><body>toy 2</body></html>" } },
    ],
  })}\n\n`;
  const client = new RelayApiClient("https://relay.example.com", async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  const events = [];
  for await (const event of client.streamChat({ conversationId: "conversation", clientMessageId: "message", input: "写下来", locale: "zh-CN", history: [], people: [], memories: [] })) events.push(event);
  assert.deepEqual(events[0].clientActions.map((item) => item.name), ["set_companion_mood", "write_room_entry", "create_toy", "update_toy"]);
});

test("relay client rejects malformed completion metadata", async () => {
  const client = new RelayApiClient("https://relay.example.com", async () => new Response(
    'data: {"type":"done","toolTrace":[{"name":"search","status":"maybe","summary":"bad"}]}\n\n',
    { status: 200, headers: { "content-type": "text/event-stream" } },
  ));
  await assert.rejects(async () => {
    for await (const event of client.streamChat({ conversationId: "conversation", clientMessageId: "message", input: "你好", locale: "zh-CN", history: [], people: [], memories: [] })) void event;
  }, GatewayError);
});

test("relay client turns authentication failures into actionable errors", async () => {
  const fetcher = async () => Response.json({ detail: "登录已过期" }, { status: 401 });
  const client = new RelayApiClient("https://relay.example.com", fetcher);
  await assert.rejects(client.status(), (error) => error instanceof GatewayError && error.status === 401 && /登录/.test(error.message));
});

test("relay client translates browser network failures into a recoverable Chinese error", async () => {
  const client = new RelayApiClient("https://relay.example.com", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    client.status(),
    (error) => error instanceof GatewayError && /连接不到转接服务/.test(error.message) && !/Failed to fetch/.test(error.message),
  );
});

test("phone access code is exchanged without becoming part of the relay URL", async () => {
  const captured = [];
  const fetcher = async (input, init) => { captured.push({ input: String(input), init }); return Response.json(String(input).endsWith("/exchange") ? { ok: true, sessionToken: "a".repeat(43) } : { ok: true, service: "demo", providers: [], activeProviderId: "", capabilities: [] }); };
  const client = new RelayApiClient("https://session-relay.example.com", fetcher);
  await client.exchangeAccessCode("one-time-access-code");
  const resumedClient = new RelayApiClient("https://session-relay.example.com", fetcher);
  await resumedClient.status();
  assert.equal(captured[0].input, "https://session-relay.example.com/v1/session/exchange");
  assert.equal(captured[0].init.credentials, "include");
  assert.equal(JSON.parse(captured[0].init.body).code, "one-time-access-code");
  assert.equal(JSON.parse(captured[0].init.body).bearer, true);
  assert.equal(new Headers(captured[1].init.headers).get("Authorization"), `Bearer ${"a".repeat(43)}`);
  assert.equal(resumedClient.sessionToken, "a".repeat(43));
  assert.doesNotMatch(client.baseUrl, /access-code/);
  await resumedClient.revokeSession();
  assert.equal(resumedClient.sessionToken, "");
});

test("relay client rejects malformed life and mood payloads", async () => {
  const client = new RelayApiClient("https://relay.example.com", async (input) => Response.json(String(input).includes("life") ? { not: "an array" } : { title: "missing fields" }));
  await assert.rejects(client.lifeOverview(7), GatewayError);
  await assert.rejects(client.mood(), GatewayError);
});

test("relay mood requires and preserves an auditable source label", async () => {
  const client = new RelayApiClient("https://relay.example.com", async () => Response.json({ title: "安静", detail: "在这里。", updatedAt: "2026-08-30T00:00:00.000Z", sourceLabel: "测试心情文件" }));
  assert.equal((await client.mood()).sourceLabel, "测试心情文件");
});

test("relay session logout clears the server cookie", async () => {
  let captured;
  const client = new RelayApiClient("https://relay.example.com", async (input, init) => { captured = { input: String(input), init }; return Response.json({ ok: true }); });
  await client.revokeSession();
  assert.equal(captured.input, "https://relay.example.com/v1/session/logout");
  assert.equal(captured.init.credentials, "include");
});

test("relay client validates the bundled voice contract", async () => {
  const requests = [];
  const client = new RelayApiClient("https://relay.example.com", async (input, init) => {
    requests.push({ input: String(input), init });
    if (String(input).endsWith("/status")) return Response.json({ ok: true, service: "voice", activeProviderId: "elevenlabs", providers: [{ id: "elevenlabs", label: "ElevenLabs", configured: true, voice: "voice-id", model: "eleven_flash_v2_5" }] });
    if (String(input).endsWith("/transcribe")) return Response.json({ text: "你好", providerId: "elevenlabs", providerLabel: "ElevenLabs" });
    return Response.json({ audioBase64: "YWJjZGVmZ2hpamtsbW5vcA==", mediaType: "audio/mpeg", providerId: "elevenlabs", providerLabel: "ElevenLabs" });
  });
  assert.equal((await client.voiceStatus()).activeProviderId, "elevenlabs");
  assert.equal((await client.transcribeVoice({ audioBase64: "AAAA", sampleRate: 16000, encoding: "pcm_s16le" })).text, "你好");
  assert.equal((await client.synthesizeVoice("你好")).mediaType, "audio/mpeg");
  assert.deepEqual(requests.map((item) => item.input), [
    "https://relay.example.com/v1/voice/status",
    "https://relay.example.com/v1/voice/transcribe",
    "https://relay.example.com/v1/voice/synthesize",
  ]);
});
