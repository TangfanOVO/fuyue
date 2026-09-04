export const CAPABILITY_CONTRACT_VERSION = 1 as const;

export type CapabilityId =
  | "shell.localdata"
  | "chat.continuous"
  | "identity.people"
  | "companion.mood"
  | "memory.ledger"
  | "memory.visual"
  | "reading.together"
  | "reading.engawa"
  | "call.realtime"
  | "media.listening"
  | "media.cobrowse"
  | "media.attachments"
  | "expression.kaomoji"
  | "social.space"
  | "presence.proactive"
  | "life.calendar"
  | "life.health"
  | "travel.upstream"
  | "travel.story_cards"
  | "leisure.fishing"
  | "leisure.games"
  | "leisure.toys"
  | "rooms.shared";

export type CapabilityRuntimeMode = "local" | "custom_backend" | "fuyue_service" | "disabled";
export type CapabilityInstallChoice = CapabilityRuntimeMode | "frontend_only" | "upstream";
export type CapabilityState = "ready" | "local_only" | "surface_only" | "needs_backend" | "disabled" | "error";
export type BundledImplementationState = "ready" | "surface" | "none";

export interface CapabilityBackendContract {
  protocol: "fuyue-capability-v1";
  basePath: string;
  requiredRoutes: string[];
  optionalRoutes?: string[];
}

export interface CapabilityDefinition {
  id: CapabilityId;
  packId: string;
  label: string;
  summary: string;
  optional: boolean;
  frontendIncluded: boolean;
  bundledImplementation: BundledImplementationState;
  supportedModes: CapabilityRuntimeMode[];
  requires: CapabilityId[];
  backend?: CapabilityBackendContract;
  provenance?: {
    upstreamUrl: string;
    license: string;
    recommendation: "upstream_available" | "adapter_ok";
  };
}

export interface CapabilityPackManifest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  id: string;
  label: string;
  version: string;
  capabilities: CapabilityDefinition[];
}

export interface CapabilityStatus {
  id: CapabilityId;
  mode: CapabilityRuntimeMode;
  state: CapabilityState;
  service?: string;
  detail?: string;
}

export interface CapabilityBuildPlan {
  format: "fuyue-build-plan";
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  generatedAt: string;
  capabilityId: CapabilityId;
  capabilityLabel: string;
  packId: string;
  choice: CapabilityInstallChoice;
  targetPath: string;
  requires: CapabilityId[];
  requiredRoutes: string[];
  optionalRoutes: string[];
  upstream?: { url: string; license: string };
  verificationChecklist: string[];
  note: string;
}

const backend = (basePath: string, requiredRoutes: string[], optionalRoutes: string[] = []): CapabilityBackendContract => ({
  protocol: "fuyue-capability-v1",
  basePath,
  requiredRoutes,
  ...(optionalRoutes.length ? { optionalRoutes } : {}),
});

