import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowRight, BookOpen, CalendarDays, Check, Clipboard, Heart, House, Layers3, Menu, MessageCircle, Mic, MicOff, Moon, Palette, Phone, PhoneOff, Radio, Sparkles, Sun, Volume2, WandSparkles } from "lucide-react";
import { AmbientLines, LineEffectGlyph, type LineEffect } from "@fuyue/ui/ambient";
import { lineEffectRegistry, shellRegistry, themeRegistry, type AppearanceMode, type ShellLayout, type ThemeName } from "@fuyue/ui/appearance";
import { MemoryLedger, MemoryMap, visualNodeCountForMemoryCount, type MemoryItem } from "@fuyue/ui/memory";
import { FuyueSplash } from "@fuyue/ui/splash";
import { StackDeck } from "@fuyue/ui/stack-deck";
import "@fuyue/ui/styles.css";
import "./styles.css";

type DemoId = "ambient" | "appearance" | "stack" | "memory" | "call" | "splash";
type DemoDefinition = { id: DemoId; label: string; eyebrow: string; module: string; symbol?: string; pack: string };
const demos: DemoDefinition[] = [
  { id: "ambient", label: "漂浮物", eyebrow: "Ambient", module: "@fuyue/ui/ambient", symbol: "AmbientLines", pack: "frontend/ambient" },
  { id: "appearance", label: "配色与壳", eyebrow: "Appearance", module: "@fuyue/ui/appearance", symbol: "themeRegistry", pack: "frontend/appearance" },
  { id: "stack", label: "叠叠乐", eyebrow: "Interaction", module: "@fuyue/ui/stack-deck", symbol: "StackDeck", pack: "frontend/stack-deck" },
  { id: "memory", label: "记忆可视化", eyebrow: "Memory", module: "@fuyue/ui/memory", symbol: "MemoryMap", pack: "frontend/memory-visual" },
  { id: "call", label: "打电话", eyebrow: "Voice", module: "apps/web/src/voice-call-panel.tsx", pack: "function/voice-call" },
  { id: "splash", label: "开屏", eyebrow: "Splash", module: "@fuyue/ui/splash", symbol: "FuyueSplash", pack: "frontend/splash" },
];

const sampleMemories: MemoryItem[] = [
  { id: "demo-working", title: "今天想继续的事", content: "把喜欢的外观积木挑出来，再决定接到哪里。", layer: "working", status: "active", injectionEnabled: true, sourceMessageIds: ["demo-message-1"], createdAt: "2026-01-01T09:00:00.000Z", updatedAt: "2026-01-01T09:00:00.000Z" },
  { id: "demo-semantic", title: "相处偏好", content: "切换页面要自然，失败时要能回到原来的路。", layer: "semantic", status: "active", injectionEnabled: true, sourceMessageIds: ["demo-message-1", "demo-message-2"], createdAt: "2026-01-01T08:00:00.000Z", updatedAt: "2026-01-01T08:00:00.000Z" },
  { id: "demo-core", title: "共同约定", content: "预览数据只是示意，不会进入采用者的记忆库。", layer: "core", status: "active", injectionEnabled: false, sourceMessageIds: ["demo-message-2"], createdAt: "2026-01-01T07:00:00.000Z", updatedAt: "2026-01-01T07:00:00.000Z" },
];

function makePreviewMemories(count: number): MemoryItem[] {
  if (count <= sampleMemories.length) return sampleMemories.slice(0, count);
  return Array.from({ length: count }, (_, index) => sampleMemories[index] || {
    id: `density-preview-${index + 1}`,
    title: `匿名压力记录 ${String(index + 1).padStart(4, "0")}`,
    content: "只用于观察字符密度，不会写入 LocalData。",
    layer: index % 11 === 0 ? "core" : index % 4 === 0 ? "semantic" : "working",
    status: "active",
    injectionEnabled: true,
    sourceMessageIds: [`density-source-${Math.floor(index / 4)}`],
    createdAt: new Date(Date.UTC(2026, 0, 1, 9, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 9, 0, index)).toISOString(),
  });
}

