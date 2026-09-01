# 功能包与前端积木自取目录

这个仓库保持 monorepo，不把十几个小包拆成一排难以同步的 Git 仓库。采用者仍然可以按需带走：[`fuyue.layers.json`](../fuyue.layers.json) 记录依赖图，`pack:take` 只复制选中积木、必要依赖、文档和许可说明，再生成一个可安装的最小工作区。

## 先看再拿

外观与交互有一个不读 LocalData、不连模型的 Showcase：

```bash
npm install
npm run dev:showcase
```

打开 `http://localhost:4175`，可直接试多选漂浮物、配色 / 明暗 / 壳排布、原地浮起叠卡、跟随主题的记忆账本 / 星图和开屏。点“不飘”会清空全部漂浮物；黑白壳也允许继续叠加。GitHub Pages 构建会把同一预览放在主 PWA 的 `/showcase/` 子目录。

Showcase 里的记忆是标明用途的三条示意数据，只存在当次页面内存中；它不会读或写访问者的赴约账本。

## 1. 按功能带走

| 取件 ID | 内容 | 形态 |
| --- | --- | --- |
| `function/localdata` | 人物、原文、记忆、房间、IndexedDB 与迁移副本 | 独立包 |
| `function/model-relay` | 主流模型的自托管流式 relay | 独立服务 |
| `function/memory-review` | L1 / L2 / L3、证据、召回开关与导入降级 | 基于 LocalData |
| `function/memory-cloud-client` | 云记忆开放契约客户端 | 独立包，不带服务端 |
| `function/toybox` | 离线 HTML 玩具校验、沙箱与事件桥 | 独立包 |
| `function/kaomoji` | 颜文字仓库、抽屉和可选 MCP | MIT 独立包 |
| `function/travel-journal` | 纯文字旅行手记与回调 | 独立包 |
| `function/voice-call` | 电话页、实时事件、relay 语音桥与 Android 容器 | 应用切片 |
| `function/device-calendar` | PWA 日历文件与 Android 系统日历读写 | 应用切片 |
| `function/engawa` | Engawa 固定上游、回环 sidecar 和白名单 | 上游集成 |
| `function/cobrowse` | 公开链接解析、摘要与同账本评论 | 应用切片 |

`独立包`可作为 npm workspace 单独构建；`应用切片`会自动带上它依赖的 Web / relay / Android 宿主，不假装成一个零配置组件。

## 2. 按外观 / 交互 / 前端带走

| 取件 ID | 可直接引入的主入口 | 内容 |
| --- | --- | --- |
| `frontend/ui-kit` | `@fuyue/ui/*` | 整套前端积木 + Showcase |
| `frontend/appearance` | `@fuyue/ui/appearance` | 六套重点色、明暗与三种壳排布 |
| `frontend/ambient` | `@fuyue/ui/ambient` | 十种环境状态、完整运动模型与矢量来源 |
| `frontend/motion` | `@fuyue/ui/motion` | 时长、缓动和 reduced-motion |
| `frontend/stack-deck` | `@fuyue/ui/stack-deck` | 原地浮起、再点进入的透明叠卡 |
| `frontend/splash` | `@fuyue/ui/splash` | 可跳过与可重放的开屏 |
| `frontend/memory-visual` | `@fuyue/ui/memory` | 记忆账本、召回开关与随宿主主题变化的字符星图 |
| `frontend/travel-screen` | `@fuyue/travel-ui` | 旅行房前端与失败空态 |
| `frontend/app-shell` | `apps/web` | 首页、聊天、一起、书房、房间五栏 |
| `frontend/chat-surface` | `apps/web/src/chat-view.tsx` | 固定输入框、消息操作、附件与模型状态的应用切片 |

## 列出、取走、验证

```bash
# 看全部可取项和组合方案
npm run packs:list

# 只带走漂浮物、必要 UI / Core 依赖与预览馆
npm run pack:take -- frontend/ambient /absolute/path/fuyue-ambient

# 只带走本地账本
npm run pack:take -- function/localdata /absolute/path/fuyue-localdata

# 带走可纯本地运行的整个前端
npm run pack:take -- profile/frontend-only /absolute/path/fuyue-frontend
```

目标必须是原仓外部、尚不存在的绝对路径。生成后：

```bash
cd /absolute/path/fuyue-ambient
npm install
npm run build
npm run test
npm run dev:showcase
```

每份副本都有 `TAKEAWAY.md`，写明了它为什么带上这些依赖、可引入路径和不应误认为已完成的后端能力。取件工具拒绝覆盖旧目录，并跳过 `.env`、KeyStore、`node_modules`、缓存和构建产物。

## 组合方案

- `profile/whole-home`：Web + relay + Android + 全部开放实现。
- `profile/local-home`：不要后端，保留 LocalData 与本地功能。
- `profile/frontend-only`：整套前端与本地账本，不带 relay / Android。
- `profile/appearance-only`：主题、漂浮物、动效、叠卡和开屏。
- `profile/full-source`：就是本仓，直接 clone，不生成重复副本。

## 版本与许可

公开主体是 AGPL-3.0-only；包内另行标注的 MIT 组件保留它们自己的许可。取件会复制 `LICENSE`、`THIRD_PARTY_NOTICES.md`和相应上游说明；它不会把私密数据、账号、Cookie 或供应商 Key 当成“示例”一起带走。
