import {
  ArrowClockwise, BookOpen, Brain, Camera, Copy, FileText, FolderOpen, Headphones, Heart, Image as ImageIcon,
  Link, MagnifyingGlass, PaperPlaneTilt, PhoneCall, Plus, ShareNetwork, Sparkle, SpinnerGap, Star, UserCircle,
  SpeakerHigh, WarningCircle, X,
} from "@phosphor-icons/react";
import { lazy, Suspense, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GatewayError,
  type CapabilityId,
  type ClientToolAction,
  type CompanionGateway,
  type Conversation,
  type GatewayStatus,
  type LifeOverviewItem,
  type LocalDataRepository,
  type MemoryItem,
  type Message,
  type MessageAttachment,
  type MessageRole,
  type PersonProfile,
  type ReasoningEffort,
  type RoomEntry,
} from "@fuyue/core";
import { ENABLED_CLIENT_TOOLS, executeClientActions } from "./client-tools";
import { readLocalTextFiles } from "./local-file-import";
import { ProfileAvatar } from "./profile-avatar";

const KaomojiSheet = lazy(() => import("./kaomoji-sheet"));
const effortLabels: Record<ReasoningEffort, string> = { auto: "跟随模型", none: "直接回答", low: "轻想", medium: "适中", high: "深入", xhigh: "更深入", max: "最深" };

type ChatPanel = "people" | "connection" | "archive" | "call" | "cobrowse";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间待确认" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function toolTraceSummary(trace: Message["toolTrace"]) {
  const success = trace.filter((item) => item.status === "success").length;
  const failed = trace.length - success;
  if (!failed) return `这轮完成 ${success} 项本机操作`;
  return `本机操作：${success} 成功，${failed} 未执行`;
}

export async function imageAttachment(file: File): Promise<MessageAttachment> {
  if (!file.type.startsWith("image/")) throw new Error("这个文件不是图片");
  if (file.size > 12_000_000) throw new Error("图片超过 12MB，请先裁小一点");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
    const byteSize = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    if (byteSize > 7_500_000) throw new Error("图片整理后仍太大，请换一张小图");
    return { id: crypto.randomUUID(), name: file.name || "图片.jpg", mediaType: "image/jpeg", byteSize, dataUrl };
  } finally {
    URL.revokeObjectURL(source);
  }
}

function availableSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return null;
  const speech = window.speechSynthesis;
  return speech && typeof speech.cancel === "function" && typeof speech.getVoices === "function" && typeof speech.speak === "function" ? speech : null;
}

function speak(text: string, voiceURI: string) {
  const speech = availableSpeechSynthesis();
  if (!speech) return false;
  try {
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 2_000));
    utterance.lang = "zh-CN";
    const voice = speech.getVoices().find((item) => item.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    speech.speak(utterance);
    return true;
  } catch { return false; }
}

function fallbackProfile(id: "user" | "companion", displayName: string): PersonProfile {
  return { id, displayName, signature: "", avatarDataUrl: null, bio: "", voiceNotes: "", updatedAt: "1970-01-01T00:00:00.000Z" };
}