const showcaseThemeTokens: Record<ThemeName, { paperRaised: string; ink: string; inkSoft: string; line: string }> = {
  redleaf: { paperRaised: "#fffdfa", ink: "#2d2825", inkSoft: "#726a64", line: "rgba(80,62,51,.14)" },
  blue: { paperRaised: "#fcfdfe", ink: "#243447", inkSoft: "#61748a", line: "rgba(61,88,120,.16)" },
  sakura: { paperRaised: "#fffdfc", ink: "#3c3032", inkSoft: "#756569", line: "rgba(105,72,79,.14)" },
  wisteria: { paperRaised: "#fffdfd", ink: "#352f39", inkSoft: "#6f6875", line: "rgba(84,72,93,.14)" },
  tide: { paperRaised: "#fcfefd", ink: "#293936", inkSoft: "#5e716c", line: "rgba(59,91,83,.14)" },
  amber: { paperRaised: "#fffdf9", ink: "#3d3428", inkSoft: "#736653", line: "rgba(105,81,49,.14)" },
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      window.prompt("复制这行引入语句", value);
    }
  }
  return <button className="copy-button" type="button" onClick={copy}>{copied ? <Check /> : <Clipboard />}<span>{copied ? "已复制" : "复制引入"}</span></button>;
}

function DemoPanel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <section className="demo-card"><header><span><small>交互预览</small><h2>{title}</h2></span><p>{note}</p></header>{children}</section>;
}

function CallPreview() {
  const [view, setView] = useState<"dial" | "records">("dial");
  const [stage, setStage] = useState<"idle" | "listening" | "speaking">("idle");
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState<"doubao" | "elevenlabs" | "custom">("doubao");
  const voiceLabel = voice === "doubao" ? "豆包中文" : voice === "elevenlabs" ? "ElevenLabs" : "自定义语音契约";

  if (stage !== "idle") return <section className="call-preview-screen" aria-label="通话中界面预览">
    <header><span><i />界面演示 · 未启用麦克风</span><time>00:00</time></header>
    <main><div className="call-preview-avatar">伴</div><h3>伙伴</h3><small>{voiceLabel} · 需要采用者自己的 Key</small>
      <div className="call-preview-wave" aria-live="polite"><span><i /><i /><i /><i /><i /></span><b>{muted ? "麦克风已静音" : stage === "speaking" ? "伙伴正在说" : "正在听你说"}</b><p>{stage === "speaking" ? "点“插话”可以看打断后的界面反馈。" : "这里不会采集声音，也不会伪造转写。"}</p></div>
      <article className="call-preview-transcript"><header><span><Radio /><b>实时原文</b></span><em>预览为空</em></header><p>真实接通后，只有说完的句子才会留在这里。</p></article>
      <button className="call-preview-simulate" type="button" onClick={() => setStage((current) => current === "speaking" ? "listening" : "speaking")}><Volume2 />{stage === "speaking" ? "回到聆听态" : "预览对方说话态"}</button>
    </main>
    <footer><button className={muted ? "is-on" : ""} type="button" onClick={() => { if (stage === "speaking") setStage("listening"); else setMuted((current) => !current); }}>{stage === "speaking" ? <Mic /> : muted ? <MicOff /> : <Mic />}<span>{stage === "speaking" ? "插话" : muted ? "继续" : "静音"}</span></button><button type="button"><Radio /><span>原文</span></button><button className="hangup" type="button" onClick={() => { setStage("idle"); setMuted(false); }}><PhoneOff /><span>挂断</span></button></footer>
  </section>;

  return <section className="call-preview-idle" aria-label="打电话页面预览">
    <nav><button className={view === "dial" ? "active" : ""} type="button" onClick={() => setView("dial")}><Phone />打电话</button><button className={view === "records" ? "active" : ""} type="button" onClick={() => setView("records")}><Radio />通话记录</button></nav>
    {view === "records" ? <div className="call-preview-empty"><Radio /><b>还没有通话原文</b><p>预览页不写记录；完整部署会从同一份聊天账本整理。</p></div> : <div className="call-preview-dial"><div className="call-preview-avatar">伴</div><h3>打给伙伴</h3><p>中文可接豆包全双工；ElevenLabs 和自定义契约也可以带人物、记忆与本通原文回答。</p><div className="call-preview-providers" role="group" aria-label="预览语音供应商">{(["doubao", "elevenlabs", "custom"] as const).map((item) => <button className={voice === item ? "active" : ""} aria-pressed={voice === item} type="button" key={item} onClick={() => setVoice(item)}>{item === "doubao" ? "豆包" : item === "elevenlabs" ? "ElevenLabs" : "其他"}</button>)}</div><div className="call-preview-ready"><span><i /><b>{voiceLabel}</b></span><small>仅预览界面</small></div><button className="call-preview-start" type="button" onClick={() => setStage("listening")}><Phone />进入通话界面</button><small>不会申请麦克风，不会连供应商。</small></div>}
  </section>;
}

