# 赴约 Fuyue

赴约是一只面向本体恋与 AIRP 的本地优先简易小手机。它不模拟完整操作系统，先把陪伴者、聊天原文与可审阅记忆保存在使用者自己能带走的 LocalData 中，再通过自托管 relay 或 Android 原生密钥桥接入模型。

> 当前是 `0.1.0-beta.1` 公开候选。LocalData、界面、DeepSeek 主路径和自动测试可用；其余付费供应商尚未全部用真 Key 验收，因此不标成稳定版。

[在线打开赴约](https://tangfanovo.github.io/fuyue/) · [看外观与前端积木](https://tangfanovo.github.io/fuyue/showcase/) · [下载 Android 测试包](https://github.com/TangfanOVO/fuyue/releases) · [查看源码](https://github.com/TangfanOVO/fuyue)

## 先选一条路

| 我想要 | 最短做法 | 会不会自动更新 | 能不能用系统能力 |
| --- | --- | --- | --- |
| 先看看长什么样 | 打开[在线预览](https://tangfanovo.github.io/fuyue/)；不填连接时只运行 LocalData | 是 | 浏览器允许的范围内 |
| iPhone / iPad 使用 | Safari 打开预览，分享 → 添加到主屏幕 | 是 | 相册、麦克风等 Web 权限；没有 Android Calendar Provider / Keystore |
| Android 普通使用 | Chrome 打开预览，菜单 → 安装应用；不需要另下 APK | 是 | 同上，适合绝大多数人先体验 |
| Android 原生直连 | 从 [Releases](https://github.com/TangfanOVO/fuyue/releases) 安装测试 APK | 否，更新需装新包 | 多 Android Keystore、系统日历与原生返回 |
| 自己接 API 聊天 | 下载源码后运行 `npm install && npm run setup && npm run dev:all` | 由自己部署 | Key 只进 relay；Android 也可走 Keystore |
| 只拿漂浮物 / 星图 / 叠卡 | 先看 [Showcase](https://tangfanovo.github.io/fuyue/showcase/)，再用 `npm run packs:list` | 跟随自己的项目 | 按所取积木决定 |

Pages 是可安装的静态 PWA，不会托管任何人的 API Key，也没有公共免费 relay。在线预览中的资料只保存在当前浏览器；清除站点数据会清掉它。完整自托管、备份和安全边界放在 `docs/`，README 只保留第一次使用真正需要的路径。

## 模型支持不是一张假绿表

| 路径 | 当前证据 | 首个 beta 的口径 |
| --- | --- | --- |
| DeepSeek | 官方 Chat Completions 契约测试；真实 relay 与 Android 往返已各验过 | 已实测主路径 |
| OpenAI | Responses API 的 URL、鉴权、请求体与 SSE 假上游测试 | 契约已测，真 Key 待验 |
| Gemini | Interactions API 的无状态请求、鉴权与 SSE 假上游测试 | 契约已测，真 Key 待验 |
| Anthropic | Messages API 的鉴权、请求体与 SSE 假上游测试 | 契约已测，真 Key 待验 |
| GLM / Qwen / Kimi / OpenRouter | 各自官方兼容端点的 URL、鉴权、请求体与 SSE 假上游测试 | 契约已测，真 Key 待验 |

OpenAI-compatible 只表示请求形状相近，不表示供应商模型、工具调用、限流和错误码永远相同。首版不要求作者先购买七家额度，但没有真 Key 证据的供应商不会写成“已实测”。DeepSeek 与兼容路径目前可使用白名单本机工具；OpenAI、Gemini 和 Anthropic 首版先提供聊天，工具调用等各自协议完成后再升格。

这一份候选公开包已经可以独立安装：

- 五栏 Web / PWA：首页、聊天、一起、书房、房间
- 浏览器 IndexedDB 本地账本与一条连续聊天时间线
- 双方人物资料与陪伴者说话原则
- 可审阅、启用、停用和删除的 L1 / L2 / L3 记忆
- 带来源与模型标签的原始聊天
- `fuyue-portable` JSON 导出、预览、冲突检查与幂等导入
- 导入记忆一律降回待审草稿，不会自动参与模型召回
- 自托管 relay 参考实现
- 手机友好的“服务地址 + 接入码”与 HttpOnly 会话
- OpenAI Responses、DeepSeek / OpenAI-compatible、Gemini Interactions 和 Anthropic Messages 流式适配器
- 连接后可见的模型与思考深度选择；不会列出服务端没有真实配置的模型
- 受限本机工具：改伙伴自己的个签 / 心情、写待审记忆、调整外观、按明确请求写共同房间，或创建 / 修改离线 HTML 玩具；聊天与电话共用，不开放任意 Bash 或文件系统
- GLM、Qwen、Kimi 和 OpenRouter 可配置预设
- 日程与陪伴者主动公开心情的只读 JSON 接口
- PWA 安装与离线壳；离线时 LocalData 仍可读写
- 六套重点色、独立白天/黑夜、三种页面布局、九种可多选叠加的环境漂浮物与一键清空的“不飘”模式；黑白壳也可以保留漂浮物
- 与 PWA 共用页面的 Android APK 容器、Keystore BYOK 直连与按需系统日历桥
- 内置电话界面、麦克风授权、转写 / 回复 / 语音归档，默认适配 ElevenLabs 与豆包；中文支持可插话的实时全双工，豆包只做耳朵和嘴，回答仍由当前模型带人物、启用记忆、本通电话原文、日历和白名单工具生成；Android 语音 Key 进 Keystore，PWA / iOS 走 relay
- 本地时间线、信箱、碰一碰、工作本、装修日记、修补本和伙伴碎碎念
- 本地玩具盒：内置打地鼠、单文件 HTML 导入、无网络沙箱、游玩事件审计与副本迁移，不需要后端
- 一起看：聊天里贴公开小红书 / GitHub 链接，或在小小空间留链接；relay 真读标题与摘要后才让同一聊天模型评论，结果进入 LocalData
- Engawa 阅读侧廊：MIT 上游固定版本、本机回环侧车、relay 白名单与网页 / RSS / 诗 / 书架前端随整屋提供
- Journey Cards 纯文字旅行手记：一句话或长笔记直接保存到 LocalData，不依赖视觉模型
- 共读和网易云共听保留赴约前端；因自家需求很轻，分别诚实推荐 Readest 与 music-together 的完整实现
- 当前对话最近 48 小时原文在主动发送时与审阅记忆一起交给当前模型
- 公共边界扫描、洁净目录安装和发布副本脚本
- 核心 / 记忆 / 共读 / 电话 / 设备生活 / 上游适配的 capability 契约与界面体检
- 可分别引入的外观 / 开屏 / 漂浮物 / 排布积木、旅行前端、记忆云契约客户端与玩具盒运行时

默认不会调用任何模型，也不会向网络发送 LocalData。只有使用者主动发送时，当前一轮、该账本 48 小时内最多 100 条近期原文、两份人物资料与明确启用的记忆才会交给当前模型。PWA 的 API Key 只放在 relay 服务端；Android APK 可选用原生 Keystore 密钥桥 BYOK，Key 不进入 LocalData。

聊天与电话的短期上下文有意分开：普通聊天使用上述 48 小时原文窗口；电话只携带本通已完成的最近 8 轮、人物、启用记忆和使用者明确选择的生活 / 日历资料。两条路径都不会暗中加入未授权的数据源或工具日志。

## 用 DeepSeek Key 跑起来

需要 Node.js 22.12+。下载项目后，在项目目录运行：

```bash
npm install
npm run setup:deepseek
npm run dev:all
```

配置命令会让你粘贴 DeepSeek API Key，输入不会回显；Key 只写入被 Git 忽略、权限为 `600` 的 `apps/relay/.env`。`dev:all` 会同时启动网页和本机 relay。打开 `http://localhost:4173`，进入“模型连接 → 本机 API → 连接本机 DeepSeek”。

默认模型是 `deepseek-v4-flash`。需要 Pro 时使用：

```bash
npm run setup:deepseek -- --model deepseek-v4-pro
```

可在不显示 Key 的前提下检查配置：

```bash
npm run doctor:relay
```

完整步骤与错误对照见 [DeepSeek 快速开始](./docs/DEEPSEEK_QUICKSTART.md)。默认端点和模型于 2026-08-22 按 DeepSeek 官方文档复核，仍可在 `.env` 中显式覆盖。

## 一次配置整屋

```bash
npm install
npm run setup
npm run dev:all
```

向导支持 DeepSeek、OpenAI、Gemini、Anthropic、GLM、Qwen、Kimi、OpenRouter，以及可选 ElevenLabs / 豆包语音。所有 Key 都在不回显输入中读取，只写入 Git 忽略且权限为 `600` 的 `apps/relay/.env`；命令行参数不接受密钥。向导随后把固定版本的 Engawa 安装到同样被 Git 忽略的 `.runtime/engawa`，它不需要也不读取模型 Key。

## Android APK

Android 不是另一套前端：它使用同一份 `apps/web` 和 LocalData，只增加原生容器、安全 Key 桥、麦克风 / 电话桥、按需系统日历桥和硬件返回。安装 APK 后可在“模型连接 → Android 直连”选择 DeepSeek、GLM、Qwen、Kimi 或 OpenRouter 与对应模型，再粘贴 Key；电话页另选 ElevenLabs、豆包或自定义语音服务。只有高级兼容服务需要手填端点。日历读取与写入在“课表 → 选择日历来源”单独授权，不会被送去模型 API 页面。

开发构建、CI 调试包、密钥边界和重生导入见 [Android APK 说明](./docs/ANDROID.md)。

GitHub 候选仓库包含两个 workflow：“Deploy PWA to GitHub Pages”生成 iPhone / iPad 可安装的 HTTPS PWA，“Android debug APK”生成可下载的调试 APK。两者既可手动运行，也会在推送到 `main` 时自动触发；fork 后不想自动发布或构建，应先修改或停用对应 workflow。PWA 只部署静态前端，relay 仍需自建或另行托管。

## 只用 LocalData

不准备 API Key 也能运行前端：

```bash
npm install
npm run dev
```

打开 `http://localhost:4173`。纯本地模式可以使用人物、聊天原文、记忆、导入和导出，不会假装模型回复。

## 其他模型或远程 relay

其他供应商仍使用服务端环境变量：

```bash
cp apps/relay/.env.example apps/relay/.env
# 在 apps/relay/.env 填一个 provider 的 key、model 和必要的 base URL
npm run dev:relay
```

然后在前端“模型连接”填写 `http://127.0.0.1:8787`。没有完整配置任何 provider 时，relay 可以启动并诚实显示 0 个 provider；前端不会把它保存为可聊天连接。

完整部署边界见 [功能对照表](./docs/FEATURE_PARITY_MATRIX.md)、[手机接入说明](./docs/MOBILE_CONNECTIONS.md)、[模块分层](./docs/ARCHITECTURE.md)、[能力装配](./docs/CAPABILITY_ASSEMBLY.md)、[手机授权与自动填入](./docs/DEVICE_INTEGRATIONS.md)、[自托管说明](./docs/SELF_HOSTING.md) 和 [安全说明](./docs/SECURITY.md)。消费订阅不等于可供第三方应用调用的 API 额度。

## 按需带走

仓库根目录的 [`fuyue.layers.json`](./fuyue.layers.json) 是机器可读的双轴自取目录：`function/*` 按 LocalData、模型 relay、记忆、电话、日历、玩具等功能拆；`frontend/*` 按配色、漂浮物、动效、叠卡、开屏、记忆可视化和整壳拆。`profile/*` 则是整屋、纯本地、只拿前端和只拿外观的组合方案。

不需要人工挑依赖：

```bash
npm run packs:list
npm run pack:take -- frontend/ambient /absolute/new-folder
```

第二条命令会生成一个新的最小 workspace，自动带上必要源码、文档、授权说明、构建命令与 `TAKEAWAY.md`，但不带 `.env`、KeyStore、缓存、构建产物或私人数据。外观积木还有可部署的 Showcase：本机运行 `npm run dev:showcase` 后打开 `http://localhost:4175`，GitHub Pages 则会把它放在主 PWA 的 `/showcase/`。详细表格、import 路径和验证方式见 [自取目录](./docs/PACKS.md)。

界面左上角抽屉与书房都有“功能包”。赴约已完成且许可兼容的实现默认随整家部署；原仓库作为归因、许可证与可替换实现，不会抢占内置实现的默认位置。页面区分“整包已内置”、“前端已带”、“外部扩展”和“已隐藏”，也允许只拿前端、接自己的后端、接兼容服务、使用原仓库或完全隐藏。已经随包运行的能力会当场启用，完全隐藏会真正撤掉普通入口；这两类都不生成重复工作单。只有需要外部实现的选择才会下载 `fuyue-build-plan`，并在共同工作本留下建议路径与验收清单。手机端不会冒充已经拉取仓库。

发版前按 [全量发版审阅口令](./docs/RELEASE_PRODUCT_AUDIT_PROMPT.md) 复跑全部入口、返回、权限、空态与公开边界。

界面图标分别使用 Phosphor 与 Lucide；完整第三方许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 验证与准备公开副本

```bash
npm run typecheck
npm test
npm run build
npm run qa:readme
npm run verify:clean
```

`npm run qa:readme` 会用隔离浏览器走“连接本机 DeepSeek → 发送第一句话”，并确认请求穿过正式 relay 校验后抵达测试上游，专门防止前端与 relay 的工具契约错位。需要复跑完整手机交互时，先用 `npm run dev:all` 启动已配置的本机 relay，再在另一个终端运行 `npm run qa:browser`。它会使用隔离的 390×844 Chrome 上下文验收真实流式回复、断网恢复、五个大区、全部抽屉入口、返回链、主题和功能装配，不会复用日常浏览器里的 LocalData。

生成一个没有 Git 历史、`node_modules`、构建产物或私有总仓文件的新目录：

```bash
npm run package:public -- /absolute/empty/path/fuyue
```

目标目录必须尚不存在，并且必须在当前源码目录之外。它是候选发布副本，不会自动创建 GitHub 仓库或推送。

## 数据承诺

LocalData 默认只进入浏览器 IndexedDB。清除站点数据会清除本地内容，因此重要内容应定期下载副本。导出文件可能含私人聊天和记忆，只应由使用者自己保管，不应提交到 Git。

聊天、记忆和说话方式是三种不同的数据：

- 聊天保存原文、来源与时间线。
- 记忆保存经过审阅的长期信息和来源证据。
- 说话原则保存可迁移的表达约定。

这些资料能帮助不同模型保持连续性，但不能百分之百复制另一个模型的语感。模型版本、系统规则和上下文仍会形成不同口音。

## 项目边界

公开包只含通用源码、空白初始资料、专门编写的测试夹具和文档。个人身份、真实聊天、记忆数据库、媒体、域名、登录态、密钥与生产运维配置不属于公开包。

完整清单见 [PUBLICATION_BOUNDARY.md](./PUBLICATION_BOUNDARY.md)。导入规则见 [对话导入契约](./docs/CONVERSATION_IMPORT_CONTRACT.md)，统一后端接口见 [Relay API 契约](./docs/RELAY_API_CONTRACT.md)。

本项目采用 AGPL-3.0-only。
