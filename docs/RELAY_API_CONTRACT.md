# Relay API 契约

公开前端不直接保存 Gemini、DeepSeek、GLM 或 OpenAI-compatible 的密钥。它只连接使用者自己控制的 relay；供应商适配、凭据、限流和审计都留在服务端。

默认同源携带 Cookie（`credentials: include`）。跨域部署时，relay 必须显式允许前端 Origin、Credentials 与下列方法和请求头。远程 relay 必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `[::1]` 可以使用 HTTP。

## `POST /v1/session/exchange`（可选）

只用手机的用户可以用短期接入码换取服务端会话：

```json
{"code":"由服务方发放的接入码"}
```

成功后 relay 返回 `HttpOnly`、限定路径、带过期时间的会话 Cookie。前端成功后立即清空接入码，只持久化 relay 基础地址。接入码不得进入 URL、LocalData、日志或导出包。未启用该能力的 relay 可以返回 `404`；错误接入码返回 `401`，高频尝试返回 `429`。

参考 relay 的单接入码与内存会话只用于个人或小范围自托管；多用户生产服务需自行实现正式身份、撤销、速率限制和共享会话存储。

## `GET /v1/status`

```json
{
  "ok": true,
  "service": "my-fuyue-relay",
  "activeProviderId": "gemini-main",
  "providers": [{
    "id": "gemini-main",
    "label": "Gemini",
    "capabilities": ["chat", "vision", "tools"],
    "reasoningEfforts": ["auto", "low", "medium", "high"],
    "clientTools": ["update_companion_signature", "set_companion_mood", "create_memory_draft", "add_work_item", "write_room_entry", "set_appearance", "create_toy", "update_toy", "create_calendar_event"]
  }],
  "capabilities": [{
    "id": "chat.continuous",
    "mode": "custom_backend",
    "state": "ready",
    "service": "my-fuyue-relay",
    "detail": "relay 已连接模型"
  }]
}
```

前端只显示服务端实际返回的 provider。没有真实端点的模型不得作为可选项出现。

声明 `tools` 的 provider 同时用 `clientTools` 公布它已验证的本机工具名单。前端只发送双方交集；旧 relay 没有返回该字段时仍可聊天，但不会猜测它支持本机写入。这样可避免前端与 relay 的白名单版本不同时让第一句在模型之前就被拒绝。

`capabilities` 使用 `fuyue-capability-v1` 清单中的 ID。`mode` 只能是 `local | custom_backend | fuyue_service | disabled`，`state` 只能是 `ready | local_only | surface_only | needs_backend | disabled | error`。`surface_only` 表示只有可见入口和契约，不表示功能已完成。旧 relay 可以暂时不返回这一字段；前端将回退到可验证的本地能力，不推测远程功能。完整 manifest 见 `packages/core/src/capabilities.ts`。

## `POST /v1/session/logout`（可选）

撤销当前 HttpOnly 会话并返回 `{"ok":true}`。服务端必须删除会话记录，同时以 `Max-Age=0` 覆盖原 Cookie。前端的“断开连接”会先请求这一接口，再清除本机保存的 relay 地址。

## `POST /v1/chat/stream`

请求：

```json
{
  "conversationId": "local-conversation-id",
  "clientMessageId": "idempotency-id",
  "input": "用户本轮原文",
  "locale": "zh-CN",
  "providerId": "deepseek-main",
  "reasoningEffort": "medium",
  "enabledTools": ["update_companion_signature", "set_companion_mood", "create_memory_draft", "add_work_item", "write_room_entry", "set_appearance", "create_toy", "update_toy", "create_calendar_event"],
  "history": [{"role":"companion","content":"48 小时内的旧原文","createdAt":"2026-08-21T10:00:00+10:00"}],
  "people": [],
  "memories": [],
  "roomContext": [{"room":"work","author":"user","title":"今天的工作","content":"修好安卓返回","status":"active","occurredAt":"2026-08-30T12:00:00+10:00"}],
  "calendarContext": [{"id":"system-event","title":"上午课程","startAt":"2026-09-01T09:30:00+10:00","endAt":"2026-09-01T10:30:00+10:00","location":"教学楼","kind":"系统日历","sourceId":"selected-calendar"}]
}
```

