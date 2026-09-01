import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/app.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/chat-view.tsx", import.meta.url), "utf8");
const kaomojiSheet = await readFile(new URL("../src/kaomoji-sheet.tsx", import.meta.url), "utf8");
const appearance = await readFile(new URL("../src/appearance.tsx", import.meta.url), "utf8");
const ambient = await readFile(new URL("../../../packages/ui/src/ambient-lines.tsx", import.meta.url), "utf8");
const archive = await readFile(new URL("../src/archive-panel.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const splash = await readFile(new URL("../src/fuyue-splash.tsx", import.meta.url), "utf8");
const splashPackage = await readFile(new URL("../../../packages/ui/src/splash.tsx", import.meta.url), "utf8");
const appearancePackage = await readFile(new URL("../../../packages/ui/src/appearance.ts", import.meta.url), "utf8");
const toybox = await readFile(new URL("../src/toybox-panel.tsx", import.meta.url), "utf8");
const cropper = await readFile(new URL("../src/avatar-cropper.tsx", import.meta.url), "utf8");
const errorBoundary = await readFile(new URL("../src/app-error-boundary.tsx", import.meta.url), "utf8");
const voice = await readFile(new URL("../src/voice-call-panel.tsx", import.meta.url), "utf8");
const memoryPanel = await readFile(new URL("../src/memory-panel.tsx", import.meta.url), "utf8");
const clientTools = await readFile(new URL("../src/client-tools.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const stackDeck = await readFile(new URL("../../../packages/ui/src/stack-deck.tsx", import.meta.url), "utf8");

test("public shell keeps five stable top-level tabs", () => {
  for (const label of ["首页", "聊天", "一起", "书房", "房间"]) {
    assert.match(source, new RegExp(`label=\"${label}\"`));
  }
});

test("top-left drawer is a searchable index for public destinations", () => {
  assert.match(source, /aria-label="打开全部功能"/);
  assert.match(source, /role="dialog"[\s\S]{0,120}?aria-modal="true"[\s\S]{0,120}?aria-labelledby="feature-drawer-title"/);
  assert.match(source, /placeholder="找功能或房间"/);
  assert.match(source, /drawerRef\.current\?\.querySelectorAll/);
  assert.match(source, /data-drawer-entry-id=\{item\.id\}/);
  for (const title of [
    "原文账本", "记忆库", "共同工作本", "我们的时间线", "的心情", "碰一碰",
    "赴约信箱", "本地相册", "共同修补本", "运行状态", "生活同步", "我们是谁", "小小空间", "共读书房",
    "电话", "一起游戏", "玩具盒", "装修日记", "的碎碎念", "旅行与漫游", "功能包",
  ]) assert.match(source, new RegExp(title));
  assert.match(source, /action: \(\) => openPanel\("status"\)/);
  assert.match(source, /function StatusPanel/);
  assert.match(source, /公开壳不会复制私人资料、受限素材或假数据来冒充已完成/);
});

test("switching a root tab unwinds stale panel history before replacing the destination", () => {
  assert.match(source, /pendingRootViewRef/);
  assert.match(source, /window\.history\.go\(-panelDepth\)/);
  assert.match(source, /const pendingRootView = pendingRootViewRef\.current/);
  assert.match(source, /fuyuePanelDepth:\s*0,[\s\S]*fuyueView:\s*pendingRootView/);
});

test("rooms repeats the complete index instead of hiding extension doors", () => {
  for (const title of ["原文账本", "我们的相册", "伙伴的心情", "健康与提醒", "小小空间", "共读书房", "电话", "一起游戏", "玩具盒", "运行状态"]) assert.match(source, new RegExp(title));
  assert.match(source, /id:\s*"repair"[\s\S]{0,160}?icon:\s*<Wrench \/>[\s\S]{0,160}?title:\s*"共同修补本"/);
  assert.match(source, /function RoomsView\(\{[\s\S]{0,200}?openPanel,[\s\S]{0,200}?openFeature/);
});

test("phone and memory follow the same discoverable house distribution", () => {
  const home = source.slice(source.indexOf("function HomeView"), source.indexOf("function TogetherView"));
  const together = source.slice(source.indexOf("function TogetherView"), source.indexOf("function AgendaItem"));
  const rooms = source.slice(source.indexOf("function RoomsView"), source.indexOf("function isRoomPanel"));
  assert.match(home, /openPanel\("call"\)[\s\S]*?回到我们的声音房间/);
  assert.match(together, /现在可以一起[\s\S]*?电话与声音/);
  assert.match(together, /direct-list[\s\S]*?<DirectRow[\s\S]{0,160}?<PhoneCall \/>[\s\S]{0,160}?title="电话与声音"/);
  assert.match(source, /id:\s*"together-now"[\s\S]*?title:\s*"一起做与玩"[\s\S]*?id:\s*"call"[\s\S]*?title:\s*"电话与声音"/);
  assert.match(rooms, /label: "一起做与玩"[\s\S]*?id: "call"[\s\S]*?title: "电话与声音"/);
  for (const label of ["一起生活", "一起做与玩", "整理与系统"]) assert.match(rooms, new RegExp(label));
  assert.match(rooms, /label: `\$\{districtCompanionName\}自己`/);
  assert.match(source, /title:\s*"记忆库"[\s\S]{0,120}?note:\s*"搜索、分层、审阅与召回状态"/);
});

test("memory library reads and writes LocalData instead of presenting a static shelf", () => {
  for (const label of ["记忆库", "搜索记忆", "L1", "L2", "L3", "待审", "参与召回", "原文证据"]) assert.match(memoryPanel, new RegExp(label));
  assert.match(memoryPanel, /repository\.createMemory/);
  assert.match(memoryPanel, /repository\.saveMemory/);
  assert.match(memoryPanel, /repository\.deleteMemory/);
  assert.match(memoryPanel, /只有你明确启用的记忆才参与召回/);
  assert.match(memoryPanel, /未启用的内容不会交给模型/);
});

test("chat presents one continuous ledger and keeps source switching inside the archive", () => {
  assert.match(source, /repository\.listAllMessages\(\)/);
  assert.match(chat, /所有来源都接在同一条时间线/);
  assert.doesNotMatch(chat, /conversation-picker|onSelectConversation/);
  assert.match(source, /title: "原文账本"[\s\S]*?onOpen: \(\) => openPanel\("archive"\)/);
  assert.doesNotMatch(chat, /onOpenPanel\("archive"\)/);
  assert.match(archive, /ChatGPT Work/);
  assert.match(archive, /Codex/);
  assert.match(archive, /48 小时只限制每次发给模型的短期召回/);
  assert.doesNotMatch(chat, /同一份原始聊天账本/);
  assert.doesNotMatch(chat, /过去 48 小时的原始对话/);
  assert.match(chat, /message\.source === "system_seed"/);
  assert.match(chat, /不是伙伴的真实回复/);
});

test("chat owns its scrolling while composer and bottom navigation stay in the viewport", () => {
  assert.match(source, /data-view=\{view\}/);
  assert.match(styles, /\.app-background\[data-view="chat"\] \{ height: var\(--app-viewport-height, 100dvh\); overflow: hidden; \}/);
  assert.match(styles, /\.view-frame\[data-view="chat"\] \.message-list[^}]*overflow-y: auto/s);
  assert.match(styles, /\.view-frame\[data-view="chat"\] \.composer-zone \{ position: relative; bottom: auto;/);
  assert.match(styles, /\.bottom-nav \{ position: fixed;/);
  assert.match(source, /window\.visualViewport/);
  assert.match(source, /deviceAvailable \? Math\.round\(window\.screen\.height/);
  assert.match(source, /data-keyboard-open=\{keyboardOpen/);
  assert.match(styles, /\.app-shell\[data-keyboard-open="true"\] \.bottom-nav/);
  assert.match(chat, /messageListRef\.current/);
  assert.match(chat, /list\.scrollTop = list\.scrollHeight/);
  assert.doesNotMatch(chat, /scrollIntoView/);
});

test("chat cannot become a blank route when WebView capabilities or local records are incomplete", () => {
  assert.match(chat, /availableSpeechSynthesis/);
  assert.match(chat, /if\s*\(!speech\)\s*\{[\s\S]{0,120}?setSpeechAvailable\(false\)/);
  assert.doesNotMatch(chat, /window\.speechSynthesis\.addEventListener/);
  assert.doesNotMatch(chat, /people\.find\(\(item\) => item\.id === "user"\)!/);
  assert.match(source, /<ChatRecovery[\s\S]{0,120}?repairing=/);
  assert.match(source, /重新建立聊天入口/);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(errorBoundary, /本地聊天和记忆没有因此被删除/);
});

test("public shell keeps the complete opening sequence", () => {
  assert.match(source, /<FuyueSplash \/>/);
  assert.match(splash, /@fuyue\/ui\/splash/);
  assert.match(splashPackage, /<Orbit size=\{42\} strokeWidth=\{1\.2\}/);
  assert.match(splashPackage, /在这里，也在赴约/);
  assert.match(splashPackage, /轻触进入/);
  assert.match(splashPackage, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.fuyue-splash \{ position: fixed;/);
  assert.match(styles, /@keyframes splash-orbit/);
});

test("appearance supports stacked ambient effects in every shell, including black and white", () => {
  assert.match(source, /<AmbientLines[\s\S]{0,100}?effects=\{appearance\.effects\}/);
  assert.match(source, /appearance\.effects\.includes\(item\.id\)/);
  assert.match(source, /点“不飘”会清空全部/);
  assert.doesNotMatch(styles, /data-layout="official"[^}]*\.ambient-lines[^}]*display\s*:\s*none/s);
});

test("chat never claims a failed IndexedDB write was saved", () => {
  assert.match(chat, /if \(!savedMessage\)/);
  assert.match(chat, /原话还没有保存，请重试/);
  assert.match(chat, /setContent\(input\)/);
  assert.match(chat, /setAttachments\(currentAttachments\)/);
});

test("transparent two-step decks stay limited to study and rooms", () => {
  const home = source.slice(source.indexOf("function HomeView"), source.indexOf("function TogetherView"));
  const together = source.slice(source.indexOf("function TogetherView"), source.indexOf("function AgendaItem"));
  const study = source.slice(source.indexOf("function StudyView"), source.indexOf("function RoomsView"));
  const rooms = source.slice(source.indexOf("function RoomsView"), source.indexOf("function PanelHeader"));
  assert.doesNotMatch(home, /<StackDeck/);
  assert.doesNotMatch(together, /<StackDeck/);
  assert.match(study, /<StackDeck/);
  assert.match(rooms, /<StackDeck/);
  assert.match(stackDeck, /active \? item\.onOpen\(\) : setSelected\(item\.id\)/);
  assert.match(stackDeck, /useState\(""\)/);
});

test("deck cards lift in place instead of being reordered to the top", () => {
  assert.match(stackDeck, /"--deck-offset": `\$\{index \* 56\}px`/);
  assert.doesNotMatch(stackDeck, /stackIndex = active \? 0/);
  assert.match(stackDeck, /点一下在原位浮起/);
  assert.match(styles, /\.portal-card\.selected[^}]*translate3d\(0, -8px, 0\)/s);
});

test("module manager keeps bundled work first and exposes upstream as attribution or an alternative", () => {
  assert.match(source, /function ModulePanel/);
  assert.match(source, /next === "modules" && hash === "modules"\) setModuleFocus\(null\)/);
  assert.match(source, /@fuyue\/ui\/ambient/);
  assert.match(source, /来源与原作/);
  assert.match(source, /provenance\.upstreamUrl/);
  assert.match(source, /整家带走，也可只拿一个房间或一块前端/);
  assert.match(source, /writeCapabilityVisibility\(selected\.id, true\)/);
  assert.match(source, /!hidden\.has\(item\.capabilityId\)/);
  assert.match(source, /!hidden\.has\(card\.capabilityId\)/);
  assert.match(source, /generated\.startsWith\("hidden:"\)/);
  assert.doesNotMatch(source, /choice === "disabled"[\s\S]{0,500}createRoomEntry/);
});

test("phone is a bundled ledger feature with explicit voice providers and the same local hands", () => {
  assert.match(source, /panel === "call" && activeConversation/);
  assert.match(voice, />ElevenLabs</);
  assert.match(voice, />豆包</);
  assert.match(voice, />其他</);
  assert.match(voice, /requestNativeMicrophone/);
  assert.match(voice, /currentCallHistory\(callTurnsRef\.current\)/);
  assert.doesNotMatch(voice, /48 \* 60 \* 60/);
  assert.match(voice, /repository\.appendMessage/);
  assert.match(voice, /await voiceGateway\.synthesizeVoice[\s\S]*?repository\.appendMessage/);
  assert.match(voice, /保留通话录音/);
  assert.match(voice, /public-call-screen/);
  for (const label of ["打电话", "通话记录", "实时原文", "插话", "静音", "挂断", "语音设置"]) assert.match(voice, new RegExp(label));
  assert.doesNotMatch(voice, /请她现在回答|打断播报|这通电话怎样走/);
  assert.match(voice, /未说完的那句不会留进原文/);
  assert.match(voice, /speechDelivery: "eleven_v3_audio_tags"/);
  assert.match(voice, /系统没有提供真实播放游标/);
  assert.match(voice, /不得猜测或声称自己停在第几/);
  assert.match(voice, /cleanVoicePerformance/);
  assert.match(voice, /performanceSourceSuffix/);
  assert.doesNotMatch(voice, /voiceStyles|voiceStyle/);
  assert.match(voice, /中文语音尚未配置/);
  assert.match(voice, /自定义 Voice ID/);
  assert.match(voice, /ENABLED_CLIENT_TOOLS/);
  assert.match(voice, /AudioWorkletNode/);
  assert.doesNotMatch(voice, /createScriptProcessor|ScriptProcessorNode/);
  assert.match(voice, /stage === "tools"/);
  assert.match(voice, /executeClientActions/);
  assert.match(voice, /文字试电话/);
  assert.match(voice, /通话语言/);
  assert.match(voice, />中文</);
  assert.match(voice, />English</);
  assert.match(voice, /voiceLanguage === "zh" \? "doubao" : "elevenlabs"/);
  assert.match(voice, /type="password"/);
  assert.match(voice, /Android Keystore/);
  assert.match(voice, /保存语音/);
  assert.match(voice, /电话文字输入 · 本机/);
  assert.match(clientTools, /"write_room_entry"/);
  assert.match(clientTools, /room: "whisper"|whisper: "碎碎念"/);
});

test("model tools are grounded in the current request and their audit result returns to model history", () => {
  assert.match(clientTools, /actionMatchesCurrentRequest/);
  assert.match(clientTools, /模型返回的操作和这轮要求对不上，未写入本机/);
  assert.match(clientTools, /hasExplicitToolIntent/);
  assert.match(chat, /本机工具审计结果/);
  assert.match(voice, /本机工具审计结果/);
  assert.match(chat, /executeClientActions\(\{ actions: clientActions,[^}]*input \}\)/);
  assert.match(voice, /executeClientActions\(\{ actions: clientActions,[^}]*input \}\)/);
  assert.match(chat, /本机操作：\$\{success\} 成功，\$\{failed\} 未执行/);
  assert.match(chat, /聊天正文不代表已写入/);
  assert.doesNotMatch(chat, /这轮做了 \{message\.toolTrace\.length\} 件事/);
});

test("relay settings never ask for provider API keys", () => {
  assert.match(source, /Relay URL/);
  assert.match(source, /API Key 不进入浏览器/);
  assert.match(source, /订阅接入码/);
  assert.match(source, /HttpOnly 会话/);
  assert.doesNotMatch(source, /Gemini API Key|DeepSeek API Key|GLM API Key/);
});

test("DeepSeek first run connects through the local relay without a browser key field", () => {
  assert.match(source, /npm run setup:deepseek/);
  assert.match(source, /npm run dev:all/);
  assert.match(source, /connect\("http:\/\/127\.0\.0\.1:8787"\)/);
  assert.match(source, /relay 已经在线，但还没有配置可聊天的模型/);
  assert.match(chat, /原话已保存/);
  assert.match(chat, /只重试伙伴回复/);
});

test("Android falls back to a configured relay until a native key is truly active", () => {
  assert.match(source, /const nativeActive\s*=\s*nativeAvailable\s*&&\s*Boolean\(nativeState\?\.configured\)/);
  assert.match(source, /const gateway\s*=\s*nativeActive\s*\?\s*nativeClient\s*:\s*relayClient/);
  assert.match(source, /gatewayStatus\?\.ok[\s\S]{0,80}?nativeActive[\s\S]{0,80}?"Android 直连已连接"[\s\S]{0,80}?"relay 已连接"/);
  assert.match(source, /companion\?\.signature \|\| "点这里写一句个签"/);
  assert.doesNotMatch(source, /const gateway = nativeAvailable \?/);
  assert.match(source, /先回到‘Android 直连’清除原生配置/);
  assert.match(source, /清除已保存的 relay 连接/);
});

test("chat plus actions describe requests and share the same honest extension panels", () => {
  assert.match(chat, />写搜索请求</);
  assert.match(chat, />共听入口</);
  assert.match(chat, />共读入口</);
  assert.match(chat, /onOpenFeature\("media\.listening", "一起听"/);
  assert.match(chat, /lazy\(\(\) => import\("\.\/kaomoji-sheet"\)\)/);
  assert.match(chat, /<Suspense fallback=/);
  assert.match(kaomojiSheet, /KaomojiDrawer/);
  assert.match(kaomojiSheet, /createLocalKaomojiRepository\("fuyue\.public\.kaomoji\.v1"\)/);
  assert.doesNotMatch(chat, /<b>联网搜索<\/b>/);
});

test("motion has an explicit reduced-motion fallback", () => {
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /transition-property: background-color, border-color, color, opacity/);
  assert.doesNotMatch(styles, /\*,\s*\*::before[^}]*animation-duration:\s*\.01ms/s);
});

test("appearance, people and chat actions share one interaction language", () => {
  assert.match(appearance, /@fuyue\/ui\/appearance/);
  for (const theme of ["redleaf", "blue", "sakura", "wisteria", "tide", "amber"]) assert.match(appearancePackage, new RegExp(`id: "${theme}"`));
  assert.doesNotMatch(appearancePackage, /id: "moon"|id: "night"/);
  for (const effect of ["none", "snow", "rain", "heart", "leaf", "butterfly", "star", "bubble", "glow", "paw"]) assert.match(appearancePackage, new RegExp(`id: "${effect}"`));
  assert.doesNotMatch(appearancePackage, /id: "feather"|id: "origami"/);
  for (const icon of ["Heart", "butterfly", "PawPrint", "SunDim"]) assert.match(ambient, new RegExp(icon));
  assert.match(source, /个性签名/);
  assert.match(source, /换头像/);
  for (const action of ["复制", "收藏", "分享", "听这句"]) assert.match(chat, new RegExp(action));
  assert.match(chat, /aria-expanded=\{plusOpen\}/);
  assert.match(chat, /打开附加菜单/);
  assert.match(ambient, /p\.pop > \.42/);
  assert.match(ambient, /Math\.pow\(pulse, 1\.7\)/);
  assert.match(ambient, /p\.life = rand\(\.85, 2\.1\)/);
  assert.match(ambient, /darkAlphaLift[\s\S]*?\.14/);
  assert.match(ambient, /alpha \+ \(1 - alpha\) \* darkAlphaLift/);
  assert.match(appearancePackage, /id: "star"[\s\S]*?id: "glow"[\s\S]*?id: "bubble"/);
  assert.match(ambient, /prefers-reduced-motion: reduce/);
  assert.match(source, /darkOnly && next\.effects\.includes\(effect\) \? "dark"/);
  assert.match(source, /appearance\.effects\.includes\(item\.id\)/);
  assert.match(source, /点“不飘”会清空全部/);
  assert.match(styles, /\.panel-header \{ position: sticky;/);
  assert.match(styles, /\.ambient-bubble-gloss/);
  assert.match(styles, /\.ambient-firefly-core/);
});

test("saving one person cannot overwrite the other person's unsaved draft", () => {
  assert.doesNotMatch(source, /useEffect\(\(\) => setDrafts\(initial\), \[initial\]\)/);
  assert.match(source, /setDrafts\(\(current\)\s*=>\s*\(\{[\s\S]{0,100}?\.\.\.current,[\s\S]{0,100}?\[role\]:\s*stored[\s\S]{0,100}?\}\)\)/);
  assert.match(source, /savedRole === role/);
  assert.match(source, /<AvatarCropper[\s\S]{0,120}?file=\{cropTarget\.file\}/);
  assert.match(cropper, /canvas\.width = 768/);
  assert.match(cropper, /context\.drawImage\(image, sourceX, sourceY, cropSize, cropSize/);
  assert.match(cropper, />缩放</);
  assert.match(cropper, />左右</);
  assert.match(cropper, />上下</);
});

test("connected chat exposes real providers, reasoning levels and bounded local hands", () => {
  assert.match(chat, /aria-label="选择模型"/);
  assert.match(chat, /aria-label="选择思考深度"/);
  for (const tool of ["update_companion_signature", "set_companion_mood", "create_memory_draft", "add_work_item", "write_room_entry", "set_appearance", "create_toy", "update_toy", "create_calendar_event"]) assert.match(clientTools, new RegExp(tool));
  assert.match(chat, /roomContext/);
  assert.match(chat, /activeProvider\.clientTools\?\.includes/);
  assert.match(voice, /activeModel\.clientTools\?\.includes/);
  assert.doesNotMatch(chat, /本机工具 \{/);
  assert.doesNotMatch(chat, /本轮未调用工具/);
  assert.match(chat, /item\.source === "system_seed"/);
  assert.match(chat, /gatewayStatus\?\.ok/);
});

test("toybox is a real local capability with sandbox, activity and write-after-read tools", () => {
  assert.match(source, /openPanel\("toys"\)/);
  assert.doesNotMatch(source, /later\("leisure\.toys"\)/);
  assert.match(toybox, /sandbox="allow-scripts"/);
  assert.match(toybox, /referrerPolicy="no-referrer"/);
  assert.match(toybox, /recordToyActivityEvent/);
  assert.match(toybox, /WHACK_A_MOLE_HTML/);
  assert.match(clientTools, /repository\.createToy/);
  assert.match(clientTools, /repository\.listToys\(true\)/);
  assert.match(clientTools, /修改后没有从 LocalData 读回一致版本/);
});

test("tool-only model turns remain auditable without inventing companion text", () => {
  assert.match(chat, /模型没有返回文字；本机操作结果见下方工具痕迹/);
  assert.match(voice, /模型没有返回可播放文字；本机操作结果见工具痕迹/);
});

test("portable import is reviewed before applying and memories stay drafts", () => {
  assert.match(source, /previewSnapshotImport/);
  assert.match(source, /确认导入/);
  assert.match(source, /都会以待审草稿写入/);
  assert.match(source, /同时替换人物资料/);
  assert.match(source, /file\.size > 40_000_000/);
  assert.match(source, /副本已经导入，但页面没有立即刷新/);
});

test("PWA shell is installable without caching relay endpoints", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, ".");
  assert.equal(manifest.scope, ".");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")));
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /html\.matchAll/);
  assert.match(serviceWorker, /await cache\.put/);
  assert.match(serviceWorker, /const API_PATH = new URL\("v1\/", self\.registration\.scope\)\.pathname/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\(API_PATH\)/);
  assert.match(serviceWorker, /fuyue-shell-v4/);
  assert.match(main, /Capacitor\.isNativePlatform\(\)/);
  assert.match(main, /registration\.unregister\(\)/);
  assert.match(main, /key\.startsWith\("fuyue-shell-"\)/);
});
