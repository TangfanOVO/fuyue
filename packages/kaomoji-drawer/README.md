# Fuyue Kaomoji Drawer

[简体中文](./README.md) · [English](./README.en.md)

一个可以直接塞进聊天输入区的 React 颜文字抽屉，加上一层可选的本地 MCP 服务。安装后自带 325 枚已去重的公共颜文字，不是空抽屉；支持手动添加/删除、一枚同时归入多个分类、收藏、手动分类顺序、隐藏的使用频率排序和 Unicode 跨设备风险提醒。

它的主入口仍是**前端组件 / 一条命令接入**。MCP 是给 AI companion 和桌面客户端的可选入口，不要求普通用户部署服务器。需要团队数据库、REST API 或 SQLite 时，只要实现同一个 `KaomojiRepository` 接口，无需重写界面或工具定义。

## 三种使用方式

| 方式 | 适合谁 | 数据位置 | 需要后端 |
| --- | --- | --- | --- |
| 本地即用 | 个人网页、PWA、小工具 | `localStorage` | 否 |
| Repository 适配 | 聊天应用、团队产品、智能体工具 | REST / IndexedDB / SQLite / MCP | 由你决定 |
| 本地 MCP | Operit、Codex、Claude Desktop 等支持 stdio MCP 的客户端 | 用户目录中的 JSON | 否，仅需 Node.js |

## 从 GitHub 安装

```bash
npm install https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

也可以固定到发布版本：

```bash
npm install https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

## React 接入

```tsx
import { KaomojiDrawer, createLocalKaomojiRepository } from "@fuyue/kaomoji-drawer";
import "@fuyue/kaomoji-drawer/styles.css";

const repository = createLocalKaomojiRepository();

<KaomojiDrawer
  repository={repository}
  onInsert={(value) => setDraft((draft) => `${draft} ${value}`.trim())}
/>
```

组件不会显示 `useCount`，但每次选用都会在本地累计，并把常用项自然排到前面。

## 纯 HTML / 静态网页接入

没有 React 工程、npm 或打包器也能直接用。页面里准备一个输入框和容器，再加载发布版独立脚本：

```html
<textarea id="message"></textarea>
<div id="kaomoji-drawer"></div>
<script src="https://cdn.jsdelivr.net/gh/TangfanOVO/fuyue-kaomoji-drawer@v0.5.1/dist/standalone.js"></script>
<script>FuyueKaomoji.mount("#kaomoji-drawer", { input: "#message" });</script>
```

脚本已经自带 React、组件和样式，不会再要求页面自己拼 CDN 依赖或 import map；点击颜文字会插入当前光标处并触发标准 `input` 事件。完整可运行页面见 [`examples/standalone.html`](./examples/standalone.html)。若宿主不是输入框，也可传 `onInsert(value)`，或监听容器的 `fuyue-kaomoji-insert` 事件。

## 精选库订阅

安装一次以后，不必为了新增颜文字反复升级整包。打开「整理 → 精选库」即可选择：

- **自动同步**：打开抽屉时至多每天检查一次；
- **仅手动**（默认）：只有点「立即同步」才联网；
- **关闭**：完全不检查远端精选库。

同步只会追加公开仓库里已经审核过的新条目。它不会覆盖收藏、使用次数、手动分类与分类顺序，也不会把用户删掉的颜文字重新塞回来。个人数据始终留在调用方自己的 `KaomojiRepository`；远端只提供版本化公共内容。

需要私有镜像或自己的精选源时，可以替换清单地址：

```tsx
<KaomojiDrawer
  repository={repository}
  catalog={{ manifestUrl: "https://example.com/kaomoji/manifest.json" }}
  onInsert={insert}
/>
```

传入 `catalog={false}` 可以完全隐藏同步控件。公共清单格式见 [`catalog/manifest.json`](./catalog/manifest.json)。

想完全自己分类或导入别的系统，可以直接取 [`catalog/kaomoji-values.json`](./catalog/kaomoji-values.json)：它只包含原始颜文字字符串，不附带本项目的分类、标签或兼容性判断。使用 JSON 数组而不是逐行文本，是为了让带换行的字符画仍保持为一枚完整颜文字。

## 给 AI 使用：可选 MCP

MCP 不会模拟点击抽屉。AI 调用 `kaomoji_pick` 后会得到一个颜文字，再把它放进自己的回复；选用次数会写进本地 JSON，常用项随后自然靠前。

先全局安装固定版本：

```bash
npm install -g https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz
```

再在支持 stdio MCP 的客户端里增加：

```json
{
  "mcpServers": {
    "kaomoji": {
      "command": "fuyue-kaomoji-mcp"
    }
  }
}
```

也可以直接让客户端用 `npx` 拉取 GitHub 版本：