`history` 是永久原文账本中最多 100 条、48 小时内的近期原文；48 小时只是本轮模型短期上下文窗口，不会删除档案。`people` 为当前两份人物资料；`memories` 只包含使用者明确启用召回的条目；`roomContext` 是最近的工作本、时间线、日记和双方可见心情等生活记录，最多 80 条。`calendarContext` 只包含用户在安卓权限页明确勾选的系统日历来源，最多 100 条；没勾选时就是空。这些只在使用者主动发送时交给当前 relay。relay 必须按 `clientMessageId` 幂等处理重试，不得静默生成第二条回复。

响应可以是 `text/event-stream` 或 `application/x-ndjson`。每行只接受以下事件：

```text
data: {"type":"delta","delta":"正在"}
data: {"type":"delta","delta":"回复"}
data: {"type":"done","modelLabel":"Gemini","sourceLabel":"自托管 relay","toolTrace":[],"clientActions":[]}
```

也可以在 `done.content` 一次返回完整正文。错误事件为：

```json
{"type":"error","message":"当前 provider 不可用","retryable":true}
```

`providerId` 只能选择 `/v1/status` 真实列出的 provider；`reasoningEffort` 只能选择该 provider 公布的档位。旧 relay 不支持时，前端回退到服务端默认值，不会伪造切换成功。

`clientActions` 使用 `client-tools-v2` 契约。当前完整白名单是 `update_companion_signature`、`set_companion_mood`、`create_memory_draft`、`add_work_item`、`write_room_entry`、`set_appearance`、`create_toy`、`update_toy` 与 `create_calendar_event`。前端、参考 relay 和 Android 壳必须接受同一组名称；每次发布由跨层测试核对，不允许各自维护缩减副本。`create_calendar_event` 只能在用户当轮明确要求新增日程时执行，且由手机端限定到用户选中的可写日历。

每项动作都要逐项校验参数，执行后写入 LocalData，再把成功或失败记录成可见工具痕迹。陪伴者因此能改自己的个签、留下可见心情、起草记忆或工作项、写入明确房间，以及创建或更新受沙箱约束的单文件玩具，但不能静默改用户身份。它不是 Bash、任意文件访问或静默装修权限；PWA 无法也不应伪装成终端。需要更强的 MCP / 设备工具时，应由使用者自建后端另行授权、列白名单并提供撤销和审计。

工具记录只允许公开名称、`success | failed` 与简短可见结果；不得返回参数、凭据、原始日志或隐藏推理。

## `GET /v1/life/overview?days=14`

```json
[{"id":"event-id","title":"上午课程","startAt":"2026-08-21T09:30:00+10:00","endAt":"2026-08-21T11:00:00+10:00","location":"教学楼","kind":"calendar"}]
```

前端把 `days` 限制在 1–31。未连接时显示诚实空态，不生成演示日程冒充真实安排。

## `GET /v1/companion/mood`

```json
{"title":"有点得意","detail":"这一句是陪伴者明确选择展示的可见状态。","updatedAt":"2026-08-21T10:00:00+10:00","sourceLabel":"家里的可审计心情流"}
```

可以返回 `null`。`updatedAt` 与非空 `sourceLabel` 都是必填字段；前端同时显示更新时间与来源，缺任一项就拒绝当作真实心情。该接口只能表示陪伴者明确输出的可见心情，不得把隐藏推理、情绪识别猜测或系统提示伪装成它的内心。

## 一起看

`POST /v1/cobrowse/comment` 接收 `{ "url": "https://…", "note": "一起看看" }`。参考 relay 只允许 HTTPS 小红书和 GitHub 域名，并在每次跳转后重新检查域名。只有读到公开页面的标题或摘要，才会把读回内容交给当前聊天 provider 并返回 `inspection`、`comment`、`sourceLabel` 与 `modelLabel`。登录墙、失效链接、超时、非 HTML 和未允许域名必须返回错误，不得生成伙伴评论。

