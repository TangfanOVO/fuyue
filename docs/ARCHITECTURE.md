# 模块分层

赴约公开候选不再是一个“前端壳 + 无限预留按钮”，而是五层可验证结构。根目录 `fuyue.layers.json` 同时给人和 agent 一份机器可读的双轴自取清单：一轴按功能，一轴按外观 / 交互 / 前端。具体取件 ID 和命令见 [PACKS.md](./PACKS.md)。

## 1. 本地核心

`@fuyue/core` 定义 LocalData、人物、连续聊天账本、记忆和共同记录的数据结构，以及导入导出和 relay 契约。不连模型也可以打开、编辑和迁移这一层。

公开版的短期上下文保持可解释：普通聊天从 LocalData 取最近 48 小时、最多 100 条原文；电话只携带本通最近 8 轮。家里私有的 Work / Codex 滚动状态卡、后台注入路由和连续性快照不属于公开核心。

`fuyue-shell` 是唯一非可选能力包：

- `shell.localdata`
- `chat.continuous`
- `identity.people`
- `rooms.shared`

## 2. 可选能力包

`packages/core/src/capabilities.ts` 是唯一能力清单。每项声明前端是否已包含、随仓实现是 `ready | surface | none`、依赖、后端路由和可用运行方式。`surface` 只代表入口与契约，不代表用户已经能完成该任务。

| 能力包 | 默认策略 | 可选运行方式 |
| --- | --- | --- |
| `fuyue-memory` | 前端与本地账本可用 | 本地 / 自建后端 / 现成协议服务 / 关闭 |
| `fuyue-reading` | 可选 | 本地 / 自建后端 / 现成协议服务 / 关闭 |
| `fuyue-call` | 内置界面；PWA 需 relay，Android 可走 Keystore | 本机原生桥 / 自建后端 / 现成协议服务 / 关闭 |
| `fuyue-device-life` | 可选，权限分层 | 本地 / 自建后端 / 现成协议服务 / 关闭 |
| `fuyue-travel-adapter` | 独立前端已带；后端不上锁 | 只拿前端 / 原仓库 / 自建后端 / 现成协议服务 / 关闭 |
| `fuyue-leisure` | 玩具盒本地可用，其他游戏按许可选装 | 本地 / 原仓库 / 自建后端 / 关闭 |

`GET /v1/status` 返回当前实例真实支持的 capability 状态。前端的“功能包”页只显示这份状态；没有后端时显示本地能力或待接，不用假数据将空页伪装成已安装。

## 3. 可单独拿走的前端积木

`@fuyue/ui` 按子路径独立构建：

- `@fuyue/ui/ambient`：环境漂浮物与矢量图形。
- `@fuyue/ui/motion`：时长、缓动和 reduced-motion。
- `@fuyue/ui/stack-deck`：原位浮起的透明叠卡。
- `@fuyue/ui/memory`：不绑定后端的记忆账本。
- `@fuyue/ui/appearance`：主题、明暗、排布和漂浮物注册表。
- `@fuyue/ui/splash`：开屏组件。
- `@fuyue/ui/styles.css`：使用 CSS 变量的基础样式。

另有 `@fuyue/travel-ui`（不带假旅程的旅行前端）、`@fuyue/memory-cloud`（不带服务端或密钥的云记忆协议客户端）和 `@fuyue/toybox`（离线玩具校验、沙箱与事件桥）。

它们可以依赖 `@fuyue/core` 的公开类型，但不依赖 relay 或用户数据。

`apps/showcase` 是这些外观积木的静态预览馆。它只读公开注册表和标明用途的内存示意数据；GitHub Pages 会把构建结果合并到主 PWA 的 `/showcase/`。

## 4. 受控的伙伴工具

聊天与电话只向模型声明白名单工具。它们能写伙伴自己的资料、待审记忆、共同房间、外观和本地玩具；不能执行 shell、任意文件、网络或数据库语句。每个动作必须匹配当前请求，写后读回，失败只显示失败痕迹。

## 5. 后端与供应商适配

`apps/relay` 是参考后端，不是所有模块的强制实现。自建服务只要实现相同路由和返回结构，就可以与同一前端连接。

模型密钥的安全边界是：

- PWA：密钥留在 relay 服务端。
- Android APK：OpenAI-compatible 直连可选使用 Android Keystore。
- 手机托管服务：用服务地址 + 接入码换会话；同源走 HttpOnly Cookie，Safari 跨站时走当前浏览器会话 bearer。
- 消费订阅：不把浏览器 Cookie 或账号 Token 交给赴约。

## 上游适配规则

参考或改造其他项目的能力必须同时满足：

1. 独立可选，不进入核心安装。
2. 在 manifest 中保留上游 URL、许可证和推荐策略。
3. 用户界面先给原项目，再给赴约适配层。
4. 赴约适配只承诺“接进同一界面与 LocalData”，不宣称比原项目完整或是自研创意。

当前旅行适配的具体来源见 [UPSTREAM_ADAPTERS.md](./UPSTREAM_ADAPTERS.md)。
