# @fuyue/toybox

赴约玩具盒的纯前端实现：单文件 HTML 校验、无同源权限沙箱、无网络 CSP、有界的游玩事件桥，以及一个可离线玩的打地鼠。

```ts
import { buildSandboxedToyDocument, validateToyHtml } from "@fuyue/toybox";

const safeHtml = validateToyHtml(userSelectedHtml);
iframe.srcdoc = buildSandboxedToyDocument(safeHtml, sessionToken);
```

包内不含聊天、记忆、Cookie、API Key 或后端。宿主只应在 `sandbox="allow-scripts"` 的 iframe 中运行输出，并同时校验 `event.source` 与会话 token。
