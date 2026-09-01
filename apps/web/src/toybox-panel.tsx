import { ArrowLeft, Archive, CheckCircle, FileHtml, GameController, Play, Plus, ShieldCheck, SpinnerGap, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LocalDataRepository, Toy, ToyActivityEvent } from "@fuyue/core";
import { buildSandboxedToyDocument, parseToyBridgeEvent, validateToyHtml, WHACK_A_MOLE_HTML, WHACK_A_MOLE_TITLE } from "@fuyue/toybox";

export function ToyboxPanel({ repository, toys, events, companionName, onBack, onChange }: {
  repository: LocalDataRepository;
  toys: Toy[];
  events: ToyActivityEvent[];
  companionName: string;
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const [active, setActive] = useState<Toy | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const seenEventsRef = useRef(new Set<string>());
  const [session, setSession] = useState<{ id: string; token: string } | null>(null);

  useEffect(() => {
    void repository.listToys(true).then(async (all) => {
      if (all.some((toy) => toy.createdBy === "system" && toy.title === WHACK_A_MOLE_TITLE)) return;
      await repository.createToy({ title: WHACK_A_MOLE_TITLE, html: WHACK_A_MOLE_HTML, createdBy: "system", sourceLabel: "赴约内置离线玩具" });
      await onChange();
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "内置玩具没有放进 LocalData"));
  }, [onChange, repository]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!session || !active || event.source !== iframeRef.current?.contentWindow || seenEventsRef.current.size >= 200) return;
      const parsed = parseToyBridgeEvent(event.data, session.token);
      if (!parsed || seenEventsRef.current.has(parsed.eventId)) return;
      seenEventsRef.current.add(parsed.eventId);
      void repository.recordToyActivityEvent({ toyId: active.id, sessionId: session.id, kind: parsed.type, summary: parsed.summary, details: parsed.details })
        .then(onChange).catch(() => undefined);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [active, onChange, repository, session]);

  const activeEvents = useMemo(() => active ? events.filter((event) => event.toyId === active.id).slice(0, 8) : [], [active, events]);
  const srcDoc = useMemo(() => active && session ? buildSandboxedToyDocument(active.html, session.token) : "", [active, session]);

  function openToy(toy: Toy) {
    seenEventsRef.current = new Set();
    setSession({ id: crypto.randomUUID(), token: crypto.randomUUID() });
    setActive(toy);
    setError("");
  }

  function closeToy() { setActive(null); setSession(null); seenEventsRef.current = new Set(); }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setError(""); setNotice("");
    try {
      if (file.size > 120_000) throw new Error("玩具超过 120 KB");
      const next = validateToyHtml(await file.text());
      setHtml(next); setFileName(file.name); setTitle(file.name.replace(/\.html?$/i, "").slice(0, 120));
    } catch (cause) { setHtml(""); setFileName(""); setError(cause instanceof Error ? cause.message : "这个 HTML 不能安全装入"); }
  }

  async function install(event: FormEvent) {
    event.preventDefault(); if (!title.trim() || !html || busy) return;
    setBusy("install"); setError(""); setNotice("");
    try {
      const safeHtml = validateToyHtml(html);
      await repository.createToy({ title: title.trim().slice(0, 120), html: safeHtml, createdBy: "user", sourceLabel: "本机 HTML 导入" });
      setTitle(""); setHtml(""); setFileName(""); setAdding(false); setNotice("玩具已写入 LocalData"); await onChange();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "玩具没有安全装入"); }
    finally { setBusy(""); }
  }

  async function archiveToy(toy: Toy) {
    if (toy.createdBy === "system") { setError("内置打地鼠不会被删除；可以在功能包里隐藏整个玩具盒。"); return; }
    setBusy(toy.id); setError("");
    try { await repository.saveToy({ ...toy, status: "archived" }); closeToy(); setNotice("已收起入盒，资料仍在可携带副本中"); await onChange(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "玩具没有收起"); }
    finally { setBusy(""); }
  }

  if (active && session) return <div className="panel-content toybox-panel toybox-playing">
    <header className="panel-header"><button data-panel-back className="icon-button quiet sticky-back" onClick={closeToy} aria-label="返回玩具盒"><ArrowLeft /></button><div><h1 id="panel-title">{active.title}</h1><p>{active.sourceLabel} · 无网络沙箱</p></div><button className="icon-button quiet" onClick={closeToy} aria-label="关闭玩具"><X /></button></header>
    <section className="toy-sandbox-frame"><iframe ref={iframeRef} title={active.title} srcDoc={srcDoc} sandbox="allow-scripts" referrerPolicy="no-referrer" /></section>
    <section className="toy-audit"><header><div><h2>这次真的留下了什么</h2><p>只记玩具主动发出的得分、节点或完成事件，不读聊天和记忆。</p></div><ShieldCheck /></header>{activeEvents.length ? activeEvents.map((item) => <article key={item.id}><span>{item.kind === "score" ? "得分" : item.kind === "complete" ? "完成" : item.kind === "chat" ? "玩具对话" : "节点"}</span><strong>{item.summary}</strong><time>{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(item.occurredAt))}</time></article>) : <p className="toy-no-events">这轮还没有事件。</p>}</section>
    {active.createdBy !== "system" && <button className="secondary-button full-button" disabled={busy === active.id} onClick={() => void archiveToy(active)}>{busy === active.id ? <SpinnerGap className="spin" /> : <Archive />}收起这个玩具（不删数据）</button>}
  </div>;

  return <div className="panel-content toybox-panel"><header className="panel-header"><button data-panel-back className="icon-button quiet sticky-back" onClick={onBack} aria-label="返回"><ArrowLeft /></button><div><h1 id="panel-title">玩具盒</h1><p>房间里的本机小网页，不是后端项目。</p></div></header>
    <section className="toybox-safety"><ShieldCheck /><div><h2>可以动手，但不能偷拿</h2><p>每个玩具在无同源权限、无网络、无表单提交的 iframe 里运行。它只能把有界的游玩事件送回自己的 LocalData 记录。</p></div></section>
    <button className="primary-button full-button" onClick={() => { setAdding((value) => !value); setError(""); }}><Plus />{adding ? "收起导入" : "装入单文件 HTML 玩具"}</button>
    {adding && <form className="editor-form toy-import" onSubmit={install}><label className="file-picker secondary-button full-button"><FileHtml /><span>{fileName || "选择 .html 文件（最大 120 KB）"}</span><input type="file" accept="text/html,.html,.htm" onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} /></label><label>玩具名字<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label><button className="primary-button" disabled={!title.trim() || !html || busy === "install"}>{busy === "install" ? <SpinnerGap className="spin" /> : <CheckCircle />}校验并写入 LocalData</button></form>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="save-message" role="status"><CheckCircle />{notice}</p>}
    <section className="toy-grid" aria-label="本地玩具">{toys.map((toy) => { const latest = events.find((event) => event.toyId === toy.id); return <button key={toy.id} onClick={() => openToy(toy)}><span className="toy-cover"><GameController /></span><span><strong>{toy.title}</strong><small>{toy.createdBy === "companion" ? `${companionName} 做的` : toy.createdBy === "system" ? "赴约内置" : "本机导入"}{latest ? ` · 最近：${latest.summary}` : " · 还没玩过"}</small></span><Play weight="fill" /></button>; })}</section>
  </div>;
}
