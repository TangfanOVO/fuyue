import {
  ArrowLeft,
  Link,
  PaperPlaneTilt,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import type {
  CompanionGateway,
  LocalDataRepository,
  RoomEntry,
} from "@fuyue/core";

function shareId(entry: RoomEntry): string {
  return entry.subtype.startsWith("cobrowse_share:")
    ? entry.subtype.slice("cobrowse_share:".length)
    : "";
}
function commentId(entry: RoomEntry): string {
  return entry.subtype.startsWith("cobrowse_comment:")
    ? entry.subtype.slice("cobrowse_comment:".length)
    : "";
}
function linkFrom(entry: RoomEntry): string {
  return entry.content.match(/(?:^|\n)链接：(https:\/\/\S+)/)?.[1] || "";
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间待确认"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export function CobrowsePanel({
  repository,
  entries,
  gateway,
  companionName,
  onBack,
  onChange,
}: {
  repository: LocalDataRepository;
  entries: RoomEntry[];
  gateway: CompanionGateway | null;
  companionName: string;
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threads = useMemo(
    () =>
      entries
        .filter((entry) => entry.subtype.startsWith("cobrowse_share:"))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .map((share) => ({
          share,
          reply: entries.find((entry) => commentId(entry) === shareId(share)),
        })),
    [entries],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    const id = crypto.randomUUID();
    let share: RoomEntry | null = null;
    try {
      share = await repository.createRoomEntry({
        room: "whisper",
        author: "user",
        title: note.trim() ? "想和你一起看" : "一起看这个",
        content: `${note.trim() || "一起看看这个。"}\n\n链接：${url.trim()}`,
        subtype: `cobrowse_share:${id}`,
        sourceLabel: "一起看 · LocalData",
      });
      await onChange();
      if (!gateway?.cobrowseComment)
        throw new Error(
          "分享已经留在本机；连接自己的转接服务后，伙伴才能真的读取页面并评论。",
        );
      const result = await gateway.cobrowseComment(url.trim(), note.trim());
      await repository.createRoomEntry({
        room: "whisper",
        author: "companion",
        title: result.inspection.title,
        content: result.comment,
        subtype: `cobrowse_comment:${id}`,
        sourceLabel: result.sourceLabel,
      });
      await repository.saveRoomEntry({ ...share, status: "done" });
      setUrl("");
      setNote("");
      await onChange();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "这次没有读到公开页面";
      setError(message);
      if (share)
        await repository
          .createRoomEntry({
            room: "whisper",
            author: "system",
            title: "这次没有读到",
            content: message,
            subtype: `cobrowse_comment:${id}`,
            sourceLabel: "一起看 · 失败记录",
          })
          .then(onChange)
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-content cobrowse-panel">
      <header className="panel-header">
        <button
          data-panel-back
          className="icon-button quiet"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft />
        </button>
        <div>
          <h1 id="panel-title">一起看</h1>
          <p>
            聊天里贴链接，或在这里留到小小空间；目前读取公开小红书与 GitHub
            页面。
          </p>
        </div>
      </header>
      <form className="editor-form" onSubmit={(event) => void submit(event)}>
        <label>
          公开链接
          <input
            type="url"
            required
            placeholder="https://www.xiaohongshu.com/… 或 https://github.com/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label>
          想和他说什么
          <textarea
            rows={3}
            maxLength={4000}
            placeholder="一起看看这个，你会怎么想？"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={busy || !url.trim()}>
          {busy ? <SpinnerGap className="spin" /> : <PaperPlaneTilt />}
          {busy ? "正在读公开页面" : "发给他一起看"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          <WarningCircle />
          {error}
        </p>
      )}
      <section className="cobrowse-ledger">
        <h2>空间里的链接</h2>
        {threads.length ? (
          threads.map(({ share, reply }) => (
            <article key={share.id}>
              <header>
                <span>{share.title}</span>
                <time>{formatTime(share.occurredAt)}</time>
              </header>
              <p>{share.content.replace(/\n\n链接：https:\/\/\S+/, "")}</p>
              {linkFrom(share) && (
                <a href={linkFrom(share)} target="_blank" rel="noreferrer">
                  <Link />
                  打开来源
                </a>
              )}
              {reply ? (
                <blockquote data-author={reply.author}>
                  <strong>
                    {reply.author === "companion" ? companionName : "读取结果"}
                  </strong>
                  <p>{reply.content}</p>
                  <small>{reply.sourceLabel}</small>
                </blockquote>
              ) : (
                <small>等待已连接的服务读完页面后评论</small>
              )}
            </article>
          ))
        ) : (
          <p className="empty-copy">
            还没有分享链接。这里不会用示例动态把空间填满。
          </p>
        )}
      </section>
    </div>
  );
}