function HomePreview({ theme, mode, layout, effects }: { theme: ThemeName; mode: AppearanceMode; layout: ShellLayout; effects: LineEffect[] }) {
  return <section className="fake-home-preview" data-theme={theme} data-mode={mode} data-layout={layout} aria-label="无私人数据的假主页预览">
    <AmbientLines effects={effects} density={2} speed={2} theme={theme} />
    <header className="fake-home-topbar"><Menu /><span className="fake-home-identity"><i>伴</i><span><b>赴约</b><small><i />在这里，今天也接着走。</small></span></span><Palette /></header>
    <div className="fake-home-content">
      <article className="fake-home-return"><span><small>回到伙伴身边</small><strong>我在，今天也接着走。</strong><em>同一份记忆和聊天账本。</em></span><ArrowRight /></article>
      <section className="fake-home-block"><header><h3>继续上次</h3><small>预览数据</small></header><article className="fake-home-continue"><Phone /><span><small>电话与共听</small><strong>继续昨晚没有听完的这一段</strong><em>通话、转录与播放都在同一个房间</em></span><ArrowRight /></article></section>
      <section className="fake-home-block"><header><h3>放在手边</h3><small>最多四个</small></header><div className="fake-home-grid">
        <article><CalendarDays /><span><b>课表与安排</b><small>下一项与今天日程</small></span></article>
        <article><Phone /><span><b>电话与共听</b><small>打电话、转录与播放</small></span></article>
        <article><Sparkles /><span><b>小小空间</b><small>动态、回复与主动回来</small></span></article>
        <article><BookOpen /><span><b>共同工作本</b><small>待办、决定与执行</small></span></article>
      </div></section>
      <article className="fake-home-mood"><Heart /><span><small>伙伴此刻</small><strong>有点得意</strong><em>你认真挑颜色，我就在旁边偷看。</em></span></article>
    </div>
    <nav className="fake-home-tabs" aria-label="假主页底部导航"><span className="active"><House />首页</span><span><MessageCircle />聊天</span><span><Heart />一起</span><span><BookOpen />书房</span><span><Layers3 />房间</span></nav>
  </section>;
}

