# 安全与隐私

## 默认边界

- Web 端不提供 API Key 输入框，不把供应商凭据写入 LocalStorage、IndexedDB 或构建产物。
- `npm run setup:deepseek` 在交互式终端遮住 Key，只更新被 Git 忽略的 `apps/relay/.env`，并把文件权限设为 `600`。不要截图、上传或手工复制这个文件。
- relay 默认只监听 `127.0.0.1`；意外绑定公网会拒绝启动。
- 跨域请求使用显式 Origin allowlist，不返回通配 CORS。
- 请求正文限制为 1 MB，用户输入限制为 40,000 字符，人物和记忆数量有上限。
- 上游鉴权错误不会把响应正文、密钥或请求头返回给浏览器。
- 用户停止回复或连接关闭时会取消上游请求；半截回复不写入正式账本。
- `clientMessageId` 用于进程内幂等。生产多实例部署应把幂等记录换成共享、带过期时间的存储。
- 可选接入码只在兑换请求正文中出现，成功后换成 HttpOnly Cookie；错误尝试按来源地址做短时限流。生产多用户服务仍需正式账号与撤销机制。

## 导入

- 只接受当前 `fuyue-portable` schema。
- 重复 ID、孤立消息、孤立记忆证据和超长字段会拒绝导入。
- 完全重复项跳过；同 ID 不同内容保留本机版本并在预览中提示。
- 导入记忆无条件改为 `draft` 且关闭召回。
- 人物资料默认不替换，只有使用者在预览页明确勾选才覆盖。

导入文件依然是不可信输入。不要把来源不明的 JSON 当作可信人格或记忆；导入后逐条审阅记忆和人物资料。

## 发布闸门

`npm run check:privacy` 会拒绝常见密钥形状、私钥、数据库、归档、source map、绝对用户路径、符号链接、超大文件和未审阅位图。发布者还应通过 `PUBLIC_PRIVATE_MARKERS` 传入自己的姓名、域名、仓名和主机别名：

```bash
PUBLIC_PRIVATE_MARKERS="name.example,private-host,private-repo" npm run check:privacy
```

自动扫描不能代替人工审阅。公开发布必须来自 `npm run package:public` 生成的全新目录，并使用新的 Git 历史，不能把私有总仓直接改成 Public。
