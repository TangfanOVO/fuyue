# 当前状态

更新时间：2026-09-01

## 已完成

- 独立 `open-source/` 物理边界
- React Web 应用与 `@fuyue/core` 数据包
- IndexedDB 首次初始化、数据库版本 6 与 `fuyue-portable` schema 5
- 人物资料、陪伴者说话原则、聊天原文与来源标签
- L1 / L2 / L3 记忆草稿、启用、停用和删除
- `fuyue-portable` JSON 导出
- `fuyue-portable` 严格校验、预览、冲突保留、幂等导入与人物替换确认
- 导入记忆强制回到关闭召回的待审草稿
- AGPL-3.0-only 许可证与公开包边界文档
- 隐私检查脚本
- 五栏手机前端与可返回的二级页面
- 自托管 relay 类型、客户端与接口文档
- 自托管 relay 参考服务、OpenAI Responses、Gemini Interactions、Anthropic Messages 与 OpenAI-compatible provider 适配器
- GLM、Qwen、Kimi 与 OpenRouter 配置预设
- DeepSeek 一枚 Key 默认配置、遮蔽输入、`600` 权限配置文件、配置检查与前后端同时启动命令
- 默认本机绑定、Origin allowlist、正文上限与显式公网防误开闸门
- 手机订阅服务入口、一次性接入码兑换、HttpOnly Cookie / Safari bearer 会话与失败次数限制
- 原位浮起叠卡语法，以及 PWA / relay / iOS 原生壳手机权限分层契约
- SSE / NDJSON 流式回复、停止与错误恢复
- 纯本地模式和连接模式共用同一份聊天账本
- 6 组重点色、独立白天/黑夜、3 种外壳、9 种可多选叠加的同笔触漂浮物与一键清空的“不飘”模式；黑白壳不再强制关闭漂浮物
- 单一连续聊天账本；Work、Codex、relay 与外部来源只在档案中分辨
- PWA manifest、应用图标、Service Worker 与离线壳
- 无 Git 历史的候选公开副本脚本与洁净目录验证脚本
- 七类本地生活记录、可迁移外观设置和导入前作者 / 来源 / 内容抽样
- 普通聊天 48 小时原文召回（最多 100 条）；电话只带本通最近 8 轮；记忆召回最多 200 条
- Android Capacitor 容器、Keystore AES-GCM 供应商 Key 保存、HTTPS OpenAI-compatible 直连与断开入口
- 已验证私有连续性 capsule 到 `fuyue-portable` schema 5 的转换器
- GitHub Actions Android 调试 APK 构建和 14 天产物上传
- GitHub Pages PWA 构建与部署 workflow
- capability v1 能力清单、relay 状态和前端功能包体检页
- 功能状态区分“本地可用 / 只有入口 / 待接后端”，不把可见卡片冒充已完成功能
- `@fuyue/ui` 环境效果、动效、叠卡和记忆账本独立入口
- 颜文字抽屉按需加载，React、图标与业务代码分块缓存
- 旅行上游适配的来源、许可证、上游优先与可选后端策略
- Journey Cards 纯文字旅行手记：单句与长笔记写入 LocalData，不捆绑旅行生图或多模态依赖
- Engawa MCP 的 MIT 锁版本、本机侧车、relay 状态与受限工具适配；安装产物只进被忽略的 `.runtime/`
- GitHub / 小红书公开链接“一起看”：聊天原话或空间分享均可进入，relay 只读白名单公开元数据；读取失败会留失败记录而不会生成伙伴假评论
- 共读与共听保留赴约前端，分别明确推荐 Readest 与 music-together；不接管账号 Cookie，也不冒充同步后端
- 公开运行时对明确排除功能的自动扫描
- 电话已作为内置功能接入麦克风、STT、当前聊天模型、TTS、打断与原文 / 语音归档；ElevenLabs、豆包和自定义 JSON 语音契约已有 relay 与 Android 源码
- 功能包已区分内置、魔改提示、原仓库、只拿前端、自建 / 兼容服务与完全隐藏；隐藏会真正撤掉普通入口且不写共同工作本
- Gemini Interactions 已显式使用无状态请求；OpenAI Responses、Gemini、Anthropic Messages 与 GLM / Qwen / Kimi / OpenRouter 兼容端点均有 URL、鉴权、请求体和流式解析契约测试
- 公开仓库、GitHub Pages PWA、Showcase 与固定签名的滚动 Android beta 已发布

## 本次验证

- 从无 `node_modules`、无 `dist` 的洁净副本完成 `npm ci`、TypeScript typecheck、141 项测试与生产构建
- 公开边界扫描通过：独立发布副本 279 个公开文件、当前工作目录 281 个公开文件；本机 `.runtime/` 安装产物与本地验收报告被明确排除
- Vite 生产构建通过，颜文字保持按需分块，无大块警告
- `npm audit --omit=dev` 为 0 个已知生产依赖漏洞
- 390×844 隔离 Chrome 完成 19 组回归：契约 relay 流式对话、断网原文保存与恢复、人物、记忆、心情、课表、功能装配、五个大区和 37 个抽屉入口；无白屏、异常目的地或浏览器错误
- README 新用户路径另有跨层门禁：浏览器第一句话已穿过正式 relay 的 9 项工具校验并抵达测试上游
- Journey 假测试手记与一起看失败记录均在刷新后读回；Engawa 锁版本侧车真实健康探测、12 项工具清单、`daily_poem` 读回和 relay 转发通过
- Android Web 资源同步进原生工程通过；交互 detector 最终无高置信问题
- Android Calendar Provider 已实现按需授权、日历枚举、读取、系统确认写入与直接写入；PWA 不冒充拥有该权限
- 本机 JDK 21、Android SDK 36 与 Build Tools 36 已对当前源码重新完成 Gradle 编译；最新 `app-debug.apk` 生成成功
- Android 原生单元测试、Lint、APK v2 调试签名、包名 / 最低版本 / 权限与禁用系统备份检查通过
- GitHub Actions 的 Node 22 Pages 构建与 JDK 21 `assembleDebug` 均通过；线上 PWA、Showcase、聊天空态、记忆与电话预览已在未登录浏览器复验

## 尚未完成

- 带真实付费 Key 的 OpenAI、Gemini、Anthropic、GLM、Qwen、Kimi 和 OpenRouter 最终端到端验收；DeepSeek 已完成一次真实 relay 流式对话、断网恢复和人设注入回归，其余供应商的配置、SSE 流、错误映射与隐私边界目前由模拟上游覆盖
- `.ics` 日历导入、生活同步捷径、Android Health Connect 与 iOS 原生壳；Android Calendar Provider 已编译进 APK，但权限同意、拒绝、撤回和真实系统日历双向写入仍待真机验收
- 当前调试 APK 已在安卓真机覆盖安装并启动；这次上下文分层改动后的重启 Keystore 持久化与真实付费 Key 端到端回归仍需人工验收
- ElevenLabs 和豆包真实付费 Key / Voice ID 的转写、合成、打断、归档与厂商错误映射真机验收；当前由类型检查、relay 模拟上游和 Android 编译覆盖
