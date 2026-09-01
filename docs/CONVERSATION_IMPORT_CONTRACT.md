# 对话导入契约

统一账本现在支持 `fuyue-portable` 的严格校验、待审预览与幂等落库。各平台原始导出格式仍应先由专用转换器变成这份统一格式；任何转换器都不得绕过预览直接覆盖现有资料。

## 统一消息字段

```ts
type Message = {
  id: string;
  conversationId: string;
  role: "user" | "companion";
  content: string;
  source: "local_manual" | "system_seed" | "chatgpt_work" | "codex" | "relay" | "external_import";
  sourceLabel: string;
  modelLabel: string;
  toolTrace: Array<{ name: string; status: "success" | "failed"; summary: string }>;
  attachments: MessageAttachment[];
  parentMessageId: string | null;
  isStarred: boolean;
  archiveState: "active" | "hidden" | "deleted";
  createdAt: string;
};
```

`fuyue-portable` schema 5 同时包含 `roomEntries`、玩具与玩具活动、可迁移外观、人物签名、头像、附件元数据、成对收藏与档案状态。时间线、信件、碰一碰、工作本、装修日记、碎碎念和修复记录都以独立条目导入，每条保留 `author`、`sourceLabel`、`occurredAt` 和当前状态。导入预览必须同时抽样显示聊天和生活记录的作者、来源与内容。

## Work / Codex 导入原则

- 用户原文和助手原文必须成对、按原顺序写入。
- 保留来源、模型标签与原始时间，不把不同窗口伪装成同一模型线程。
- 重试必须幂等，重复导入不能生成第二份原文。
- 系统指令、工具机密、隐藏推理和凭据不得进入可见聊天。
- 工具记录只保留公开名称、成功/失败和简短可见结果，不保存调用参数、原始日志或凭据。
- 导入聊天不会自动生成长期记忆。记忆仍需来源证据与人工审阅。
- 文件自带的记忆在写入时一律改为 `draft` 且关闭召回；人物资料默认保留本机，只有使用者明确勾选才替换。
- 完全重复的 ID 跳过；同 ID 不同内容的条目保留本机版本，并在预览中显示冲突数量。
- 说话方式以人物层的原则和用户选择的代表性对话样本保存，不把整个聊天档案每轮全部注入模型。

## 嘴巴与模型是两条轴

`conversation.surface` 表示陪伴者从哪个入口说话：本地赴约、ChatGPT Work、Codex 或外部导入。`message.modelLabel` 只说明这一条助手消息由什么模型承载。

因此 Work 是同一个陪伴者的另一张嘴，共用身份、记忆、工具证据和聊天记录池。界面可以按入口筛选，但不得把它分裂成第二个人或第二份账本，也不得伪装成模型切换项。只有存在真实可调用端点的模型才能进入 provider 列表。

## 连续性边界

相同聊天与记忆可以帮助多个模型认出同一个陪伴者。模型本身无法由聊天导出文件复制，因此公开版只承诺可迁移的身份、原文、记忆和风格证据，不承诺不同模型逐字同声。