export function ChatView({ repository, conversation, messages, people, memories, roomEntries, calendarItems, companionName, gateway, gatewayStatus, onMessageSaved, onRefresh, onOpenPanel, onOpenFeature }: {
  repository: LocalDataRepository;
  conversation: Conversation;
  messages: Message[];
  people: PersonProfile[];
  memories: MemoryItem[];
  roomEntries: RoomEntry[];
  calendarItems: LifeOverviewItem[];
  companionName: string;
  gateway: CompanionGateway | null;
  gatewayStatus: GatewayStatus | null;
  onMessageSaved: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenPanel: (panel: ChatPanel) => void;
  onOpenFeature: (capabilityId: CapabilityId, title: string, note: string, requirement: string) => void;
}) {
  const [content, setContent] = useState("");
  const [manualRole, setManualRole] = useState<MessageRole>("user");
  const [streaming, setStreaming] = useState("");
  const [sending, setSending] = useState(false);
  const [replyPhase, setReplyPhase] = useState<"thinking" | "tools" | "">("");
  const [refreshing, setRefreshing] = useState(false);
  const [sendError, setSendError] = useState("");
  const [retryTurn, setRetryTurn] = useState<{ input: string; messageId: string } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [kaomojiOpen, setKaomojiOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [voiceURI, setVoiceURI] = useState(() => window.localStorage.getItem("fuyue-public-voice") || "");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [providerId, setProviderId] = useState(() => window.localStorage.getItem("fuyue-public-provider") || "");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => (window.localStorage.getItem("fuyue-public-reasoning") as ReasoningEffort | null) || "auto");
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLElement | null>(null);
  const user = useMemo(() => people.find((item) => item.id === "user") || fallbackProfile("user", "我"), [people]);
  const companion = useMemo(() => people.find((item) => item.id === "companion") || fallbackProfile("companion", companionName || "伙伴"), [companionName, people]);
  const visibleMessages = useMemo(() => messages.filter((item) => item.archiveState === "active" && !(gatewayStatus?.ok && item.source === "system_seed")), [gatewayStatus?.ok, messages]);
  const activeProvider = gatewayStatus?.providers.find((item) => item.id === providerId) || gatewayStatus?.providers.find((item) => item.id === gatewayStatus.activeProviderId) || gatewayStatus?.providers[0];
  const reasoningOptions = activeProvider?.reasoningEfforts?.length ? activeProvider.reasoningEfforts : ["auto" as const];
  const openPlus = useCallback(() => { if (plusOpen) return; window.history.pushState({ ...window.history.state, fuyueOverlay: "chat-plus" }, "", "#chat-tools"); setPlusOpen(true); }, [plusOpen]);
  const closePlus = useCallback(() => { if (window.history.state?.fuyueOverlay === "chat-plus" || window.location.hash === "#chat-tools") window.history.back(); else setPlusOpen(false); }, []);
  const consumePlus = useCallback(() => { if (window.history.state?.fuyueOverlay === "chat-plus" || window.location.hash === "#chat-tools") window.history.replaceState({ ...window.history.state, fuyueOverlay: undefined, fuyuePanelDepth: 0 }, "", window.location.pathname + window.location.search); setPlusOpen(false); }, []);

  useEffect(() => () => { abortRef.current?.abort(); availableSpeechSynthesis()?.cancel(); }, []);
  useEffect(() => {
    if (!gatewayStatus?.providers.length) return;
    if (!gatewayStatus.providers.some((item) => item.id === providerId)) setProviderId(gatewayStatus.activeProviderId || gatewayStatus.providers[0]!.id);
  }, [gatewayStatus, providerId]);
  useEffect(() => { if (providerId) window.localStorage.setItem("fuyue-public-provider", providerId); }, [providerId]);
  useEffect(() => {
    if (!reasoningOptions.includes(reasoningEffort)) setReasoningEffort(reasoningOptions[0] || "auto");
    else window.localStorage.setItem("fuyue-public-reasoning", reasoningEffort);
  }, [reasoningEffort, reasoningOptions]);
  useEffect(() => { const onPopState = (event: PopStateEvent) => setPlusOpen(event.state?.fuyueOverlay === "chat-plus" || window.location.hash === "#chat-tools"); window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => {
    if (!plusOpen && !kaomojiOpen && !voiceOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closePlus(); setKaomojiOpen(false); setVoiceOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [closePlus, kaomojiOpen, plusOpen, voiceOpen]);
  useEffect(() => {
    const speech = availableSpeechSynthesis();
    if (!speech) { setSpeechAvailable(false); setVoices([]); return; }
    setSpeechAvailable(true);
    const refresh = () => {
      try { setVoices(speech.getVoices()); }
      catch { setVoices([]); }
    };
    refresh();
    if (typeof speech.addEventListener !== "function") return;
    speech.addEventListener("voiceschanged", refresh);
    return () => speech.removeEventListener("voiceschanged", refresh);
  }, []);
  const scrollMessagesToEnd = useCallback(() => {
    const placeAtEnd = () => {
      const list = messageListRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    };
    window.requestAnimationFrame(() => { placeAtEnd(); window.requestAnimationFrame(placeAtEnd); });
  }, []);
  useEffect(() => { scrollMessagesToEnd(); }, [conversation.id, scrollMessagesToEnd, streaming, visibleMessages.length]);

  async function requestReply(input: string, userMessageId: string) {
    if (!gateway) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let collected = ""; let doneContent = "";
    let modelLabel = activeProvider?.label || "";
    let sourceLabel = "自托管 relay"; let toolTrace: Message["toolTrace"] = [];
    const recentCutoff = Date.now() - 48 * 60 * 60 * 1_000;
    const history = messages.filter((message) => message.archiveState === "active" && Date.parse(message.createdAt) >= recentCutoff).slice(-100)
      .map(({ role, content: historyContent, createdAt, source, sourceLabel: historySourceLabel, modelLabel: historyModelLabel, toolTrace: historyToolTrace }) => ({
        role,
        content: historyToolTrace.length ? `${historyContent}\n[本机工具审计结果]\n${historyToolTrace.map((item) => `- ${item.status === "success" ? "成功" : "失败"}：${item.summary}`).join("\n")}` : historyContent,
        createdAt,
        source,
        sourceLabel: historySourceLabel,
        modelLabel: historyModelLabel,
      }));
    const roomContext = roomEntries.filter((entry) => entry.status !== "archived").sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).slice(-80)
      .map(({ room, author, title, content: entryContent, subtype, status, occurredAt }) => ({ room, author, title, content: entryContent, subtype, status, occurredAt }));
    let clientActions: ClientToolAction[] = [];
    setReplyPhase("thinking");
    for await (const item of gateway.streamChat({ conversationId: conversation.id, clientMessageId: userMessageId, input, locale: navigator.language || "zh-CN", history, people, memories: memories.filter((memory) => memory.injectionEnabled).slice(0, 200), roomContext, calendarContext: calendarItems.slice(0, 100), ...(activeProvider?.id ? { providerId: activeProvider.id } : {}), reasoningEffort, enabledTools: activeProvider?.capabilities.includes("tools") ? ENABLED_CLIENT_TOOLS.filter((name) => activeProvider.clientTools?.includes(name)) : [] }, controller.signal)) {
      if (item.type === "delta") { collected += item.delta; setReplyPhase(""); setStreaming(collected); }
      if (item.type === "error") throw new GatewayError(item.message);
      if (item.type === "done") { doneContent = item.content || ""; modelLabel = item.modelLabel || modelLabel; sourceLabel = item.sourceLabel || sourceLabel; toolTrace = item.toolTrace || []; clientActions = item.clientActions || []; if (clientActions.length) setReplyPhase("tools"); }
    }
    if (clientActions.length) toolTrace = [...toolTrace, ...await executeClientActions({ actions: clientActions, repository, companion, sourceLabel: activeProvider?.label || "模型工具", input })];
    let reply = (doneContent || collected).trim();
    if (!reply && toolTrace.length) { reply = "模型没有返回文字；本机操作结果见下方工具痕迹。"; sourceLabel = `${sourceLabel} · 本机审计提示`; }
    if (!reply) throw new GatewayError("relay 没有返回可保存的回复");
    await repository.appendMessage({ conversationId: conversation.id, role: "companion", content: reply, source: "relay", sourceLabel, modelLabel, toolTrace, parentMessageId: userMessageId });
    setStreaming(""); setRetryTurn(null); setReplyPhase(""); await onMessageSaved();
    if (clientActions.some((action) => action.name === "create_calendar_event")) await onRefresh();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = content.trim();
    if ((!input && !attachments.length) || sending) return;
    setSending(true); setSendError(""); setStreaming(""); setNotice("");
    const currentAttachments = attachments;
    let savedMessage: Message | null = null;
    try {
      const message = await repository.appendMessage({ conversationId: conversation.id, role: gateway ? "user" : manualRole, content: input, attachments: currentAttachments });
      savedMessage = message;
      setContent(""); setAttachments([]); await onMessageSaved();
      if (!gateway || manualRole === "companion") return;
      if (!input) { setNotice("图片已存入 LocalData；当前公开 relay 未声明识图能力，没有把原图外送。"); return; }
      await requestReply(input, message.id);
    } catch (cause) {
      setStreaming("");
      const reason = cause instanceof Error ? cause.message : "这次没有完成";
      if (!savedMessage) {
        setContent(input);
        setAttachments(currentAttachments);
        setRetryTurn(null);
        setSendError(`${reason}；原话还没有保存，请重试。`);
      } else {
        const savedMessageId = savedMessage.id;
        const text = cause instanceof DOMException && cause.name === "AbortError"
          ? "已停止这次回复；你的原话已保存在本地。"
          : `${reason}；原话已保存。`;
        setRetryTurn((current) => current || (input ? { input, messageId: savedMessageId } : null));
        setSendError(text);
      }
    } finally { abortRef.current = null; setReplyPhase(""); setSending(false); }
  }

  async function retryReply() {
    if (!gateway || !retryTurn || sending) return;
    setSending(true); setSendError(""); setStreaming("");
    try { await requestReply(retryTurn.input, retryTurn.messageId); }
    catch (cause) { setStreaming(""); setSendError(cause instanceof Error ? cause.message : "这次仍没有接住"); }
    finally { abortRef.current = null; setReplyPhase(""); setSending(false); }
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setAttachmentBusy(true); setNotice("");
    try { const prepared = await imageAttachment(file); setAttachments((current) => [...current, prepared].slice(-4)); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "这张图片没有整理好"); }
    finally { setAttachmentBusy(false); }
  }

  async function readFilesIntoComposer(files: File[]) {
    if (!files.length || attachmentBusy) return;
    setAttachmentBusy(true); setNotice("正在读取本机文件…");
    try {
      const batch = await readLocalTextFiles(files);
      let next = content; let imported = 0; let skipped = batch.skipped;
      for (const item of batch.items) {
        const block = `【本机文件：${item.title}】\n${item.content}`;
        const joined = `${next}${next ? "\n\n" : ""}${block}`;
        if (joined.length > 20_000) { skipped += 1; continue; }
        next = joined; imported += 1;
      }
      if (imported) { setContent(next); consumePlus(); window.requestAnimationFrame(() => composerRef.current?.focus()); }
      setNotice(imported
        ? `已把 ${imported} 个文件读进输入框，发送前可以继续检查${skipped ? `；${skipped} 个文件已跳过` : ""}`
        : `没有可放进输入框的内容${skipped ? `；${skipped} 个文件为空、过大或格式不支持` : ""}`);
    } catch { setNotice("这些本机文件刚才没有读完，请重新选择。"); }
    finally { setAttachmentBusy(false); }
  }

  async function toggleStar(message: Message) {
    const next = !message.isStarred;
    const paired = message.parentMessageId ? messages.find((item) => item.id === message.parentMessageId) : null;
    await repository.saveMessage({ ...message, isStarred: next });
    if (paired) await repository.saveMessage({ ...paired, isStarred: next });
    await onMessageSaved(); setNotice(next ? "已收藏这一轮" : "已取消收藏");
  }

  async function copyMessage(message: Message) {
    if (!message.content.trim()) { setNotice("这是一条图片记录，没有可复制的文字。"); return; }
    try { await navigator.clipboard.writeText(message.content); setNotice("已复制这句话"); }
    catch { setNotice("浏览器没有允许复制，可以长按气泡选取文字。"); }
  }

  async function shareMessage(message: Message) {
    const text = message.content;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setNotice("已复制，可以粘贴分享"); }
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setNotice("分享面板没有接住，可以长按气泡复制"); }
  }

  function insert(value: string) { setContent((current) => `${current}${current ? " " : ""}${value}`); setKaomojiOpen(false); window.requestAnimationFrame(() => composerRef.current?.focus()); }
  function playMessage(text: string) { if (!speak(text, voiceURI)) setNotice("这台设备没有提供网页系统朗读；聊天与收藏仍可正常使用。"); }

  return <div className="chat-view page-enter">
    <div className={`chat-control-strip ${gatewayStatus?.ok ? "" : "is-local"}`} aria-label="模型与思考设置">{gatewayStatus?.ok ? <><label><Sparkle /><select aria-label="选择模型" value={activeProvider?.id || ""} onChange={(event) => setProviderId(event.target.value)}>{gatewayStatus.providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.label}</option>)}</select></label><label><Brain /><select aria-label="选择思考深度" value={reasoningOptions.includes(reasoningEffort) ? reasoningEffort : reasoningOptions[0]} disabled={reasoningOptions.length < 2} onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}>{reasoningOptions.map((effort) => <option value={effort} key={effort}>思考 · {effortLabels[effort]}</option>)}</select></label><button type="button" className="chat-refresh" disabled={refreshing} onClick={() => { setRefreshing(true); void onRefresh().catch((cause) => setNotice(cause instanceof Error ? cause.message : "这次没有同步好")).finally(() => setRefreshing(false)); }} aria-label="同步聊天与连接状态"><ArrowClockwise className={refreshing ? "spin" : ""} /></button></> : <><button type="button" className="connect-model" onClick={() => onOpenPanel("connection")}><Brain />连接模型</button><button type="button" className="chat-refresh" disabled={refreshing} onClick={() => { setRefreshing(true); void onRefresh().finally(() => setRefreshing(false)); }} aria-label="刷新本地聊天"><ArrowClockwise className={refreshing ? "spin" : ""} /></button></>}</div>
    <section ref={messageListRef} className="message-list" aria-live="polite" onClick={closePlus} onLoadCapture={scrollMessagesToEnd}>
      {visibleMessages.map((message) => message.source === "system_seed" ? <article className="local-seed" key={message.id}><Sparkle /><span><b>本地使用说明</b><p>{message.content}</p><small>这是安装时写入的本地示例，不是伙伴的真实回复。</small></span></article> : <article className={`message-row ${message.role}`} key={message.id}>
        {message.role === "companion" && <ProfileAvatar profile={companion} className="mini-avatar" />}
        <div className="message-stack">
          {!!message.attachments.length && <div className="message-media">{message.attachments.map((attachment) => attachment.mediaType.startsWith("image/") ? <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} /> : attachment.mediaType.startsWith("audio/") ? <audio key={attachment.id} controls preload="metadata" src={attachment.dataUrl} aria-label={attachment.name} /> : <a key={attachment.id} href={attachment.dataUrl} download={attachment.name}>{attachment.name}</a>)}</div>}
          {message.content && <div className="message-bubble">{message.content}</div>}
          <div className="message-meta"><div className="message-actions">
            <button onClick={() => void copyMessage(message)} aria-label="复制这句话"><Copy /><span>复制</span></button>
            {message.role === "companion" && <button className={message.isStarred ? "on" : ""} onClick={() => void toggleStar(message)} aria-label={message.isStarred ? "取消收藏" : "收藏这轮"}><Star weight={message.isStarred ? "fill" : "regular"} /><span>{message.isStarred ? "已收藏" : "收藏"}</span></button>}
            <button onClick={() => void shareMessage(message)} aria-label="分享这句话"><ShareNetwork /><span>分享</span></button>
            {message.role === "companion" && <button onClick={() => playMessage(message.content)} aria-label="播放这句话"><SpeakerHigh /><span>听这句</span></button>}
          </div><time>{formatTime(message.createdAt)}</time></div>
          {message.role === "companion" && message.toolTrace.length > 0 && <details className="tool-trace"><summary>{toolTraceSummary(message.toolTrace)}</summary><small>以下本机工具痕迹才是执行证据；聊天正文不代表已写入。</small>{message.toolTrace.map((item, index) => <p key={`${item.name}-${index}`}><b>{item.name}</b>·{item.summary}</p>)}</details>}
        </div>
        {message.role === "user" && <ProfileAvatar profile={user} className="mini-avatar user-mini-avatar" />}
      </article>)}
      {sending && !streaming && <article className="message-row companion pending-reply"><ProfileAvatar profile={companion} className="mini-avatar" /><div className="message-stack"><div className="message-bubble thinking-bubble"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span>{replyPhase === "tools" ? "正在调用本机工具" : reasoningEffort === "none" ? "正在接住这句" : "正在想"}</span></div></div></article>}
      {streaming && <article className="message-row companion"><ProfileAvatar profile={companion} className="mini-avatar" /><div className="message-stack"><div className="message-bubble">{streaming}<span className="cursor" /></div></div></article>}
      {!visibleMessages.length && <div className="chat-empty"><Heart /><b>原始聊天账本已就绪</b><span>不用先建窗口。从第一句开始，所有来源都接在同一条时间线里。</span></div>}
      {companion.signature && <button className="companion-signature" onClick={() => onOpenPanel("people")}><Sparkle />{companion.signature}</button>}
    </section>
    {(notice || sendError) && <div className={sendError ? "inline-error" : "chat-notice"} role="status">{sendError && <WarningCircle />}<span>{sendError || notice}</span>{sendError && retryTurn && gateway && <button onClick={() => void retryReply()}>只重试伙伴回复</button>}<button onClick={() => { setNotice(""); setSendError(""); }} aria-label="关闭提示"><X /></button></div>}
    <footer className="composer-zone">
      {!!attachments.length && <div className="attachment-chips">{attachments.map((item) => <span key={item.id}><img src={item.dataUrl} alt="" /><b>{item.name}</b><button onClick={() => setAttachments((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`移除 ${item.name}`}><X /></button></span>)}</div>}
      {plusOpen && <div className="plus-menu" id="chat-plus-menu" aria-label="聊天附加功能">
        <button onClick={() => imageInputRef.current?.click()}><span><ImageIcon /></span><b>多选图片</b></button>
        <button onClick={() => cameraInputRef.current?.click()}><span><Camera /></span><b>相机</b></button>
        <button onClick={() => fileInputRef.current?.click()}><span><FileText /></span><b>多选文件</b></button>
        <button onClick={() => folderInputRef.current?.click()}><span><FolderOpen /></span><b>文件夹</b></button>
        <button onClick={() => { consumePlus(); setContent((current) => `${current}${current ? "\n\n" : ""}请联网搜索（需要 relay 声明搜索能力）：`); }}><span><MagnifyingGlass /></span><b>写搜索请求</b></button>
        <button onClick={() => { consumePlus(); setKaomojiOpen(true); }}><span className="kaomoji-icon">(´･ω･`)</span><b>颜文字</b></button>
        <button onClick={() => { consumePlus(); setVoiceOpen(true); }}><span><SpeakerHigh /></span><b>声音</b></button>
        <button onClick={() => { consumePlus(); onOpenPanel("call"); }}><span><PhoneCall /></span><b>打电话</b></button>
        <button onClick={() => { consumePlus(); onOpenPanel("cobrowse"); }}><span><Link /></span><b>一起看链接</b></button>
        <button onClick={() => { consumePlus(); onOpenFeature("media.listening", "一起听", "赴约保留自己的共听前端。", "我们自己的使用需求很轻；完整同步房间推荐采用 music-together。"); }}><span><Headphones /></span><b>共听入口</b></button>
        <button onClick={() => { consumePlus(); onOpenFeature("reading.together", "共读书房", "赴约保留自己的共读前端。", "我们自己的使用需求很轻；完整阅读体验推荐采用 Readest。"); }}><span><BookOpen /></span><b>共读入口</b></button>
        <button onClick={() => { consumePlus(); onOpenPanel("people"); }}><span><UserCircle /></span><b>人物</b></button>
      </div>}
      {kaomojiOpen && <div className="composer-sheet kaomoji-sheet"><header><b>颜文字</b><button onClick={() => setKaomojiOpen(false)} aria-label="关闭颜文字"><X /></button></header><Suspense fallback={<div className="kaomoji-loading" role="status"><SpinnerGap className="spin" />正在打开颜文字…</div>}><KaomojiSheet onInsert={insert} /></Suspense></div>}
      {voiceOpen && <div className="composer-sheet"><header><b>听哪个系统声音</b><button onClick={() => setVoiceOpen(false)} aria-label="关闭声音"><X /></button></header>{speechAvailable ? <><select value={voiceURI} onChange={(event) => { setVoiceURI(event.target.value); window.localStorage.setItem("fuyue-public-voice", event.target.value); }}><option value="">跟随系统默认</option>{voices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select><p>公开壳先用手机系统声音播放；你的 relay 可再实现同名语音接口。</p></> : <p>这台设备的 WebView 没有提供系统朗读接口。它不会影响聊天、收藏或以后接入 relay 语音。</p>}</div>}
      <form className="composer" onSubmit={submit}>
        {!gateway && <div className="role-switch" role="group" aria-label="本地代录作者"><button type="button" aria-pressed={manualRole === "user"} className={manualRole === "user" ? "active" : ""} onClick={() => setManualRole("user")}>记录我的话</button><button type="button" aria-pressed={manualRole === "companion"} className={manualRole === "companion" ? "active" : ""} onClick={() => setManualRole("companion")}>代录伙伴的话</button></div>}
        <div className="composer-row"><button type="button" className={`plus-button ${plusOpen ? "is-open" : ""}`} onClick={plusOpen ? closePlus : openPlus} aria-expanded={plusOpen} aria-controls="chat-plus-menu" aria-label={plusOpen ? "关闭附加菜单" : "打开附加菜单"}><Plus /></button><textarea ref={composerRef} aria-label="聊天原文" value={content} onChange={(event) => setContent(event.target.value)} placeholder="说点什么…" rows={1} maxLength={20_000} />{sending ? <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()} aria-label="停止回复"><X /></button> : <button className="send-button" disabled={(!content.trim() && !attachments.length) || attachmentBusy} aria-label={gateway ? "发送" : "保存这句话"}>{attachmentBusy ? <SpinnerGap className="spin" /> : <PaperPlaneTilt weight="fill" />}</button>}</div>
      </form>
      <input ref={imageInputRef} hidden type="file" multiple accept="image/*" onChange={(event) => { const files = Array.from(event.currentTarget.files || []).slice(0, 4); event.currentTarget.value = ""; void Promise.all(files.map((file) => pickImage(file))); }} />
      <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void pickImage(file); }} />
      <input ref={fileInputRef} hidden type="file" multiple accept=".txt,.md,.markdown,.json,.csv" onChange={(event) => { const input = event.currentTarget; void readFilesIntoComposer(Array.from(input.files || [])); input.value = ""; }} />
      <input ref={folderInputRef} hidden type="file" multiple accept=".txt,.md,.markdown,.json,.csv" {...{ webkitdirectory: "" }} onChange={(event) => { const input = event.currentTarget; void readFilesIntoComposer(Array.from(input.files || [])); input.value = ""; }} />
    </footer>
  </div>;
}
