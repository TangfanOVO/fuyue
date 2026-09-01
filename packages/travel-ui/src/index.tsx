import { useState, type FormEvent, type ReactNode } from "react";
export type TravelAction = "open" | "walk" | "look";
export interface TravelPlace {
  id: string;
  name: string;
  note?: string;
  state: "available" | "current" | "visited";
}
export interface TravelJournalEntry {
  id: string;
  placeId?: string;
  title: string;
  content: string;
  occurredAt: string;
  sourceLabel: string;
}
export interface TravelRoomProps {
  title?: string;
  subtitle?: string;
  places: TravelPlace[];
  journal: TravelJournalEntry[];
  busy?: TravelAction | null;
  error?: string;
  empty?: ReactNode;
  onAction: (action: TravelAction, placeId?: string) => void | Promise<void>;
}
export function TravelRoom({
  title = "旅行房",
  subtitle = "前端只展示适配器实际读回的旅程。",
  places,
  journal,
  busy,
  error,
  empty,
  onAction,
}: TravelRoomProps) {
  const current = places.find((item) => item.state === "current");
  return (
    <section className="fuyue-travel-room">
      <header>
        <span>
          <small>可拆旅行前端</small>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </span>
        <button disabled={Boolean(busy)} onClick={() => void onAction("open")}>
          {busy === "open" ? "正在开门" : "打开一扇门"}
        </button>
      </header>
      {error && (
        <p className="fuyue-travel-error" role="alert">
          {error}
        </p>
      )}
      {places.length ? (
        <div className="fuyue-travel-places">
          {places.map((place) => (
            <article data-state={place.state} key={place.id}>
              <span>
                <strong>{place.name}</strong>
                <small>
                  {place.note ||
                    (place.state === "current" ? "正在这里" : "等待探索")}
                </small>
              </span>
              <div>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => void onAction("walk", place.id)}
                >
                  走走
                </button>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => void onAction("look", place.id)}
                >
                  看看
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="fuyue-travel-empty">
          {empty || "适配器尚未返回地点；不会用示例行程冒充。"}
        </div>
      )}
      <section className="fuyue-travel-journal">
        <h3>{current ? `${current.name}的旅程原文` : "旅程原文"}</h3>
        {journal.length ? (
          journal.map((entry) => (
            <article key={entry.id}>
              <time>
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(entry.occurredAt))}
              </time>
              <strong>{entry.title}</strong>
              <p>{entry.content}</p>
              <small>{entry.sourceLabel}</small>
            </article>
          ))
        ) : (
          <p>还没有适配器读回的旅程记录。</p>
        )}
      </section>
    </section>
  );
}

export interface JourneyTextNotebookProps {
  entries: TravelJournalEntry[];
  busy?: boolean;
  error?: string;
  onSave: (entry: { title: string; content: string }) => void | Promise<void>;
}

export function JourneyTextNotebook({
  entries,
  busy = false,
  error = "",
  onSave,
}: JourneyTextNotebookProps) {
  const [mode, setMode] = useState<"line" | "note">("line");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = content.trim();
    if (!value || busy) return;
    await onSave({
      title: title.trim() || (mode === "line" ? "旅途的一句话" : "旅行手记"),
      content: value,
    });
    setTitle("");
    setContent("");
  }
  return (
    <section className="fuyue-journey-notebook">
      <header>
        <small>Journey Cards · 纯文字适配</small>
        <h2>旅行手记</h2>
        <p>
          可以只留一句，也可以认真写一页。记录直接保存在
          LocalData，不要求视觉模型。
        </p>
      </header>
      <div className="fuyue-journey-modes" aria-label="手记长度">
        <button data-active={mode === "line"} onClick={() => setMode("line")}>
          一句话
        </button>
        <button data-active={mode === "note"} onClick={() => setMode("note")}>
          旅行笔记
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <input
          aria-label="手记标题"
          maxLength={120}
          placeholder={
            mode === "line" ? "地点或这一刻（可不填）" : "这页叫什么"
          }
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          aria-label="手记正文"
          maxLength={mode === "line" ? 360 : 6000}
          rows={mode === "line" ? 3 : 8}
          placeholder={
            mode === "line" ? "在路上留一句……" : "把这段旅程写下来……"
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <button
          className="fuyue-journey-save"
          disabled={busy || !content.trim()}
        >
          {busy ? "正在收好" : "收进旅行手记"}
        </button>
      </form>
      {error && (
        <p className="fuyue-travel-error" role="alert">
          {error}
        </p>
      )}
      <section className="fuyue-travel-journal">
        <h3>已经走过的文字</h3>
        {entries.length ? (
          entries.map((entry) => (
            <article key={entry.id}>
              <time>
                {new Intl.DateTimeFormat("zh-CN", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(entry.occurredAt))}
              </time>
              <strong>{entry.title}</strong>
              <p>{entry.content}</p>
              <small>{entry.sourceLabel}</small>
            </article>
          ))
        ) : (
          <p>还没有旅行手记。第一句会留在这台设备的 LocalData 里。</p>
        )}
      </section>
    </section>
  );
}
