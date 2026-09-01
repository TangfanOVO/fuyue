import { type ReactNode } from "react";
import { MemoryConstellation, type ConstellationMemory, type ConstellationRelation, visualNodeCountForMemoryCount } from "./memory-constellation";

export { visualNodeCountForMemoryCount, worldDimensionScaleForVisualNodeCount, wrapWorldY } from "./memory-constellation";

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  layer: "working" | "semantic" | "core";
  status: "draft" | "active" | "archived";
  injectionEnabled: boolean;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryLedgerProps {
  memories: MemoryItem[];
  labels?: Partial<Record<MemoryItem["layer"], string>>;
  empty?: ReactNode;
  onToggle?: (memory: MemoryItem) => void;
  onOpen?: (memory: MemoryItem) => void;
}

const defaults = { working: "L1 当前", semantic: "L2 长期", core: "L3 核心" } as const;

export interface MemoryMapProps {
  memories: MemoryItem[];
  selectedId?: string;
  onSelect?: (memory: MemoryItem) => void;
  empty?: ReactNode;
}

function sourceRelations(memories: MemoryItem[]): ConstellationRelation[] {
  const groups = new Map<string, number[]>();
  memories.forEach((memory, index) => memory.sourceMessageIds.forEach((sourceId) => groups.set(sourceId, [...(groups.get(sourceId) || []), index])));
  const pairCounts = new Map<string, { left: number; right: number; count: number }>();
  groups.forEach((indexes) => {
    indexes.forEach((left, position) => {
      const right = indexes[position + 1];
      if (right === undefined || left === right) return;
      const low = Math.min(left, right);
      const high = Math.max(left, right);
      const key = `${low}:${high}`;
      const current = pairCounts.get(key) || { left: low, right: high, count: 0 };
      current.count += 1;
      pairCounts.set(key, current);
    });
  });
  return [...pairCounts.values()].flatMap(({ left, right, count }) => {
    const leftMemory = memories[left];
    const rightMemory = memories[right];
    return leftMemory && rightMemory ? [{ source_id: leftMemory.id, target_id: rightMemory.id, relation: "source" as const, score: 1, label: `${count} 条共同原文证据`, shared_tags: [], shared_evidence_count: count }] : [];
  });
}

export function MemoryMap({ memories, onSelect, empty = "还没有记忆可以画进来" }: MemoryMapProps) {
  const items: ConstellationMemory[] = memories.map((memory) => ({
    id: memory.id,
    memory_kind: "memory",
    memory_layer: memory.layer,
    title: memory.title,
    content: memory.content,
    source_ref: { sourceMessageIds: [...memory.sourceMessageIds] },
    status: memory.injectionEnabled ? "active" : "draft",
    tags: [],
    created_at: memory.createdAt,
  }));
  const relations = sourceRelations(memories);
  const visualNodeCount = visualNodeCountForMemoryCount(memories.length);
  return <section className="fuyue-memory-map-real" aria-label="记忆星图">
    <header><span><strong>记忆星图</strong><small>144 个是视觉下限；超过后每条真记忆至少对应一个字符</small></span><em>{memories.length} 条真记忆 · {visualNodeCount} 个字符 · {relations.length} 条证据关联</em></header>
    <MemoryConstellation items={items} relations={relations} onEdit={(id) => { const memory = memories.find((item) => item.id === id); if (memory) onSelect?.(memory); }} />
    {!memories.length ? <p className="memory-constellation-public-note">{empty}；字符星群仍然亮着，但不冒充记忆记录。</p> : null}
  </section>;
}

export function MemoryLedger({ memories, labels = {}, empty = "还没有记忆", onToggle, onOpen }: MemoryLedgerProps) {
  if (!memories.length) return <div className="fuyue-memory-empty">{empty}</div>;
  return <section className="fuyue-memory-ledger">{memories.map((memory) => <article className="fuyue-memory-row" key={memory.id}>
    <button type="button" className="fuyue-memory-open" onClick={() => onOpen?.(memory)} disabled={!onOpen}>
      <span>{labels[memory.layer] || defaults[memory.layer]}</span>
      <strong>{memory.title}</strong>
      <p>{memory.content}</p>
      <small>{memory.sourceMessageIds.length ? `${memory.sourceMessageIds.length} 条原文证据` : "无原文证据"}</small>
    </button>
    {onToggle && <label className="fuyue-memory-toggle"><input type="checkbox" checked={memory.injectionEnabled} onChange={() => onToggle(memory)} /><span>参与召回</span></label>}
  </article>)}</section>;
}