```json
{
  "mcpServers": {
    "kaomoji": {
      "command": "npx",
      "args": ["-y", "https://github.com/TangfanOVO/fuyue-kaomoji-drawer/archive/refs/tags/v0.5.1.tar.gz"]
    }
  }
}
```

默认数据文件是 `~/.fuyue-kaomoji/kaomoji.json`。首次运行即会读到包内的 325 枚默认库；旧版的 6 枚起始数据也会自动补齐。可用环境变量 `FUYUE_KAOMOJI_PATH` 指向另一份 JSON。工具包括：

- `kaomoji_search`：按情绪、名称、分类或颜文字片段搜索；
- `kaomoji_pick`：从高质量候选池里轮换选择、避免连续重复，并累计隐藏频率；
- `kaomoji_add` / `kaomoji_remove`：单枚或一次最多 200 枚分类写入，以及按原文删除；
- `kaomoji_favorite`：收藏或取消收藏；
- `kaomoji_inspect`：不入库，只检查乱码与跨设备兼容风险。

Operit 是否能直接使用，取决于当前版本是否支持本地 stdio MCP 与自定义命令。支持时只需配置一次；不支持时仍可单独使用 React 抽屉。

旧数据里的 `shy`、`studying`、`sad`、`angry`、`happy` 等英文分类会在读取时自动合并进中文分类。分类标签默认按隐藏使用频率、收藏和常用度排序；在「整理」里也可以拖动或用箭头手动排序。一旦手动排过，人定的顺序优先，新分类才按智能顺序补在后面。

### 让抽屉与 AI 共用频率

浏览器的 `localStorage` 和本地 MCP 的 JSON **不会天然互通**。若想真正实现“人常用什么，AI 也逐渐常用什么”，请让前端 repository 和 MCP 指向同一份后端/文件桥接：

```text
React drawer ── KaomojiRepository ── shared REST/SQLite/JSON bridge
                                      └── MCP tools
```

本仓库故意不附带公网同步账号；精选库只同步公共内容，个人收藏、频率和私有共享仍由使用者自己的应用边界决定。

## 自己接数据源

实现 `KaomojiRepository` 即可连接 REST API、IndexedDB、SQLite 或可选 MCP 工具：

```ts
import type { KaomojiRepository } from "@fuyue/kaomoji-drawer";

const repository: KaomojiRepository = {
  list: () => fetch("/api/kaomoji").then((response) => response.json()).then((data) => [...data.items]),
  upsert: (value, categories, label) => request("/api/kaomoji", { method: "POST", body: { value, categories, label } }),
  remove: (value) => request(`/api/kaomoji/${encodeURIComponent(value)}`, { method: "DELETE" }),
  markUsed: (value) => request("/api/kaomoji/use", { method: "POST", body: { value } }),
  setFavorite: (value, favorite) => request("/api/kaomoji/favorite", { method: "POST", body: { value, favorite } }),
};
```

`list()` 每次都应返回一个新数组；组件据此可靠刷新收藏、频率和删除后的界面。内置 `localStorage` 与 JSON repository 已遵守这项约定。

如果后端还有自动抓取候选箱，再实现可选的 `KaomojiReviewRepository` 并传给 `reviewRepository`。抽屉会显示“不收 / 收原版 / 收兼容版”，同一枚颜文字可用中文逗号、英文逗号、顿号或斜杠同时归入多个分类。

远程抓取与自动审批应放在你自己的 repository/backend 适配层：保留来源和许可证；可信且跨设备稳定的条目可以自动入库，罕见字形、分类存疑或来源不清的条目应进入人工候选箱。不要把未经审核的网页集合静默发布给所有用户。

## Unicode 兼容说明

明确归在 `ASCII Art`、`ascii_art` 或「字符画」的条目会保留换行和缩进，这些排版符不会被误报为异常字符。真正的损坏字符和缺失字形风险仍会照常提醒。

部分颜文字在一台设备正常、另一台设备变成黑条或方块，通常是缺少字体字形或叠加符号渲染差异，不一定是 UTF-8 损坏。本组件会：

- 清除只用于文本传输方向控制的字符；
- 保留原始颜文字；
- 标注叠加符号和罕见字形风险；
- 可以生成一份损失细节但更稳定的副本。

兼容检测是风险提示，不是所有设备字体的绝对保证。

## 开发

```bash
npm install
npm test
```

要求 Node.js 20 或更新版本。MCP 使用官方 TypeScript SDK v2 的 stdio transport；协议输出只走 stdout，不在那里打印调试日志。

## 致谢

交互灵感与部分默认数据来自 [Pyruslili/KaomojiDrawerKit](https://github.com/Pyruslili/KaomojiDrawerKit)，依 MIT 许可使用；详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。React/TypeScript 组件为独立实现。

许可证：[MIT](./LICENSE)。允许个人与商业使用、修改、分发和再许可；请保留版权与许可证声明。
