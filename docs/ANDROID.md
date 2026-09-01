# Android APK

Android 与 iPhone PWA 使用同一份 `apps/web` 前端和同一份 `fuyue-portable` LocalData。`android/` 只增加原生容器与设备边界，不维护第二套页面。

## 使用者：拿 Key 直连

安装 APK 后进入“模型连接 → Android 直连”：

- 从内置供应商列表选择 DeepSeek、GLM、Qwen、Kimi 或 OpenRouter；
- 再从该供应商的模型列表选择模型；
- 粘贴 API Key。赴约会识别常见 Key / 地址提示并提醒可能选错的供应商；无法唯一识别的通用 `sk-` Key 不会被擅自归类；
- 只有选择“自定义兼容接口（高级）”时才显示 HTTPS 地址和模型名输入框。

赴约会先调用供应商的 `/models` 验证配置。验证通过后，Key 从 React 表单状态清空；Android 原生层使用 AES-GCM 加密密文，加密密钥由 Android Keystore 生成且不可导出。聊天请求由原生层附加 Key，WebView 不读取已保存 Key，Key 也不会进入 LocalData 导出。普通聊天主动发送时会带上永久原文账本中最近 48 小时内最多 100 条原文、人物资料、明确启用的记忆，以及最近的工作本、日记、时间线和可见心情。电话不重放这 48 小时，只带本通最近 8 轮及相同的明确资料。48 小时只限制模型短期上下文，不删除原文档案。

设备被 root、系统被攻破或输入法本身不可信时，任何应用级方案都无法承诺绝对保密。公开 APK 不接管 ChatGPT、Gemini 等消费订阅账号 Cookie；需要联网模型时使用受支持的 API 或 relay。

## 打电话

电话是 APK 内置功能，不是需要再拉取的“电话项目”。先在“模型连接”配好聊天模型，再进入“电话”：

- 默认可选 ElevenLabs 或豆包，粘贴各自 API Key 和 Voice ID；
- 语音 Key 使用与模型 Key 分开的 Android Keystore 密文保存，不进 WebView、LocalData 或导出包；
- “其他”只接入使用者自己的 HTTPS JSON STT / TTS 端点，不假设所有语音供应商兼容；
- 开始时才申请麦克风权限。每轮点“开始说”、说完再送出；转写后交给当前聊天模型，回复再由当前语音供应商播放；
- 转写和回复永久进同一份原文账本。“本机保留录音”开启时，双方语音附件也可回放和导出。

当前公开实现是可打断的单轮语音对话，不宣称是持续双工通话。ElevenLabs 与豆包的付费真 Key / 真声音仍需发布前真机验收。

## 开发者：构建可安装调试包

需要 Node.js 22.12+、JDK 21 和 Android SDK 36：

```bash
npm ci
npm run android:debug
```

产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。也可以在 GitHub Actions 手动运行 “Android debug APK”，下载 14 天内有效的构建产物；该 workflow 也会在推送到 `main` 时自动触发，不想自动构建时应先关闭它的 `push` 触发。

Debug APK 适合自己安装和验收。面向公众发布应由发行者创建自己的签名密钥、妥善离线保管并构建签名 release；仓库和 CI 不包含任何签名私钥。

## 不反复下载：手机预览与安卓联调壳

只检查页面、跳转、空状态和 LocalData 时，让电脑与手机连同一个 Wi-Fi，在电脑运行：

```bash
npm run dev:phone
```

终端会显示形如 `http://192.168.x.x:4184/` 的地址，手机浏览器直接打开即可。这个 HTTP 局域网页面适合交互审阅，不等于可安装的正式 PWA；浏览器麦克风、系统日历、Keystore 和安卓侧滑返回仍需原生壳。

第一次启用原生热更新时，打开手机的 USB 调试或无线调试，允许这台电脑，然后运行：

```bash
npm run android:live
```

它会自动找同一 Wi-Fi 的电脑地址、安装一次同包名联调壳并保持 Vite 热更新。之后改 React、CSS、漂浮物或文案，只要电脑服务仍开着，保存文件后手机会刷新，不必重新传 APK；聊天仍可使用设备里已有的 Android Keystore 配置。修改 Java 原生插件、权限清单、应用图标、启动页或 Capacitor 原生配置时，才需要重新运行 `android:live` 或构建 APK。联调壳通过局域网 HTTP 加载，仅用于自己可信的测试网络，不能当发布包分发。

如果系统默认 Java 为 25 并出现 `Unsupported class file major version 69`，不要升级仓库的 Gradle wrapper 来掩盖环境问题；将 `JAVA_HOME` 指向 JDK 21 后重试。GitHub Actions 已固定 Temurin 21。

## 安卓真机验收

1. 把 `app-debug.apk` 传到安卓手机，用“文件”打开；系统询问时，只给当前文件应用一次“安装未知应用”权限。
2. 打开赴约，进入左上角抽屉的“模型连接”，选择“Android 直连”。
3. 供应商选择 DeepSeek，再选择你账户可用的模型，粘贴 Key 并点“验证并保存”。普通使用者不需要填写地址；只有非预设兼容服务才使用高级自定义。不要把 Key 发到聊天、截图或 LocalData。
4. 连续发送两轮消息，确认回复进入同一份聊天账本；完全关闭赴约后重新打开，再发送一轮，确认 Keystore 配置仍然有效。
5. 在“本地副本”导出 `fuyue-portable`，确认导出可以预览和重新导入；API Key 不应出现在导出文件中。
6. 进入“一起 → 课表 → 选择日历来源”。先用“打开系统确认页”添加测试安排；再分别测试只读授权、直接读写授权、拒绝、撤回、多个账号日历与重新打开应用。首页只能显示真实系统安排，不能出现示例课表。
7. 进入“电话”，分别配置 ElevenLabs 或豆包测试 Key / Voice ID。首次开始时同意麦克风，完成两轮，确认能打断、转写与回复进原文账本、录音开关正常，并在档案回放语音附件。
8. 测试结束后可分别清除模型 Key 与语音 Key，再撤销麦克风、日历与文件应用权限。

开发者使用 USB 调试时，也可以运行：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 私有赴约重生

先在私有环境解密连续性备份，再在公开源码目录运行：

```bash
npm run convert:private -- /path/to/decrypted-capsule /path/to/fuyue-localdata.json
```

转换器逐文件验证 manifest 中的大小和 SHA-256，转换聊天原文、记忆证据、时间线、碰一碰、信件、日记、碎碎念和工作本。打开 APK 的“本地副本 → 审阅并导入副本”，核对作者、来源与内容抽样后再确认。导入记忆仍会强制降回待审草稿。

解密后的 capsule 和生成的 LocalData 都含高敏感私人内容；不要放进公开仓库、网盘分享链接或 GitHub Actions。

## 当前原生边界

- 源码已实现：Android Keystore 模型 / 语音 Key 分开保存、HTTPS OpenAI-compatible 直连、ElevenLabs 与豆包 STT / TTS 电话桥、自定义语音 JSON 契约、Calendar Provider 读取与明确授权后的直接写入、无需整库写权限的系统日历确认页、硬件返回所用的 Web 历史栈、LocalData 导入导出。
- 仍需候选 APK 真机验收：Calendar Provider 权限拒绝与撤回、厂商日历兼容、多个账号、全天事件和直接写入后的首页刷新。没有这些证据前不能写成“Android 日历已验收”。
- 未声称实现：Health Connect 自动同步、后台常驻、推送、相册人物识别。
- Android 系统云备份已关闭，避免 WebView 中的聊天和 Key 密文进入厂商备份。重生依赖使用者主动保存的 `fuyue-portable` 文件。