function App() {
  const [active, setActive] = useState<DemoId>(() => {
    const candidate = location.hash.slice(1);
    return demos.some((item) => item.id === candidate) ? candidate as DemoId : "ambient";
  });
  const [theme, setTheme] = useState<ThemeName>("redleaf");
  const [mode, setMode] = useState<AppearanceMode>("light");
  const [layout, setLayout] = useState<ShellLayout>("paper");
  const [effects, setEffects] = useState<LineEffect[]>(["leaf"]);
  const [splashRun, setSplashRun] = useState(0);
  const [memoryPreviewCount, setMemoryPreviewCount] = useState(3);
  const [notice, setNotice] = useState("");
  const currentTheme = themeRegistry.find((item) => item.id === theme) ?? themeRegistry[0]!;
  const currentThemeTokens = showcaseThemeTokens[currentTheme.id];
  const activeDemo = demos.find((item) => item.id === active) ?? demos[0]!;
  const shellStyle = useMemo(() => ({
    "--paper": mode === "dark" ? "#171715" : currentTheme.colors[0],
    "--paper-raised": mode === "dark" ? "#23221f" : currentThemeTokens.paperRaised,
    "--ink": mode === "dark" ? "#f5f1e8" : currentThemeTokens.ink,
    "--ink-soft": mode === "dark" ? "#b9b3aa" : currentThemeTokens.inkSoft,
    "--line": mode === "dark" ? "#4a4640" : currentThemeTokens.line,
    "--accent": currentTheme.colors[1],
    "--accent-soft": mode === "dark" ? `color-mix(in srgb, ${currentTheme.colors[1]} 24%, #181918)` : currentTheme.colors[2],
  } as CSSProperties), [currentTheme, currentThemeTokens, mode]);
  const previewMemories = useMemo(() => makePreviewMemories(memoryPreviewCount), [memoryPreviewCount]);

  function chooseDemo(id: DemoId) {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  }

  const homePreview = <HomePreview theme={theme} mode={mode} layout={layout} effects={effects} />;
  const preview = active === "ambient" ? <DemoPanel title="让环境效果先在主页里动起来" note="可以叠加多种，点“不飘”会清空全部；颜色跟随重点色，深浅模式独立。">{homePreview}<div className="demo-control-heading"><strong>搭一组漂浮物</strong><small>{effects.length ? `已选 ${effects.length} 种` : "现在不飘"}</small></div><div className="effect-grid">{lineEffectRegistry.map((item) => { const selected = item.id === "none" ? effects.length === 0 : effects.includes(item.id); return <button aria-pressed={selected} key={item.id} type="button" className={selected ? "selected" : ""} onClick={() => { if (item.id === "none") { setEffects([]); return; } setEffects((current) => current.includes(item.id) ? current.filter((effect) => effect !== item.id) : [...current, item.id]); if (item.darkOnly) setMode("dark"); }}><LineEffectGlyph effect={item.id} /><span>{item.name}</span>{selected && <Check className="effect-check" />}</button>; })}</div></DemoPanel>
    : active === "appearance" ? <DemoPanel title="配色与壳要放回主页里看" note="下面的假主页不含私人信息；重点色、白天黑夜和壳排布会分别作用在同一套真实结构上。">{homePreview}<div className="demo-control-heading"><strong>换一套纸面</strong><small>整套文字、边线与面板一起变化</small></div><div className="theme-grid">{themeRegistry.map((item) => <button key={item.id} type="button" className={theme === item.id ? "selected" : ""} onClick={() => setTheme(item.id)}><i>{item.colors.map((color) => <b key={color} style={{ background: color }} />)}</i><strong>{item.name}</strong><small>{item.note}</small></button>)}</div><div className="toggle-row"><button type="button" onClick={() => setMode(mode === "dark" ? "light" : "dark")}>{mode === "dark" ? <Sun /> : <Moon />}{mode === "dark" ? "切回白天" : "切到黑夜"}</button>{shellRegistry.map((item) => <button key={item.id} type="button" className={layout === item.id ? "selected" : ""} onClick={() => setLayout(item.id)}>{item.name}</button>)}</div></DemoPanel>
    : active === "stack" ? <DemoPanel title="先在原地浮起，再点一次进入" note="不会突然抽到页面最上方；适合书房、房间和需要保留位置感的入口。"><StackDeck title="认真收好" items={[{ id: "books", icon: <BookOpen />, title: "共读书架", note: "章节、批注与双人进度", onOpen: () => setNotice("这里由宿主接入真实页面") }, { id: "memory", icon: <Sparkles />, title: "记忆书架", note: "证据、审阅与召回状态", onOpen: () => setNotice("这里由宿主接入真实页面") }, { id: "rooms", icon: <Layers3 />, title: "房间索引", note: "按用途收好每个入口", onOpen: () => setNotice("这里由宿主接入真实页面") }, { id: "together", icon: <Heart />, title: "一起做的事", note: "日历、共听与共同记录", onOpen: () => setNotice("这里由宿主接入真实页面") }]} />{notice ? <p className="inline-notice" role="status">{notice}</p> : null}</DemoPanel>
    : active === "memory" ? <DemoPanel title="同一份数据，两种读法" note="账本固定展示 3 条示例；星图可以压测更多匿名记录，刷新即恢复，不写入 LocalData。"><MemoryLedger memories={sampleMemories} onToggle={() => setNotice("预览页不保存更改")} /><div className="memory-scale-controls"><span><strong>星图空间压测</strong><small>当前 {memoryPreviewCount} 条匿名记录 · {visualNodeCountForMemoryCount(memoryPreviewCount)} 个总字符；默认看局部，缩小看全貌</small></span><div>{[3, 144, 500, 1000].map((count) => <button className={memoryPreviewCount === count ? "active" : ""} type="button" key={count} onClick={() => setMemoryPreviewCount(count)}>{count}</button>)}</div></div><MemoryMap memories={previewMemories} onSelect={(item) => setNotice(`点选了：${item.title}`)} />{notice ? <p className="inline-notice" role="status">{notice}</p> : null}</DemoPanel>
    : active === "call" ? <DemoPanel title="先把电话页每个去处点一遍" note="这里只演示与完整版同构的拨号、通话、插话、挂断和空记录；不申请麦克风，不伪造接通。"><CallPreview /></DemoPanel>
    : <DemoPanel title="开屏也可以单独拿走" note="可跳过、可换 session key；拒绝 storage 或开启减少动态效果时仍然能进入。"><button type="button" className="replay-button" onClick={() => setSplashRun((value) => value + 1)}><WandSparkles />重播开屏</button>{splashRun > 0 ? <FuyueSplash key={splashRun} storageKey={`fuyue-showcase-splash-${splashRun}`} duration={2600} /> : null}</DemoPanel>;

  return <div className="showcase" style={shellStyle} data-theme={theme} data-mode={mode} data-layout={layout}>
    <header className="site-header"><a href="#top" className="brand" aria-label="回到顶部"><Palette /><span><strong>赴约前端积木</strong><small>无私人数据·可直接点·功能预览不冒充接通</small></span></a><div className="mode-indicator">{mode === "dark" ? <Moon /> : <Sun />}{currentTheme.name}</div></header>
    <main id="top"><section className="hero"><p>先看、先点，再带走</p><h1>不用把整台小手机<br />都搬回家。</h1><span>外观积木可独立引入；电话这种跨端功能会明确标成应用切片，预览不冒充真实接通。</span></section>
      <nav className="demo-nav" aria-label="预览分类">{demos.map((demo) => <button key={demo.id} type="button" className={active === demo.id ? "active" : ""} onClick={() => chooseDemo(demo.id)}><small>{demo.eyebrow}</small><strong>{demo.label}</strong></button>)}</nav>
      <section className="preview-layout"><div className="preview-shell app-shell" data-theme={theme} data-mode={mode} data-layout={layout}><div className="preview-topline"><span>预览纸面</span><em>{mode === "dark" ? "黑夜" : "白天"} · {layout}</em></div>{preview}</div>
        <aside className="take-card"><small>{activeDemo.symbol ? "这一块的引入路径" : "这是跨端应用切片"}</small><code>{activeDemo.module}</code>{activeDemo.symbol ? <CopyButton value={`import { ${activeDemo.symbol} } from \"${activeDemo.module}\";`} /> : <p>电话同时依赖页面、聊天模型、语音桥和移动端容器，不伪装成一行 import 就能真接通。</p>}<hr /><p>要带走它，用仓库根目录的取件命令：</p><code className="command">npm run pack:take -- {activeDemo.pack} /absolute/path</code><span>命令会自动带上必要依赖和授权说明。</span><a className="source-link" href="https://github.com/TangfanOVO/fuyue/tree/main/packages/ui" target="_blank" rel="noreferrer">看源码·拿走这些积木<ArrowRight /></a></aside>
      </section>
    </main>
    <footer className="site-footer"><span>预览页不连模型、不读本机记忆、不申请麦克风、不收集数据。</span><code>前端积木 MIT · 完整赴约 AGPL-3.0-only</code></footer>
  </div>;
}

const rootContainer = document.getElementById("root")!;
const showcaseWindow = globalThis as typeof globalThis & { __fuyueShowcaseRoot?: Root };
const showcaseRoot = showcaseWindow.__fuyueShowcaseRoot ?? createRoot(rootContainer);
showcaseWindow.__fuyueShowcaseRoot = showcaseRoot;
showcaseRoot.render(<App />);
