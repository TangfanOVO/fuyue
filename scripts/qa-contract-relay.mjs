import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.FUYUE_QA_CONTRACT_PORT || "8787", 10);
const allowedOrigin = process.env.FUYUE_QA_CONTRACT_ORIGIN || "http://127.0.0.1:4173";

function json(response, status, value) {
  response.writeHead(status, {
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": allowedOrigin,
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  });
  response.end(JSON.stringify(value));
}

async function body(request) {
  let value = "";
  for await (const chunk of request) value += chunk;
  return value ? JSON.parse(value) : {};
}

function done(response, content, clientActions = []) {
  response.writeHead(200, {
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": allowedOrigin,
    "cache-control": "no-store",
    "content-type": "text/event-stream; charset=utf-8",
    vary: "Origin",
  });
  response.write(`data: ${JSON.stringify({ type: "delta", delta: content.slice(0, Math.ceil(content.length / 2)) })}\n\n`);
  response.write(`data: ${JSON.stringify({ type: "delta", delta: content.slice(Math.ceil(content.length / 2)) })}\n\n`);
  response.end(`data: ${JSON.stringify({ type: "done", content, sourceLabel: "本机契约测试 relay", modelLabel: "契约测试模型（非厂商）", clientActions })}\n\n`);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-origin": allowedOrigin,
      vary: "Origin",
    });
    response.end();
    return;
  }
  if (url.pathname.endsWith("/v1/status")) {
    if (url.pathname.startsWith("/unauthorized/")) return json(response, 401, { detail: "契约测试：登录已过期" });
    if (url.pathname.startsWith("/limited/")) return json(response, 429, { detail: "契约测试：请求太频繁" });
    if (url.pathname.startsWith("/slow/")) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      return json(response, 200, { ok: true, service: "late-contract-relay", providers: [], activeProviderId: "", capabilities: [] });
    }
    return json(response, 200, {
      ok: true,
      service: "fuyue-local-contract-relay",
      activeProviderId: "contract",
      providers: [{ id: "contract", label: "契约测试模型（非 DeepSeek）", capabilities: ["chat", "tools"], reasoningEfforts: ["auto", "low", "high"] }],
      capabilities: [{ id: "companion.mood", mode: "custom_backend", state: "ready", service: "fuyue-local-contract-relay", detail: "只用于本机契约验收" }],
    });
  }
  if (url.pathname.endsWith("/v1/life/overview")) return json(response, 200, []);
  if (url.pathname.endsWith("/v1/companion/mood")) return json(response, 200, { title: "契约测试中", detail: "这条状态由本机测试 relay 明确返回。", updatedAt: "2026-08-30T02:00:00.000Z", sourceLabel: "本机契约测试 relay" });
  if (url.pathname.endsWith("/v1/reading/engawa/status")) return json(response, 200, { ok: false, service: "engawa-contract-only", detail: "契约 relay 未连接真实 Engawa；真实侧车由独立集成测试验收。", tools: [] });
  if (url.pathname.endsWith("/v1/voice/status")) return json(response, 200, { ok: false, service: "fuyue-local-contract-relay", activeProviderId: "", providers: [], detail: "没有付费语音 Key；本轮只验收契约和失败态" });
  if (url.pathname.endsWith("/v1/session/logout")) return json(response, 200, { ok: true });
  if (url.pathname.endsWith("/v1/chat/stream") && request.method === "POST") {
    const payload = await body(request);
    const input = typeof payload.input === "string" ? payload.input : "";
    if (input.includes("半截流")) {
      response.writeHead(200, { "access-control-allow-credentials": "true", "access-control-allow-origin": allowedOrigin, "content-type": "text/event-stream; charset=utf-8" });
      response.end('data: {"type":"delta","delta":"这是不应入账的半截回复"}\n\n');
      return;
    }
    if (input.includes("触发 401")) return json(response, 401, { detail: "契约测试：登录已过期" });
    if (input.includes("触发 429")) return json(response, 429, { detail: "契约测试：请求太频繁" });
    if (input.includes("工具批次一")) return done(response, "我发出了四个受限本机动作，请以工具痕迹和 LocalData 为准。", [
      { id: "contract-signature-1", name: "update_companion_signature", arguments: { signature: "契约验收：只认真实入账" } },
      { id: "contract-mood-1", name: "set_companion_mood", arguments: { title: "安心校验", detail: "我明确选择让你看见这条测试心情。" } },
      { id: "contract-memory-1", name: "create_memory_draft", arguments: { title: "工具待审记忆", content: "这是契约 relay 请求创建的待审记忆。" } },
      { id: "contract-appearance-1", name: "set_appearance", arguments: { theme: "blue", mode: "dark", effect: "rain" } },
    ]);
    if (input.includes("工具批次二")) return done(response, "我发出了四条房间写入，请以工具痕迹和 LocalData 为准。", [
      { id: "contract-work-1", name: "add_work_item", arguments: { title: "契约工作项", content: "检查工作本立即更新。" } },
      { id: "contract-timeline-1", name: "write_room_entry", arguments: { room: "timeline", title: "契约时间线", content: "留下一条可审计时间线。" } },
      { id: "contract-letter-1", name: "write_room_entry", arguments: { room: "letter", title: "契约信件", content: "留下一封可审计信件。" } },
      { id: "contract-diary-1", name: "write_room_entry", arguments: { room: "diary", title: "契约日记", content: "留下一篇可审计日记。" } },
    ]);
    if (input.includes("工具批次三")) return done(response, "我发出了两条房间写入，请以工具痕迹和 LocalData 为准。", [
      { id: "contract-repair-1", name: "write_room_entry", arguments: { room: "repair", title: "契约修补", content: "留下一条可审计修补记录。" } },
      { id: "contract-whisper-1", name: "write_room_entry", arguments: { room: "whisper", title: "契约碎碎念", content: "留下一条可审计碎碎念。" } },
    ]);
    return done(response, input.includes("独特事实") ? "我记下了独特事实，但这只是契约模型回复。" : "契约回复完整结束，没有请求任何本机工具。");
  }
  json(response, 404, { detail: "契约测试 relay 没有这个路径" });
});

server.listen(port, host, () => process.stdout.write(`qa contract relay listening on ${host}:${port}\n`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