普通 `POST /v1/chat/stream` 也会识别本轮中的同类公开链接，把同一份受限读回附在本轮上下文中。原始聊天仍按普通消息进入永久账本。

## Engawa 阅读侧廊

`GET /v1/reading/engawa/status` 返回侧车是否真实在线与白名单工具名。`POST /v1/reading/engawa/action` 接收 `{ "tool": "daily_poem", "arguments": {} }`。参考 relay 只连接回环 HTTP 侧车，动作名和参数大小均有白名单；浏览器不直接连接 Python 运行时。

## 电话语音

`GET /v1/voice/status` 只列出真正已配置的语音供应商。聊天模型仍然负责人设、记忆与回复；语音供应商只负责 STT 与 TTS。

```json
{
  "ok": true,
  "service": "my-fuyue-relay",
  "activeProviderId": "elevenlabs",
  "providers": [{"id":"elevenlabs","label":"ElevenLabs","configured":true,"voice":"voice-id","model":"eleven_flash_v2_5"}],
  "detail": "语音密钥保留在 relay 服务端"
}
```

`POST /v1/voice/transcribe` 接收 16 kHz 单声道 PCM，单轮最多约 75 秒：

```json
{"audioBase64":"...","sampleRate":16000,"encoding":"pcm_s16le","providerId":"elevenlabs"}
```

返回：

```json
{"text":"转写原文","providerId":"elevenlabs","providerLabel":"ElevenLabs"}
```

`POST /v1/voice/synthesize` 请求：

```json
{"text":"模型已生成的回复","providerId":"elevenlabs"}
```

返回 `audioBase64`、`mediaType` (`audio/mpeg | audio/wav`)、`providerId` 与 `providerLabel`。赴约会把转写、模型回复和语音附件写进同一份永久原文账本；48 小时仍只是下一轮的短期注入窗口。

参考 relay 内置 ElevenLabs 与豆包适配。其他语音服务可实现两个服务端 HTTPS JSON 端点：STT 接收上面的 PCM 请求并返回 `{ "text": "..." }`；TTS 接收 `{ "text", "voice", "model" }` 并返回 `{ "audioBase64", "mediaType" }`。API Key 使用 `Authorization: Bearer` 由 relay 附加，不会进入网页或 LocalData。

### `WS /v1/voice/live`

中文实时全双工使用同一 relay 的 WebSocket。浏览器先发：

```json
{"type":"start","instructions":"只负责实时语音识别与语音合成；最终回复由外部伙伴模型提供。"}
```

relay 只允许转发 `input_audio_buffer.append`、`input_audio_buffer.commit`、`response.cancel`、`speech_text_buffer.commit` 与 `session.close`。前端将 16 kHz PCM 连续送入语音供应商；完整转写返回后立即取消供应商自动回答，再把转写交给同一个 `/v1/chat/stream` 脑。该电话请求带人物、启用记忆、本通最近 8 轮、房间、已选日历和工具交集，不重放普通聊天的 48 小时原文。只有审计后的最终台词会作为 `speech_text_buffer.commit` 送回豆包合成。

播放期检测到连续人声时，前端必须先在本机停掉已排队的 AudioBuffer，再发 `response.cancel`，不得等供应商返回后才停声。没有真实播放游标时，伙伴不得猜测自己“停在第几”。

Android APK 不走这条浏览器麦克风路径，但使用相同事件契约：原生 `AudioRecord(VOICE_COMMUNICATION)` 收音、原生 `AudioTrack` 播放，并在 Keystore 边界内连接语音供应商。

## HTTP 错误

- `400`：请求字段错误，返回可见 `detail`。
- `401`：登录过期，前端提示重新登录。
- `403`：权限不足。
- `429`：限流，前端提示稍后重试。
- `5xx`：供应商或 relay 故障；用户原文仍保留在 LocalData。

聊天流被用户停止或网络断开时，relay 应尽快取消上游生成。前端不会把半截回复写入正式聊天账本。
