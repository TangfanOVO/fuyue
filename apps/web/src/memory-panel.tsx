import { ArrowLeft, Brain, Check, FileText, FloppyDisk, FolderOpen, MagnifyingGlass, PencilSimple, Plus, SpinnerGap, Trash, X } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import type { LocalDataRepository, MemoryItem, MemoryLayer } from "@fuyue/core";
import { MemoryMap } from "@fuyue/ui/memory";
import { readLocalTextFiles } from "./local-file-import";

type MemoryFilter = "all" | MemoryLayer | "draft";

const layerLabels: Record<MemoryLayer, string> = {
  working: "L1 片段",
  semantic: "L2 长期",
  core: "L3 核心",
};

const filters: Array<{ id: MemoryFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "working", label: "L1" },
  { id: "semantic", label: "L2" },
  { id: "core", label: "L3" },
  { id: "draft", label: "待审" },
];

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间待确认" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

export function MemoryPanel({ repository, memories, onChange, onBack, onConfigure }: {
  repository: LocalDataRepository;
  memories: MemoryItem[];
  onChange: () => Promise<void>;
  onBack: () => void;
  onConfigure: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [layer, setLayer] = useState<MemoryLayer>("working");
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [selectedMemoryId, setSelectedMemoryId] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const enabledCount = memories.filter((item) => item.injectionEnabled).length;
  const pendingCount = memories.filter((item) => !item.injectionEnabled || item.status !== "active").length;
  const layerCounts = { working: memories.filter((item) => item.layer === "working").length, semantic: memories.filter((item) => item.layer === "semantic").length, core: memories.filter((item) => item.layer === "core").length };
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleMemories = useMemo(() => memories.filter((item) => {
    if (filter === "draft" && item.injectionEnabled && item.status === "active") return false;
    if (filter !== "all" && filter !== "draft" && item.layer !== filter) return false;
    return !normalizedQuery || `${item.title} ${item.content}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
  }), [filter, memories, normalizedQuery]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim() || busyId) return;
    setBusyId("create"); setError("");
    try {
      if (editingId) {
        const current = memories.find((item) => item.id === editingId);
        if (!current) throw new Error("这条记忆已经不在 LocalData 里了");
        await repository.saveMemory({ ...current, title: title.trim(), content: content.trim(), layer });
      } else await repository.createMemory({ title, content, layer });
      setTitle(""); setContent(""); setLayer("working"); setAdding(false); setEditingId(""); setFilter(editingId ? "all" : "draft");
      await onChange();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "记忆没有保存"); }
    finally { setBusyId(""); }
  }

  function openCreate() { setEditingId(""); setTitle(""); setContent(""); setLayer("working"); setAdding(true); }
  function openEdit(item: MemoryItem) { setEditingId(item.id); setTitle(item.title); setContent(item.content); setLayer(item.layer); setAdding(true); }
  function closeEditor() { setAdding(false); setEditingId(""); setTitle(""); setContent(""); setLayer("working"); }

  async function toggle(item: MemoryItem) {
    if (!item.injectionEnabled && enabledCount >= 200) { setError("已有 200 条记忆参与召回，请先停用一条再启用新记忆。"); return; }
    const enabling = !item.injectionEnabled;
    setBusyId(item.id); setError("");
    try {
      await repository.saveMemory({ ...item, injectionEnabled: enabling, status: enabling ? "active" : "draft" });
      await onChange();
      if (enabling && filter === "draft") setFilter("all");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "记忆状态没有更新"); }
    finally { setBusyId(""); }
  }

  async function remove(item: MemoryItem) {
    if (!window.confirm(`删除记忆“${item.title}”？此操作只影响当前浏览器。`)) return;
    setBusyId(item.id); setError("");
    try { await repository.deleteMemory(item.id); await onChange(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "记忆没有删除"); }
    finally { setBusyId(""); }
  }

  async function importFiles(files: File[]) {
    if (!files.length || importing) return;
    setImporting(true); setError(""); setImportNotice("正在读取本机文件…");
    try {
      const batch = await readLocalTextFiles(files);
      const pending = batch.items.filter((candidate) => !memories.some((item) => item.title === candidate.title && item.content === candidate.content));
      let imported = 0; let failed = batch.skipped + batch.items.length - pending.length;
      for (const candidate of pending) {
        try { await repository.createMemory({ ...candidate, layer: "working" }); imported += 1; }
        catch { failed += 1; }
      }
      if (imported) { await onChange(); setFilter("draft"); }
      setImportNotice(imported
        ? `已读入 ${imported} 条待审记忆，默认不参与召回${failed ? `；${failed} 个文件已跳过` : ""}`
        : `没有读入内容${failed ? `；${failed} 个文件为空、过大、重复或格式不支持` : ""}`);
    } catch { setError("这些本机文件刚才没有读完，请重新选择。"); setImportNotice(""); }
    finally { setImporting(false); }
  }

  return <div className="panel-content memory-library-panel">
    <header className="panel-header"><button data-panel-back className="icon-button quiet" onClick={onBack} aria-label="返回"><ArrowLeft /></button><div><h1 id="panel-title">记忆库</h1><p>审批、来源、禁用与检索</p></div></header>

    <section className="memory-library-overview" aria-label="记忆库概览">
      <span><b>{memories.length}</b><small>全部记忆</small></span>
      <span><b>{enabledCount}</b><small>参与召回</small></span>
      <span><b>{pendingCount}</b><small>等待审阅</small></span>
      <button type="button" className="primary-button" onClick={openCreate}><Plus />新记忆</button>
    </section>

    {pendingCount > 0 && <button type="button" className="memory-review-banner" onClick={() => setFilter("draft")}><Brain /><span><b>{pendingCount} 条记忆等你审阅</b><small>未启用的内容不会交给模型</small></span><strong>去看看</strong></button>}

    {error && <p className="form-error" role="alert">{error}</p>}

    <section className="memory-layer-guide" aria-label="记忆层级说明">
      <span><b>L1</b><strong>{layerCounts.working}</strong><small>短期 · 最近片段</small></span><span><b>L2</b><strong>{layerCounts.semantic}</strong><small>长期 · 稳定事实与偏好</small></span><span><b>L3</b><strong>{layerCounts.core}</strong><small>核心 · 身份关系与边界</small></span>
    </section>

    <div className="memory-library-controls">
      <label><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="找一段记忆" aria-label="搜索记忆" />{query && <button type="button" onClick={() => setQuery("")} aria-label="清空记忆搜索"><X /></button>}</label>
      <nav aria-label="记忆层级">{filters.map((item) => <button type="button" className={filter === item.id ? "on" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} key={item.id}>{item.label}{item.id === "draft" && pendingCount ? <small>{pendingCount}</small> : null}</button>)}</nav>
    </div>

    <MemoryMap memories={memories} selectedId={selectedMemoryId} onSelect={(item) => { setSelectedMemoryId(item.id); openEdit(item); }} empty="写下第一条后，它会按真实层级出现在这里" />

    {visibleMemories.length ? <section className="memory-list" aria-label="记忆列表">{visibleMemories.map((item) => <article className={`memory-item ${item.injectionEnabled ? "is-enabled" : "is-draft"}`} key={item.id}>
      <header><div className="memory-badges"><span>{layerLabels[item.layer]}</span><span>{item.injectionEnabled ? "已启用" : "待审"}</span><time>{timeLabel(item.updatedAt)}</time></div><div className="memory-item-actions"><button type="button" className="icon-button quiet" onClick={() => openEdit(item)} aria-label={`编辑记忆 ${item.title}`}><PencilSimple /></button><button type="button" className="icon-button danger" disabled={busyId === item.id} onClick={() => void remove(item)} aria-label={`删除记忆 ${item.title}`}><Trash /></button></div></header>
      <h2>{item.title}</h2><p>{item.content}</p>
      <footer><button type="button" className={`memory-toggle ${item.injectionEnabled ? "is-on" : ""}`} disabled={busyId === item.id} onClick={() => void toggle(item)} aria-pressed={item.injectionEnabled}><i>{item.injectionEnabled && <Check />}</i><span>{item.injectionEnabled ? "参与召回" : "启用记忆"}</span></button><small>{item.sourceMessageIds.length ? `${item.sourceMessageIds.length} 条原文证据` : "手动留下 · 无原文证据"}</small></footer>
    </article>)}</section> : <section className="memory-library-empty"><Brain /><h2>{memories.length ? "没有符合条件的记忆" : "记忆库还是空的"}</h2><p>{memories.length ? "换一个关键词或层级。" : "新记忆先作为待审内容留下，不会偷跑进模型。"}</p><button type="button" className="secondary-button" onClick={() => { if (memories.length) { setQuery(""); setFilter("all"); } else setAdding(true); }}>{memories.length ? "查看全部" : "写第一条"}</button></section>}

    <details className="memory-system-note"><summary>这套记忆怎样工作</summary><div><p>L1 / L2 / L3 是可审阅层级。当前公开版不会自动蒸馏、升格、降权或遗忘；只有你明确启用的记忆才参与召回。</p><button type="button" className="text-button" onClick={onConfigure}>查看记忆功能包</button></div></details>

    <section className="memory-file-import" aria-label="从本机文件导入记忆">
      <span><b>从手机整理旧记忆</b><small>TXT、Markdown、JSON、CSV；先进入待审，确认后才参与召回。</small></span>
      <div>
        <label><FileText /><span>多选文件</span><input disabled={importing} type="file" multiple accept=".txt,.md,.markdown,.json,.csv" onChange={(event) => { const input = event.currentTarget; void importFiles(Array.from(input.files || [])); input.value = ""; }} /></label>
        <label><FolderOpen /><span>{importing ? "读取中…" : "读文件夹"}</span><input disabled={importing} type="file" multiple accept=".txt,.md,.markdown,.json,.csv" {...{ webkitdirectory: "" }} onChange={(event) => { const input = event.currentTarget; void importFiles(Array.from(input.files || [])); input.value = ""; }} /></label>
      </div>
    </section>
    {importNotice && <p className="memory-import-notice" role="status">{importNotice}</p>}

    {adding && <button type="button" className="memory-editor-scrim" onClick={closeEditor} aria-label="关闭记忆编辑" />}
    <section className={`memory-editor-sheet ${adding ? "is-open" : ""}`} aria-hidden={!adding}><header><div><h2>{editingId ? "整理这条记忆" : "写一条记忆"}</h2><p>{editingId ? "修改后保留原来的召回状态和证据索引。" : "新记忆先作为待审内容，不会偷跑进模型。"}</p></div><button type="button" className="icon-button quiet" onClick={closeEditor} aria-label="关闭记忆编辑"><X /></button></header><form className="editor-form memory-create-form" onSubmit={create}>
      <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required autoFocus={adding} /></label>
      <label>内容<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={4000} required /></label>
      <label>记忆层级<select value={layer} onChange={(event) => setLayer(event.target.value as MemoryLayer)}>{Object.entries(layerLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <button className="primary-button full-button" disabled={!title.trim() || !content.trim() || busyId === "create"}>{busyId === "create" ? <SpinnerGap className="spin" /> : <FloppyDisk />}{editingId ? "保存修改" : "保存为待审记忆"}</button>
    </form></section>
  </div>;
}
