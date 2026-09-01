import { useCallback, useEffect, useMemo, useState } from "react";
import { readKaomojiCatalogSyncState, shouldAutomaticallySync, syncKaomojiCatalog, writeKaomojiCatalogSyncState } from "./catalog-sync.js";
import { rankKaomojiCategories } from "./repository.js";
import type { KaomojiAcceptedVersion, KaomojiCandidate, KaomojiCatalogOptions, KaomojiCatalogSyncMode, KaomojiCatalogSyncState, KaomojiItem, KaomojiRepository, KaomojiReviewRepository } from "./types.js";

type KaomojiDrawerProps = {
  repository: KaomojiRepository;
  reviewRepository?: KaomojiReviewRepository;
  onInsert: (value: string) => void;
  title?: string;
  catalog?: KaomojiCatalogOptions | false;
};

export const initialKaomojiRenderLimit = 96;

export function splitKaomojiCategories(value: string) {
  return [...new Set(value.split(/[,，、/]+/).map((part) => part.trim()).filter(Boolean))].slice(0, 8);
}

export function KaomojiDrawer({ repository, reviewRepository, onInsert, title = "颜文字库", catalog = {} }: KaomojiDrawerProps) {
  const [items, setItems] = useState<KaomojiItem[]>([]);
  const [candidates, setCandidates] = useState<KaomojiCandidate[]>([]);
  const [candidateCategories, setCandidateCategories] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [managing, setManaging] = useState(false);
  const [manageView, setManageView] = useState<"library" | "review">("library");
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newCategories, setNewCategories] = useState("可爱");
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [draggedCategory, setDraggedCategory] = useState("");
  const catalogOptions = useMemo(() => catalog || {}, [catalog]);
  const catalogStorageKey = catalogOptions.stateStorageKey;
  const [catalogState, setCatalogState] = useState<KaomojiCatalogSyncState>(() => readKaomojiCatalogSyncState(catalogStorageKey));
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [renderLimit, setRenderLimit] = useState(initialKaomojiRenderLimit);

  const refresh = () => repository.list().then(setItems);
  const refreshCandidates = () => reviewRepository?.listCandidates().then((next) => {
    setCandidates(next);
    setCandidateCategories((current) => Object.fromEntries(next.map((candidate) => [String(candidate.id), current[String(candidate.id)] ?? candidate.suggestedCategories.join("，")])))
  });
  useEffect(() => {
    void refresh();
    void repository.getCategoryOrder?.().then(setCategoryOrder);
  }, [repository]);
  useEffect(() => { void refreshCandidates(); }, [reviewRepository]);
  useEffect(() => { setRenderLimit(initialKaomojiRenderLimit); }, [category, manageView, managing, query]);

  const runCatalogSync = useCallback(async () => {
    if (catalog === false || catalogBusy) return;
    setCatalogBusy(true);
    setCatalogError("");
    setCatalogMessage("");
    const checkedAt = new Date().toISOString();
    try {
      const result = await syncKaomojiCatalog(repository, catalogOptions);
      const next: KaomojiCatalogSyncState = {
        ...catalogState,
        lastCheckedAt: checkedAt,
        lastSyncedAt: checkedAt,
        libraryVersion: result.manifest.libraryVersion,
        lastAdded: result.added,
      };
      setCatalogState(next);
      writeKaomojiCatalogSyncState(next, catalogStorageKey);
      setCatalogMessage(result.added ? `收进 ${result.added} 枚新颜文字` : "已经是最新的啦");
      await refresh();
    } catch (error) {
      const next = { ...catalogState, lastCheckedAt: checkedAt };
      setCatalogState(next);
      writeKaomojiCatalogSyncState(next, catalogStorageKey);
      setCatalogError(error instanceof Error ? error.message : "同步失败，请稍后再试");
    } finally {
      setCatalogBusy(false);
    }
  }, [catalog, catalogBusy, catalogOptions, catalogState, catalogStorageKey, repository]);

  useEffect(() => {
    if (catalog !== false && shouldAutomaticallySync(catalogState, catalogOptions)) void runCatalogSync();
  }, [catalog, catalogOptions, catalogState, runCatalogSync]);

  const setCatalogMode = (mode: KaomojiCatalogSyncMode) => {
    const next = { ...catalogState, mode };
    setCatalogState(next);
    writeKaomojiCatalogSyncState(next, catalogStorageKey);
    setCatalogMessage(mode === "automatic" ? "以后会静静检查新内容" : mode === "manual" ? "只在你点同步时更新" : "已关闭精选库同步");
    setCatalogError("");
  };

  const categories = useMemo(() => rankKaomojiCategories(items, categoryOrder), [categoryOrder, items]);
  const visible = useMemo(() => items.filter((item) => (!category || item.categories.includes(category)) && (!query || [item.value, item.label || "", ...item.categories].some((part) => part.toLowerCase().includes(query.toLowerCase())))), [category, items, query]);
  const renderedItems = visible.slice(0, renderLimit);
  const insert = async (item: KaomojiItem) => { onInsert(item.value); await repository.markUsed(item.value); void refresh(); };
  const save = async () => {
    if (!newValue.trim()) return;
    await repository.upsert(newValue, splitKaomojiCategories(newCategories));
    setNewValue("");
    void refresh();
  };
  const saveCategoryOrder = async (next: string[]) => {
    setCategoryOrder(next);
    await repository.setCategoryOrder?.(next);
  };
  const moveCategory = (value: string, offset: -1 | 1) => {
    const from = categories.indexOf(value);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= categories.length) return;
    const next = [...categories];
    [next[from], next[to]] = [next[to], next[from]];
    void saveCategoryOrder(next);
  };
  const dropCategory = (target: string) => {
    const from = categories.indexOf(draggedCategory);
    const to = categories.indexOf(target);
    setDraggedCategory("");
    if (from < 0 || to < 0 || from === to) return;
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void saveCategoryOrder(next);
  };
  const review = async (candidate: KaomojiCandidate, decision: "approved" | "rejected", acceptedVersion: KaomojiAcceptedVersion = "original") => {
    if (!reviewRepository) return;
    const key = String(candidate.id);
    setBusyCandidate(key);
    try {
      await reviewRepository.reviewCandidate(candidate.id, decision, {
        acceptedVersion,
        categories: splitKaomojiCategories(candidateCategories[key] || candidate.suggestedCategories.join("，")),
      });
      await Promise.all([refresh(), refreshCandidates()]);
    } finally {
      setBusyCandidate(null);
    }
  };

  return <section className="fy-kaomoji" aria-label={title}>
    <header><span><b>{title}</b><small>已带审核好的默认库，使用频率只在本地排序</small></span><button onClick={() => setManaging((value) => !value)}>{managing ? "完成" : "整理"}</button></header>
    {managing && reviewRepository && <div className="fy-kaomoji-segments" role="tablist" aria-label="整理颜文字">
      <button className={manageView === "library" ? "current" : ""} onClick={() => setManageView("library")} role="tab">我的库</button>
      <button className={manageView === "review" ? "current" : ""} onClick={() => setManageView("review")} role="tab">候选箱{candidates.length ? ` ${candidates.length}` : ""}</button>
    </div>}
    {managing && manageView === "library" && <><div className="fy-kaomoji-add"><input value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder="粘贴一枚颜文字"/><input value={newCategories} onChange={(event) => setNewCategories(event.target.value)} placeholder="分类，可填多个"/><button onClick={() => void save()}>收进来</button></div>{catalog !== false && <section className="fy-kaomoji-sync" aria-label="精选库同步">
      <div><b>精选库</b><small>{catalogState.libraryVersion ? `当前 ${catalogState.libraryVersion}` : "审核过的新内容，不重装也能收进来"}</small></div>
      <div className="fy-kaomoji-sync-modes" role="group" aria-label="同步方式">
        <button className={catalogState.mode === "automatic" ? "current" : ""} onClick={() => setCatalogMode("automatic")}>自动同步</button>
        <button className={catalogState.mode === "manual" ? "current" : ""} onClick={() => setCatalogMode("manual")}>仅手动</button>
        <button className={catalogState.mode === "off" ? "current" : ""} onClick={() => setCatalogMode("off")}>关闭</button>
      </div>
      <button className="fy-kaomoji-sync-now" disabled={catalogBusy || catalogState.mode === "off"} onClick={() => void runCatalogSync()}>{catalogBusy ? "正在同步…" : "立即同步"}</button>
      {(catalogMessage || catalogError) && <p className={catalogError ? "error" : ""} role={catalogError ? "alert" : "status"}>{catalogError || catalogMessage}</p>}
    </section>}{repository.setCategoryOrder && <details className="fy-kaomoji-order"><summary><span><b>分类顺序</b><small>拖动，或用箭头手动排</small></span><i>⌔</i></summary><div>{categories.map((value, index) => <p className={draggedCategory === value ? "dragging" : ""} draggable key={value} onDragStart={() => setDraggedCategory(value)} onDragEnd={() => setDraggedCategory("")} onDragOver={(event) => event.preventDefault()} onDrop={() => dropCategory(value)}><i>⠇</i><span>{value}</span><button disabled={index === 0} onClick={() => moveCategory(value, -1)} aria-label={`上移${value}`}>↑</button><button disabled={index === categories.length - 1} onClick={() => moveCategory(value, 1)} aria-label={`下移${value}`}>↓</button></p>)}</div><button className="fy-kaomoji-order-reset" disabled={!categoryOrder.length} onClick={() => void saveCategoryOrder([])}>恢复智能顺序</button></details>}</>}
    {managing && manageView === "review" && reviewRepository ? <div className="fy-kaomoji-review">
      {candidates.length ? candidates.map((candidate) => {
        const key = String(candidate.id);
        const busy = busyCandidate === key;
        return <article className="fy-kaomoji-candidate" key={key}>
          <strong>{candidate.value}</strong>
          {candidate.compatibility !== "stable" && <small>{candidate.compatibilityNotes.join("；") || "跨设备可能易乱码"}</small>}
          {candidate.safeValue && <div><span>兼容版</span><b>{candidate.safeValue}</b></div>}
          <label><span>分类（可多个）</span><input value={candidateCategories[key] ?? candidate.suggestedCategories.join("，")} onChange={(event) => setCandidateCategories((current) => ({ ...current, [key]: event.target.value }))}/></label>
          <footer className={candidate.safeValue ? "has-compatible" : ""}>
            <button disabled={busy} onClick={() => void review(candidate, "rejected")}>不收</button>
            <button disabled={busy} onClick={() => void review(candidate, "approved", "original")}>收原版</button>
            {candidate.safeValue && <button disabled={busy} onClick={() => void review(candidate, "approved", "compatible")}>收兼容版</button>}
          </footer>
        </article>;
      }) : <div className="fy-kaomoji-empty">候选箱已经理完啦</div>}
    </div> : <>
      <input className="fy-kaomoji-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索心情、形状或分类"/>
      <nav><button className={!category ? "current" : ""} onClick={() => setCategory("")}>全部</button>{categories.map((value) => <button className={category === value ? "current" : ""} key={value} onClick={() => setCategory(value)}>{value}</button>)}</nav>
      <div className="fy-kaomoji-grid">{renderedItems.map((item) => <article className={item.categories.includes("字符画") ? "ascii-art" : ""} key={item.value}>
        <button className="fy-kaomoji-value" onClick={() => void insert(item)} title={item.compatibilityNotes.join("；")}>{item.value}</button>
        {item.compatibility !== "stable" && <span>易乱码</span>}
        {managing ? <button className="fy-kaomoji-remove" onClick={async () => { await repository.remove(item.value); void refresh(); }} aria-label="删除">×</button> : <button className={`fy-kaomoji-star${item.favorite ? " is-favorite" : ""}`} onClick={async () => { await repository.setFavorite(item.value, !item.favorite); void refresh(); }} aria-label={item.favorite ? "取消收藏" : "收藏"} aria-pressed={item.favorite}>{item.favorite ? "★" : "☆"}</button>}
      </article>)}</div>
      {renderedItems.length < visible.length && <button className="fy-kaomoji-more" onClick={() => setRenderLimit((current) => current + initialKaomojiRenderLimit)}>再显示 {Math.min(initialKaomojiRenderLimit, visible.length - renderedItems.length)} 枚</button>}
    </>}
  </section>;
}