export const BUILTIN_CAPABILITY_PACKS: CapabilityPackManifest[] = [
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-shell",
    label: "赴约本地小手机",
    version: "1.0.0",
    capabilities: [
      { id: "shell.localdata", packId: "fuyue-shell", label: "LocalData 副本", summary: "人物、原文、房间与设置保存在使用者设备。", optional: false, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local"], requires: [] },
      { id: "chat.continuous", packId: "fuyue-shell", label: "连续聊天账本", summary: "所有模型的回复进入同一份可迁移原文时间线。", optional: false, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service"], requires: ["shell.localdata"], backend: backend("/v1/chat", ["POST /stream"], ["POST /cancel"]) },
      { id: "identity.people", packId: "fuyue-shell", label: "人物与身份", summary: "头像、签名、资料与说话原则独立于模型保存。", optional: false, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local"], requires: ["shell.localdata"] },
      { id: "companion.mood", packId: "fuyue-shell", label: "伙伴心情", summary: "伙伴可把自己的可见短态写入 LocalData；也能接入可审计的后端心情源。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["chat.continuous"], backend: backend("/v1/companion/mood", ["GET /"]) },
      { id: "rooms.shared", packId: "fuyue-shell", label: "共同房间", summary: "时间线、信箱、工作本、日记与修补记录。", optional: false, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service"], requires: ["shell.localdata"], backend: backend("/v1/rooms", ["GET /status"], ["GET /events", "POST /events"]) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-memory",
    label: "赴约记忆",
    version: "1.0.0",
    capabilities: [
      { id: "memory.ledger", packId: "fuyue-memory", label: "记忆账本", summary: "本地审阅、层级、来源证据与召回开关；蒸馏和升降权由后端扩展。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata", "chat.continuous"], backend: backend("/v1/memory", ["GET /status", "POST /recall"], ["POST /distill", "POST /review", "GET /events"]) },
      { id: "memory.visual", packId: "fuyue-memory", label: "记忆星图", summary: "已内置完整字符星群 + 真实 LocalData 记忆层；可选真后端再补充经审计的标签、向量与显式关系。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["memory.ledger"], backend: backend("/v1/memory/visual", ["GET /graph"], ["GET /glyphs"]) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-reading",
    label: "共读",
    version: "1.0.0",
    capabilities: [
      { id: "reading.together", packId: "fuyue-reading", label: "共读书房", summary: "赴约保留自己的共读前端；因为我们使用很轻，完整阅读能力推荐采用 Readest。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/reading", ["GET /status"], ["POST /progress", "POST /annotations", "GET /presence"]), provenance: { upstreamUrl: "https://github.com/readest/readest", license: "AGPL-3.0-or-later", recommendation: "upstream_available" } },
      { id: "reading.engawa", packId: "fuyue-reading", label: "Engawa 阅读侧廊", summary: "网页、RSS、订阅书架与每日阅读；MIT 安装工具、转接服务适配和前端均已带入。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/reading/engawa", ["GET /status"], ["POST /action"]), provenance: { upstreamUrl: "https://github.com/tsuru0805/engawa-mcp", license: "MIT", recommendation: "adapter_ok" } },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-call",
    label: "电话与共听",
    version: "1.0.0",
    capabilities: [
      { id: "call.realtime", packId: "fuyue-call", label: "实时电话", summary: "麦克风录音、转写、模型回复、语音合成、打断和原文归档；默认适配 ElevenLabs 与豆包。", optional: false, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service"], requires: ["chat.continuous"], backend: backend("/v1/voice", ["GET /status", "POST /transcribe", "POST /synthesize"], []) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-shared-media",
    label: "共听与共看",
    version: "1.0.0",
    capabilities: [
      { id: "media.listening", packId: "fuyue-shared-media", label: "一起听", summary: "赴约保留自己的共听前端；完整同步房间推荐采用 music-together。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/listening", ["GET /status"], ["POST /control", "GET /events"]), provenance: { upstreamUrl: "https://github.com/Yueby/music-together", license: "AGPL-3.0", recommendation: "upstream_available" } },
      { id: "media.cobrowse", packId: "fuyue-shared-media", label: "一起看", summary: "从聊天或空间分享公开小红书/GitHub 链接；转接服务读到真实标题与摘要后再评论，记录留在本机。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata", "chat.continuous"], backend: backend("/v1/cobrowse", ["POST /comment"], []) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-expression",
    label: "表达工具",
    version: "1.0.0",
    capabilities: [
      { id: "expression.kaomoji", packId: "fuyue-expression", label: "颜文字抽屉", summary: "325 枚公共默认库、本地收藏、频率排序与可选 MCP。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "disabled"], requires: ["chat.continuous"] },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-space",
    label: "小小空间与主动回来",
    version: "1.0.0",
    capabilities: [
      { id: "social.space", packId: "fuyue-space", label: "小小空间", summary: "本地动态、回复、媒体与双方来源。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/space", ["GET /status"], ["GET /posts", "POST /posts", "POST /comments"]) },
      { id: "presence.proactive", packId: "fuyue-space", label: "主动回来", summary: "可见的主动条件、频率、推送授权与撤销。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["custom_backend", "fuyue_service", "disabled"], requires: ["social.space"], backend: backend("/v1/presence", ["GET /status"], ["PATCH /settings", "POST /subscriptions"]) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-device-life",
    label: "附件与生活同步",
    version: "1.0.0",
    capabilities: [
      { id: "media.attachments", packId: "fuyue-device-life", label: "图片附件", summary: "相册授权、头像、聊天图片与可选模型视觉。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/media", ["GET /status"], ["POST /caption", "POST /vision"]) },
      { id: "life.calendar", packId: "fuyue-device-life", label: "日历与课表", summary: "本地明确授权后读取日程，或从自建后端同步。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/life", ["GET /overview"], ["POST /events"]) },
      { id: "life.health", packId: "fuyue-device-life", label: "健康授权", summary: "Android Health Connect 或 iOS 原生壳明确授权后同步。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["local", "custom_backend", "fuyue_service", "disabled"], requires: ["shell.localdata"], backend: backend("/v1/health", ["GET /status"], ["GET /summary"]) },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-travel-adapter",
    label: "旅行上游适配",
    version: "1.0.0",
    capabilities: [
      { id: "travel.upstream", packId: "fuyue-travel-adapter", label: "旅行与漫游", summary: "带可独立复用的供应商中立旅行前端；后端可接 Nowhere、兼容服务或采用者自己的实现，不捏造示例旅程。", optional: true, frontendIncluded: true, bundledImplementation: "surface", supportedModes: ["custom_backend", "fuyue_service", "disabled"], requires: ["rooms.shared"], backend: backend("/v1/travel", ["GET /status"], ["POST /open", "POST /walk", "POST /look", "GET /journal"]), provenance: { upstreamUrl: "https://github.com/yuyixuanfu/nowhere", license: "CC BY-NC 4.0", recommendation: "upstream_available" } },
      { id: "travel.story_cards", packId: "fuyue-travel-adapter", label: "旅行手记", summary: "Journey Cards 的 MIT 纯文字适配：发一句话或写旅行笔记，直接进入 LocalData；不依赖视觉模型。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "disabled"], requires: ["shell.localdata"], provenance: { upstreamUrl: "https://github.com/nonchaiovo/journey-cards", license: "MIT", recommendation: "adapter_ok" } },
    ],
  },
  {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    id: "fuyue-leisure",
    label: "游戏与玩具",
    version: "1.0.0",
    capabilities: [
      { id: "leisure.fishing", packId: "fuyue-leisure", label: "一起钓鱼", summary: "PolyForm 非商业许可的上游玩法；只指路原作，不混入赴约 AGPL 核心包。", optional: true, frontendIncluded: false, bundledImplementation: "none", supportedModes: ["custom_backend", "disabled"], requires: ["rooms.shared"], backend: backend("/v1/leisure/fishing", ["GET /status"], ["POST /cast"]), provenance: { upstreamUrl: "https://github.com/tutusagi/ai-fishing-game", license: "PolyForm Noncommercial 1.0.0", recommendation: "upstream_available" } },
      { id: "leisure.games", packId: "fuyue-leisure", label: "一起游戏", summary: "按许可证独立安装的游戏房接口说明。", optional: true, frontendIncluded: false, bundledImplementation: "none", supportedModes: ["local", "custom_backend", "disabled"], requires: ["rooms.shared"], backend: backend("/v1/games", ["GET /status"], ["POST /session"]) },
      { id: "leisure.toys", packId: "fuyue-leisure", label: "玩具盒", summary: "本机导入或由伙伴创建单文件玩具；在无网络、无同源权限沙箱中运行，活动进入 LocalData。", optional: true, frontendIncluded: true, bundledImplementation: "ready", supportedModes: ["local", "disabled"], requires: ["shell.localdata"] },
    ],
  },
];

export const BUILTIN_CAPABILITIES: CapabilityDefinition[] = BUILTIN_CAPABILITY_PACKS.flatMap((pack) => pack.capabilities);

export function capabilityDefinition(id: CapabilityId): CapabilityDefinition | undefined {
  return BUILTIN_CAPABILITIES.find((item) => item.id === id);
}

export function createCapabilityBuildPlan(
  id: CapabilityId,
  choice: CapabilityInstallChoice,
  generatedAt = new Date().toISOString(),
): CapabilityBuildPlan {
  const capability = capabilityDefinition(id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  if (choice === "frontend_only" && !capability.frontendIncluded) throw new Error(`${capability.label} 没有可单独带走的前端实现`);
  if (choice === "upstream" && !capability.provenance) throw new Error(`${capability.label} 没有登记可直接采用的上游项目`);
  if (!["frontend_only", "upstream"].includes(choice) && !capability.supportedModes.includes(choice as CapabilityRuntimeMode)) throw new Error(`${capability.label} 不支持这种装配方式`);
  const note = choice === "disabled"
    ? "保留数据与迁移兼容，不加载运行时入口。"
    : choice === "frontend_only"
      ? "只复用前端积木与交互，后端行为由采用者自行实现。"
      : choice === "upstream"
        ? "优先采用并阅读原项目；赴约只负责可选适配与来源说明。"
        : choice === "fuyue_service"
          ? "使用实现同一公开协议的现成服务；密钥、账号和计量留在服务端。"
          : choice === "custom_backend"
            ? "按公开接口说明连接使用者自己的后端。"
            : "仅启用已经随公开壳提供的本地实现。";
  return {
    format: "fuyue-build-plan",
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    generatedAt,
    capabilityId: capability.id,
    capabilityLabel: capability.label,
    packId: capability.packId,
    choice,
    targetPath: `extensions/${capability.id.replaceAll(".", "-")}/`,
    requires: capability.requires,
    requiredRoutes: capability.backend?.requiredRoutes ?? [],
    optionalRoutes: capability.backend?.optionalRoutes ?? [],
    ...(capability.provenance ? { upstream: { url: capability.provenance.upstreamUrl, license: capability.provenance.license } } : {}),
    verificationChecklist: [
      "入口、返回和刷新后仍保留当前能力上下文",
      "空态不跳去无关的模型连接页",
      "拒绝授权、离线和后端失败时仍可退出并恢复",
      "真实数据、示例数据和未实现状态有明确区别",
      "导出、日志和公开仓库不包含密钥或私人资料",
    ],
    note,
  };
}

export function localCapabilityStatus(): CapabilityStatus[] {
  return BUILTIN_CAPABILITIES.map((item) => ({
    id: item.id,
    mode: item.bundledImplementation === "ready" ? "local" : "disabled",
    state: item.bundledImplementation === "ready" ? "local_only" : item.bundledImplementation === "surface" ? "surface_only" : "needs_backend",
    detail: item.id === "call.realtime" ? "电话界面、原文记录与语音连接已带；使用前配置 ElevenLabs、豆包或其他兼容语音服务" : item.bundledImplementation === "ready" ? "界面和本机资料都可用" : item.bundledImplementation === "surface" ? "界面和公开接口说明已带；还需要接入运行服务" : "需要安装可配合赴约使用的功能包",
  }));
}
