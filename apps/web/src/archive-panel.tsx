import { ArrowLeft, ClockCounterClockwise, EyeSlash, Image as ImageIcon, MagnifyingGlass, Star, Trash, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { LocalDataRepository, Message, MessageArchiveState, PersonProfile } from "@fuyue/core";

function sourceName(message: Message) {
  if (message.source === "chatgpt_work") return "ChatGPT Work";
  if (message.source === "codex") return "Codex";
  if (message.source === "relay") return message.modelLabel || message.sourceLabel || "relay";
  if (message.source === "external_import") return message.sourceLabel || "外部导入";
  if (message.source === "system_seed") return "本地示例";
  return message.sourceLabel || "本地记录";
}

export function ArchivePanel({ repository, messages, people, onBack, onChange }: { repository: LocalDataRepository; messages: Message[]; people: PersonProfile[]; onBack: () => void; onChange: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<MessageArchiveState>("active");
  const [starred, setStarred] = useState(false);
  const [mediaOnly, setMediaOnly] = useState(false);
  const companionName = people.find((item) => item.id === "companion")?.displayName || "伙伴";
  const userName = people.find((item) => item.id === "user")?.displayName || "我";
  const normalized = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => messages.filter((item) => item.archiveState === state)
    .filter((item) => !starred || item.isStarred)
    .filter((item) => !mediaOnly || item.attachments.length)
    .filter((item) => !normalized || `${item.content} ${item.sourceLabel} ${item.modelLabel}`.toLocaleLowerCase().includes(normalized))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [messages, mediaOnly, normalized, starred, state]);

  async function update(message: Message, next: Partial<Message>) { await repository.saveMessage({ ...message, ...next }); await onChange(); }
  async function updatePairStar(message: Message) {
    const next = !message.isStarred;
    const parentId = message.role === "companion" ? message.parentMessageId : message.id;
    const pair = messages.filter((item) => item.id === parentId || item.parentMessageId === parentId);
    await Promise.all((pair.length ? pair : [message]).map((item) => repository.saveMessage({ ...item, isStarred: next })));
    await onChange();
  }

  return <div className="panel-content archive-panel">
    <header className="panel-header"><button data-panel-back className="icon-button quiet" onClick={onBack} aria-label="返回"><ArrowLeft /></button><div><h1 id="panel-title">原文账本</h1><p>这里永久保留全部原文；48 小时只限制每次发给模型的短期召回。</p></div></header>
    <section className="archive-summary"><ClockCounterClockwise /><span><b>{messages.length} 句永久原文</b><small>{messages.filter((item) => item.isStarred).length} 句收藏 · {messages.filter((item) => item.attachments.length).length} 句带媒体</small></span></section>
    <label className="feature-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索一句话、一个细节…" /></label>
    <div className="archive-state-tabs" role="tablist" aria-label="档案状态">{([['active', '档案'], ['hidden', '已隐藏'], ['deleted', '回收站']] as const).map(([id, label]) => <button role="tab" aria-selected={state === id} className={state === id ? "on" : ""} key={id} onClick={() => setState(id)}>{label}</button>)}</div>
    <div className="archive-filters"><button className={starred ? "on" : ""} aria-pressed={starred} onClick={() => setStarred((current) => !current)}><Star />收藏</button><button className={mediaOnly ? "on" : ""} aria-pressed={mediaOnly} onClick={() => setMediaOnly((current) => !current)}><ImageIcon />图片</button></div>
    <div className="archive-list">{visible.map((message) => <article className={message.role} key={message.id}>
      <header><b>{message.role === "user" ? userName : companionName}</b><span>{sourceName(message)}</span><time>{new Date(message.createdAt).toLocaleString("zh-CN")}</time><button className={message.isStarred ? "on" : ""} onClick={() => void updatePairStar(message)} aria-label={message.isStarred ? "取消成对收藏" : "成对收藏"}><Star weight={message.isStarred ? "fill" : "regular"} /></button></header>
      {message.content && <p>{message.content}</p>}
      {!!message.attachments.length && <div className="archive-media">{message.attachments.map((item) => item.mediaType.startsWith("image/") ? <img src={item.dataUrl} alt={item.name} key={item.id} /> : item.mediaType.startsWith("audio/") ? <audio controls preload="metadata" src={item.dataUrl} aria-label={item.name} key={item.id} /> : <a href={item.dataUrl} download={item.name} key={item.id}>{item.name}</a>)}</div>}
      <footer>{state === "active" && <><button onClick={() => void update(message, { archiveState: "hidden" })}><EyeSlash />隐藏</button><button onClick={() => void update(message, { archiveState: "deleted" })}><Trash />移入回收站</button></>}{state !== "active" && <button onClick={() => void update(message, { archiveState: "active" })}><ArrowCounterClockwise />恢复</button>}{state === "hidden" && <button onClick={() => void update(message, { archiveState: "deleted" })}><Trash />移入回收站</button>}</footer>
    </article>)}{!visible.length && <div className="archive-empty">这一层还没有匹配的原文。</div>}</div>
    {state === "deleted" && <p className="field-note">公开壳暂不提供一键不可恢复销毁；回收站内容仍会进入你主动下载的 LocalData 副本。</p>}
  </div>;
}
