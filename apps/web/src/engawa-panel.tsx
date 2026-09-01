import {
  ArrowLeft,
  BookOpen,
  Link,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import type { CompanionGateway, EngawaStatus } from "@fuyue/core";

function readable(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function EngawaPanel({
  gateway,
  onBack,
}: {
  gateway: CompanionGateway | null;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<EngawaStatus | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!gateway?.engawaStatus) return;
    void gateway
      .engawaStatus()
      .then(setStatus)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Engawa 状态不可用"),
      );
  }, [gateway]);
  async function run(tool: string, args: Record<string, unknown> = {}) {
    if (!gateway?.engawaAction || busy) return;
    setBusy(tool);
    setError("");
    try {
      const value = await gateway.engawaAction(tool, args);
      setResult(readable(value.content));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Engawa 没有读回内容");
    } finally {
      setBusy("");
    }
  }
  async function inspect(event: FormEvent) {
    event.preventDefault();
    if (url.trim()) await run("web_read", { url: url.trim() });
  }
  return (
    <div className="panel-content engawa-panel">
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
          <h1 id="panel-title">Engawa 阅读侧廊</h1>
          <p>网页、RSS、诗与书架都通过本机 MIT 侧车真实读回。</p>
        </div>
      </header>
      {!gateway?.engawaStatus ? (
        <p className="form-error">
          <WarningCircle />
          先连接自托管 relay；Engawa 不在浏览器里偷偷直连。
        </p>
      ) : (
        status && (
          <section
            className={`engawa-status ${status.ok ? "ready" : "offline"}`}
          >
            <strong>{status.ok ? "檐廊醒着" : "檐廊还没启动"}</strong>
            <p>{status.detail}</p>
          </section>
        )
      )}
      <div className="engawa-actions">
        <button
          className="secondary-button"
          disabled={!status?.ok || Boolean(busy)}
          onClick={() => void run("daily_poem")}
        >
          {busy === "daily_poem" ? (
            <SpinnerGap className="spin" />
          ) : (
            <BookOpen />
          )}
          今日一诗
        </button>
        <button
          className="secondary-button"
          disabled={!status?.ok || Boolean(busy)}
          onClick={() => void run("on_this_day", { lang: "zh", limit: 5 })}
        >
          {busy === "on_this_day" ? (
            <SpinnerGap className="spin" />
          ) : (
            <BookOpen />
          )}
          历史上的今天
        </button>
        <button
          className="secondary-button"
          disabled={!status?.ok || Boolean(busy)}
          onClick={() => void run("shelf")}
        >
          {busy === "shelf" ? <SpinnerGap className="spin" /> : <BookOpen />}
          我的书架
        </button>
      </div>
      <form className="editor-form" onSubmit={(event) => void inspect(event)}>
        <label>
          读一个网页
          <input
            type="url"
            required
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          disabled={!status?.ok || Boolean(busy) || !url.trim()}
        >
          {busy === "web_read" ? <SpinnerGap className="spin" /> : <Link />}
          {busy === "web_read" ? "正在读" : "送到檐廊读"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          <WarningCircle />
          {error}
        </p>
      )}
      {result && <pre className="engawa-result">{result}</pre>}
    </div>
  );
}
