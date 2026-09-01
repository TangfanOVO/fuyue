// @ts-nocheck -- Exact visual port; the public adapter validates its inputs.
"use client";

import { Link2, Minus, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ConstellationMemory = {
  id: string;
  memory_kind: string;
  memory_layer: string;
  title: string | null;
  content: string;
  source_ref: Record<string, unknown>;
  status: string;
  tags: string[];
  created_at: string;
};

export type ConstellationRelation = {
  source_id: string;
  target_id: string;
  relation: "explicit" | "source" | "tag" | "vector";
  score: number;
  label: string;
  shared_tags: string[];
  shared_evidence_count: number;
};

type GraphNode = {
  item: ConstellationMemory;
  interactive: boolean;
  projection: number;
  x: number;
  y: number;
  depth: number;
  glyph: string;
  nextMutation: number;
};

type GraphEdge = {
  from: number;
  to: number;
  relation: ConstellationRelation["relation"] | "projection";
  label: string;
};

type LightTrace = {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
};

type VisualEdge = { from: number; to: number };

type SelectionFeedback = {
  index: number;
  kind: "lock" | "release";
  startedAt: number;
};

type PinchGesture = {
  centroidX: number;
  centroidY: number;
  distance: number;
  scale: number;
  panX: number;
  panY: number;
};

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%*()[]{}";
const MIN_VISUAL_NODE_COUNT = 144;
const INTERACTION_NEIGHBOR_COUNT = 4;
const INTERACTION_RADIUS = 110;
const EMPTY_VISUAL_ITEM: ConstellationMemory = {
  id: "__visual-constellation__",
  memory_kind: "visual",
  memory_layer: "working",
  title: null,
  content: "",
  source_ref: {},
  status: "draft",
  tags: [],
  created_at: "1970-01-01T00:00:00.000Z",
};
const LAYER_CENTER: Record<string, [number, number]> = {
  core: [.58, .42],
  semantic: [.62, .52],
  episodic: [.38, .48],
  working: [.44, .57],
  archive: [.22, .66],
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number) {
  let value = seed || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function layerOf(item: ConstellationMemory) {
  if (item.status === "archived" || item.memory_layer === "archive") return "archive";
  return item.memory_layer;
}

export function visualNodeCountForMemoryCount(memoryCount: number) {
  const normalized = Number.isFinite(memoryCount) ? Math.max(0, Math.floor(memoryCount)) : 0;
  return Math.max(MIN_VISUAL_NODE_COUNT, normalized);
}

export function worldDimensionScaleForVisualNodeCount(visualNodeCount: number) {
  const normalized = Number.isFinite(visualNodeCount) ? Math.max(MIN_VISUAL_NODE_COUNT, Math.floor(visualNodeCount)) : MIN_VISUAL_NODE_COUNT;
  return Math.sqrt(normalized / MIN_VISUAL_NODE_COUNT);
}

export function wrapWorldY(normalizedY: number, travel: number, worldHeight: number) {
  const span = Math.max(1, worldHeight);
  const initialY = (normalizedY - .5) * span;
  return ((initialY + travel + span / 2) % span + span) % span - span / 2;
}

function makeGraph(items: ConstellationMemory[], relations: ConstellationRelation[]) {
  const hasMemories = items.length > 0;
  const visualItems = hasMemories ? items : [EMPTY_VISUAL_ITEM];
  const totalNodes = visualNodeCountForMemoryCount(items.length);
  const nodes = Array.from({ length: totalNodes }, (_, displayIndex) => {
    const itemIndex = hasMemories ? displayIndex % items.length : 0;
    const item = visualItems[itemIndex];
    const projection = hasMemories ? Math.floor(displayIndex / items.length) : displayIndex;
    const seed = hashText(`${item.id}:projection:${projection}`);
    const random = seededUnit(seed);
    const layer = layerOf(item);
    const center = LAYER_CENTER[layer] || [.5, .5];
    const goldenX = (displayIndex * .61803398875 + random() * .21) % 1;
    const evenY = (displayIndex * .75487766625 + random() * .05) % 1;
    return {
      item,
      interactive: hasMemories,
      projection,
      x: Math.max(.018, Math.min(.982, goldenX * .86 + center[0] * .14)),
      y: evenY,
      depth: .28 + random() * .72,
      glyph: GLYPHS[Math.floor(random() * GLYPHS.length)],
      nextMutation: 420 + random() * 780,
    } satisfies GraphNode;
  });

  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (from: number, to: number, relation: GraphEdge["relation"], label: string) => {
    if (from === to) return;
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    const key = `${low}:${high}:${relation}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from: low, to: high, relation, label });
  };

  const projectionGroups = new Map<string, number[]>();
  const primaryIndexByMemory = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (!node.interactive) return;
    projectionGroups.set(node.item.id, [...(projectionGroups.get(node.item.id) || []), index]);
    if (node.projection === 0) primaryIndexByMemory.set(node.item.id, index);
  });

  relations.forEach((relation) => {
    const from = primaryIndexByMemory.get(relation.source_id);
    const to = primaryIndexByMemory.get(relation.target_id);
    if (from === undefined || to === undefined) return;
    addEdge(from, to, relation.relation, relation.label);
  });
  projectionGroups.forEach((indexes) => {
    indexes.forEach((index, position) => {
      if (position > 0) addEdge(indexes[0], index, "projection", "同一记忆的显示投影");
    });
  });

  const clusterEdges = [...edges].sort((left, right) => {
    const priority = { explicit: 0, source: 1, tag: 2, vector: 3, projection: 4 } as const;
    return priority[left.relation] - priority[right.relation];
  });
  clusterEdges.forEach((edge, edgeIndex) => {
    if (edge.relation === "projection") return;
    const anchor = nodes[edge.from];
    const follower = nodes[edge.to];
    const random = seededUnit(hashText(`${anchor.item.id}:${follower.item.id}:${edge.relation}:${edgeIndex}`));
    const radius = edge.relation === "source" || edge.relation === "explicit" ? .038 + random() * .035 : .052 + random() * .045;
    const angle = random() * Math.PI * 2;
    follower.x = Math.max(.018, Math.min(.982, anchor.x + Math.cos(angle) * radius));
    follower.y = ((anchor.y + Math.sin(angle) * radius) % 1 + 1) % 1;
  });

  const minimumGap = Math.min(.026, .72 / Math.sqrt(nodes.length));
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const cells = new Map<string, number[]>();
    for (let right = 0; right < nodes.length; right += 1) {
      const second = nodes[right];
      const cellX = Math.floor(second.x / minimumGap);
      const cellY = Math.floor(second.y / minimumGap);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nearby = cells.get(`${cellX + offsetX}:${cellY + offsetY}`) || [];
        for (const left of nearby) {
          const first = nodes[left];
          let dx = second.x - first.x;
          let dy = second.y - first.y;
          let distance = Math.hypot(dx, dy);
          if (distance >= minimumGap) continue;
          if (distance < .0001) {
            const angle = seededUnit(hashText(`${first.item.id}:${second.item.id}:${iteration}`))() * Math.PI * 2;
            dx = Math.cos(angle) * .001;
            dy = Math.sin(angle) * .001;
            distance = .001;
          }
          const push = (minimumGap - distance) * .34;
          const pushX = dx / distance * push;
          const pushY = dy / distance * push;
          first.x = Math.max(.018, Math.min(.982, first.x - pushX));
          first.y = Math.max(.012, Math.min(.988, first.y - pushY));
          second.x = Math.max(.018, Math.min(.982, second.x + pushX));
          second.y = Math.max(.012, Math.min(.988, second.y + pushY));
        }
      }
      const finalCellX = Math.floor(second.x / minimumGap);
      const finalCellY = Math.floor(second.y / minimumGap);
      const key = `${finalCellX}:${finalCellY}`;
      cells.set(key, [...(cells.get(key) || []), right]);
    }
    clusterEdges.forEach((edge) => {
      if (edge.relation === "projection") return;
      const first = nodes[edge.from];
      const second = nodes[edge.to];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.max(.0001, Math.hypot(dx, dy));
      const target = edge.relation === "source" || edge.relation === "explicit" ? .062 : .086;
      if (distance <= target * 1.18) return;
      const pull = (distance - target) * .025;
      second.x = Math.max(.018, Math.min(.982, second.x - dx / distance * pull));
      second.y = Math.max(.012, Math.min(.988, second.y - dy / distance * pull));
    });
  }

  [...nodes]
    .sort((left, right) => left.y - right.y)
    .forEach((node, index, ordered) => {
      node.y = (index + .5) / ordered.length;
    });

  return { nodes, edges, worldScale: worldDimensionScaleForVisualNodeCount(totalNodes) };
}

function makeTraces(count: number) {
  const random = seededUnit(50817);
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    length: .09 + random() * .38,
    speed: .10 + random() * .18,
    alpha: .14 + random() * .18,
  } satisfies LightTrace));
}

export function MemoryConstellation({ items, relations, onEdit }: { items: ConstellationMemory[]; relations: ConstellationRelation[]; onEdit: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const lockedNodeIndexRef = useRef<number | null>(null);
  const [selected, setSelected] = useState<ConstellationMemory | null>(null);
  const graph = useMemo(() => makeGraph(items, relations), [items, relations]);
  const related = useMemo(() => {
    if (!selected) return [];
    const selectedIndexes = new Set(graph.nodes.map((node, index) => node.item.id === selected.id ? index : -1).filter((index) => index >= 0));
    const relationships = new Map<string, { item: ConstellationMemory; labels: Set<string> }>();
    graph.edges.forEach((edge) => {
      if (edge.relation === "projection") return;
      const otherIndex = selectedIndexes.has(edge.from) ? edge.to : selectedIndexes.has(edge.to) ? edge.from : -1;
      if (otherIndex < 0) return;
      const item = graph.nodes[otherIndex].item;
      if (item.id === selected.id) return;
      const current = relationships.get(item.id) || { item, labels: new Set<string>() };
      current.labels.add(edge.label);
      relationships.set(item.id, current);
    });
    return [...relationships.values()].slice(0, 6);
  }, [graph, selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const worldScale = graph.worldScale;
    const worldArea = worldScale * worldScale;
    const minimumScale = Math.max(.12, 1 / worldScale);
    const traces = makeTraces(Math.round((coarsePointer ? 34 : 56) * worldArea));
    const nodes = graph.nodes.map((node) => ({ ...node }));
    const edges = graph.edges;
    const readPalette = () => {
      const styles = getComputedStyle(canvas);
      const surface = canvas.parentElement ? getComputedStyle(canvas.parentElement) : styles;
      const signal = styles.getPropertyValue("--memory-signal-rgb").trim() || "0,184,255";
      return {
        signal,
        active: signal,
        background: surface.backgroundColor || styles.getPropertyValue("--memory-canvas-background").trim() || "#01050a",
        node: styles.getPropertyValue("--memory-node-rgb").trim() || "116,128,141",
      };
    };
    let palette = readPalette();
    const primaryIndexByMemory = new Map<string, number>();
    const projectionIndexesByMemory = new Map<string, number[]>();
    nodes.forEach((node, index) => {
      projectionIndexesByMemory.set(node.item.id, [...(projectionIndexesByMemory.get(node.item.id) || []), index]);
      if (node.projection === 0) primaryIndexByMemory.set(node.item.id, index);
    });
    const edgeIndexesByNode = Array.from({ length: nodes.length }, () => [] as number[]);
    edges.forEach((edge, index) => {
      edgeIndexesByNode[edge.from].push(index);
      edgeIndexesByNode[edge.to].push(index);
    });
    let width = 0;
    let height = 0;
    let worldWidth = 0;
    let worldHeight = 0;
    let dpr = 1;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let pointer: { x: number; y: number } | null = null;
    let drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;
    const touchPointers = new Map<number, { x: number; y: number }>();
    let pinch: PinchGesture | null = null;
    let active = true;
    let lastFrame = 0;
    let frameCount = 0;
    let fpsAt = performance.now();
    let fps = 60;
    let selectionFeedbacks: SelectionFeedback[] = [];
    const fpsElement = canvas.parentElement?.querySelector<HTMLElement>("[data-fps]");
    const zoomElement = canvas.parentElement?.querySelector<HTMLElement>("[data-zoom]");
    const constellationElement = canvas.parentElement;
    let lastVisibleNodeCount = -1;

    const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

    const clampScale = (value: number) => Math.max(minimumScale, Math.min(3.2, value));
    const clampPan = () => {
      const edgePadding = Math.min(width, height) * .28;
      const maxPanX = Math.max(0, (worldWidth * scale - width) / 2) + edgePadding;
      const maxPanY = Math.max(0, (worldHeight * scale - height) / 2) + edgePadding;
      panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
      panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    };

    const zoomAround = (nextScale: number, focalX: number, focalY: number) => {
      const contentX = (focalX - width / 2 - panX) / scale;
      const contentY = (focalY - height / 2 - panY) / scale;
      scale = clampScale(nextScale);
      panX = focalX - width / 2 - contentX * scale;
      panY = focalY - height / 2 - contentY * scale;
      clampPan();
    };

    const wrappedY = (node: GraphNode, now: number) => {
      const travel = reduceMotion ? 0 : now * .004725;
      return wrapWorldY(node.y, travel, worldHeight);
    };

    const pointOf = (node: GraphNode, now: number) => ({
      x: (node.x - .5) * worldWidth * scale + width / 2 + panX,
      y: wrappedY(node, now) * scale + height / 2 + panY,
    });

    const nearestIndicesAt = (x: number, y: number, count: number, now: number) => {
      const nearest: Array<{ index: number; distance: number }> = [];
      nodes.forEach((node, index) => {
        const point = pointOf(node, now);
        const distance = Math.hypot(point.x - x, point.y - y);
        const insertion = nearest.findIndex((entry) => distance < entry.distance);
        if (insertion < 0) nearest.push({ index, distance });
        else nearest.splice(insertion, 0, { index, distance });
        if (nearest.length > count) nearest.pop();
      });
      return nearest;
    };

    const draw = (now: number) => {
      context.globalAlpha = 1;
      context.fillStyle = palette.background;
      context.fillRect(0, 0, width, height);
      const points = nodes.map((node) => pointOf(node, now));
      const selectedPrimary = selectedIdRef.current ? primaryIndexByMemory.get(selectedIdRef.current) : undefined;
      const lockedIndex = lockedNodeIndexRef.current ?? selectedPrimary;
      const lockedPoint = lockedIndex !== undefined ? points[lockedIndex] : null;
      const interactionCenter = lockedPoint || pointer;
      const interactionEntries = interactionCenter
        ? nearestIndicesAt(interactionCenter.x, interactionCenter.y, INTERACTION_NEIGHBOR_COUNT, now).filter((entry) => entry.distance < INTERACTION_RADIUS)
        : [];
      const interactionNodeIndices = interactionEntries.map((entry) => entry.index);
      const rawAnchors = lockedIndex !== undefined
        ? [lockedIndex]
        : interactionNodeIndices.slice(0, INTERACTION_NEIGHBOR_COUNT);
      const anchorIndices = [...new Set(rawAnchors.map((index) => primaryIndexByMemory.get(nodes[index].item.id) ?? index))];
      const relationPriority = { explicit: 0, source: 1, tag: 2, vector: 3, projection: 4 } as const;
      const firstEdgeIndexes = [...new Set(anchorIndices.flatMap((index) => edgeIndexesByNode[index]))]
        .filter((edgeIndex) => edges[edgeIndex].relation !== "projection")
        .sort((left, right) => {
          return relationPriority[edges[left].relation] - relationPriority[edges[right].relation];
        })
        .slice(0, coarsePointer ? 7 : 10);
      const firstEdgeSet = new Set(firstEdgeIndexes);
      const firstNeighborIndices = new Set<number>();
      firstEdgeIndexes.forEach((edgeIndex) => {
        firstNeighborIndices.add(edges[edgeIndex].from);
        firstNeighborIndices.add(edges[edgeIndex].to);
      });
      anchorIndices.forEach((index) => firstNeighborIndices.delete(index));
      const secondEdgeIndexes = [...new Set([...firstNeighborIndices].flatMap((index) => edgeIndexesByNode[index]))]
        .filter((edgeIndex) => edges[edgeIndex].relation !== "projection" && !firstEdgeSet.has(edgeIndex))
        .filter((edgeIndex) => !anchorIndices.includes(edges[edgeIndex].from) && !anchorIndices.includes(edges[edgeIndex].to))
        .sort((left, right) => relationPriority[edges[left].relation] - relationPriority[edges[right].relation])
        .slice(0, coarsePointer ? 8 : 14);

      const anchorMemoryIds = new Set(rawAnchors.map((index) => nodes[index].item.id));
      const displayedAnchorByMemory = new Map<string, number>();
      rawAnchors.forEach((index) => {
        const memoryId = nodes[index].item.id;
        const current = displayedAnchorByMemory.get(memoryId);
        if (current === undefined || !interactionCenter || Math.hypot(points[index].x - interactionCenter.x, points[index].y - interactionCenter.y) < Math.hypot(points[current].x - interactionCenter.x, points[current].y - interactionCenter.y)) {
          displayedAnchorByMemory.set(memoryId, index);
        }
      });
      const nearestProjection = (memoryId: string, originIndex: number) => {
        const origin = points[originIndex];
        return (projectionIndexesByMemory.get(memoryId) || []).reduce((nearest, index) => {
          if (nearest === null) return index;
          const candidateDistance = Math.hypot(points[index].x - origin.x, points[index].y - origin.y);
          const nearestDistance = Math.hypot(points[nearest].x - origin.x, points[nearest].y - origin.y);
          return candidateDistance < nearestDistance ? index : nearest;
        }, null as number | null);
      };
      const isLocalPair = (from: number, to: number, limit: number) => {
        const dx = points[from].x - points[to].x;
        const dy = points[from].y - points[to].y;
        return Math.abs(dy) <= height * .24 && Math.hypot(dx, dy) <= limit;
      };
      const firstLinkDistance = Math.min(170, Math.max(108, width * .2));
      const secondLinkDistance = Math.min(125, Math.max(82, width * .14));
      const displayedFirstByMemory = new Map<string, number>();
      const displayedFirstEdges: VisualEdge[] = [];
      const displayedEdgeKeys = new Set<string>();
      firstEdgeIndexes.forEach((edgeIndex) => {
        const edge = edges[edgeIndex];
        const fromMemoryId = nodes[edge.from].item.id;
        const toMemoryId = nodes[edge.to].item.id;
        const sourceMemoryId = anchorMemoryIds.has(fromMemoryId) ? fromMemoryId : anchorMemoryIds.has(toMemoryId) ? toMemoryId : null;
        if (!sourceMemoryId) return;
        const targetMemoryId = sourceMemoryId === fromMemoryId ? toMemoryId : fromMemoryId;
        const from = displayedAnchorByMemory.get(sourceMemoryId);
        if (from === undefined) return;
        const to = nearestProjection(targetMemoryId, from);
        if (to === null || !isLocalPair(from, to, firstLinkDistance)) return;
        const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
        if (displayedEdgeKeys.has(key)) return;
        displayedEdgeKeys.add(key);
        displayedFirstEdges.push({ from, to });
        displayedFirstByMemory.set(targetMemoryId, to);
      });

      const displayedSecondEdges: VisualEdge[] = [];
      secondEdgeIndexes.forEach((edgeIndex) => {
        const edge = edges[edgeIndex];
        const fromMemoryId = nodes[edge.from].item.id;
        const toMemoryId = nodes[edge.to].item.id;
        const sourceMemoryId = displayedFirstByMemory.has(fromMemoryId) ? fromMemoryId : displayedFirstByMemory.has(toMemoryId) ? toMemoryId : null;
        if (!sourceMemoryId) return;
        const targetMemoryId = sourceMemoryId === fromMemoryId ? toMemoryId : fromMemoryId;
        if (anchorMemoryIds.has(targetMemoryId)) return;
        const from = displayedFirstByMemory.get(sourceMemoryId);
        if (from === undefined) return;
        const to = nearestProjection(targetMemoryId, from);
        if (to === null || !isLocalPair(from, to, secondLinkDistance)) return;
        const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
        if (displayedEdgeKeys.has(key)) return;
        displayedEdgeKeys.add(key);
        displayedSecondEdges.push({ from, to });
      });

      const primaryActiveNodeIndices = new Set(rawAnchors);
      displayedFirstEdges.forEach((edge) => {
        primaryActiveNodeIndices.add(edge.from);
        primaryActiveNodeIndices.add(edge.to);
      });
      interactionNodeIndices.forEach((index) => primaryActiveNodeIndices.add(index));
      const secondaryNodeIndices = new Set<number>();
      displayedSecondEdges.forEach((edge) => {
        secondaryNodeIndices.add(edge.from);
        secondaryNodeIndices.add(edge.to);
      });
      primaryActiveNodeIndices.forEach((index) => secondaryNodeIndices.delete(index));
      const activeNodeIndices = new Set([...primaryActiveNodeIndices, ...secondaryNodeIndices]);
      const lockFeedback = lockedIndex !== undefined
        ? selectionFeedbacks.slice().reverse().find((feedback) => feedback.index === lockedIndex && feedback.kind === "lock")
        : undefined;
      const lockProgress = lockFeedback
        ? easeOutCubic(Math.min(1, Math.max(0, (now - lockFeedback.startedAt) / 180)))
        : 1;

      traces.forEach((trace) => {
        const traceLengthWorld = trace.length * height;
        const span = worldHeight + traceLengthWorld;
        const rawWorldY = (trace.y - .5) * worldHeight - (reduceMotion ? 0 : now * trace.speed);
        const worldY = ((rawWorldY + worldHeight / 2 + traceLengthWorld) % span + span) % span - traceLengthWorld - worldHeight / 2;
        const x = (trace.x - .5) * worldWidth * scale + width / 2 + panX;
        const y = worldY * scale + height / 2 + panY;
        const length = traceLengthWorld * scale;
        if (x < -3 || x > width + 3 || y > height + length + 3 || y + length < -3) return;
        const gradient = context.createLinearGradient(x, y, x, y + length);
        gradient.addColorStop(0, `rgba(${palette.signal},${trace.alpha})`);
        gradient.addColorStop(.55, `rgba(${palette.signal},${trace.alpha * .5})`);
        gradient.addColorStop(1, `rgba(${palette.signal},0)`);
        context.strokeStyle = gradient;
        context.lineWidth = trace.alpha > .23 ? 1.1 : .78;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + length);
        context.stroke();
        context.fillStyle = `rgba(${palette.signal},${Math.min(.46, trace.alpha * 1.4)})`;
        context.fillRect(x - .5, y - 1, 1, 2);
      });

      if (interactionCenter) {
        displayedSecondEdges.forEach((edge) => {
          const from = points[edge.from];
          const to = points[edge.to];
          context.strokeStyle = `rgba(${palette.signal},${.07 * lockProgress})`;
          context.lineWidth = .45;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        });
        displayedFirstEdges.forEach((edge) => {
          const from = points[edge.from];
          const to = points[edge.to];
          context.strokeStyle = `rgba(${palette.signal},${.28 * lockProgress})`;
          context.lineWidth = .55;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        });
        interactionEntries.forEach(({ index, distance }) => {
          const point = points[index];
          if (distance < 1) return;
          context.strokeStyle = `rgba(${palette.signal},${.5 * (1 - distance / INTERACTION_RADIUS) * lockProgress})`;
          context.lineWidth = .5;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(interactionCenter.x, interactionCenter.y);
          context.stroke();
        });
      }

      let visibleNodeCount = 0;
      nodes.forEach((node, index) => {
        const isActive = activeNodeIndices.has(index);
        const isSecondary = secondaryNodeIndices.has(index);
        if (!reduceMotion && now >= node.nextMutation) {
          const random = seededUnit(hashText(`${node.item.id}:${node.projection}:${Math.floor(now / 8)}`));
          node.glyph = GLYPHS[Math.floor(random() * GLYPHS.length)];
          node.nextMutation = now + (isActive ? 1 : 420 + random() * 780);
        }
        const point = points[index];
        if (point.x < -24 || point.x > width + 24 || point.y < -24 || point.y > height + 24) return;
        visibleNodeCount += 1;
        const isCore = layerOf(node.item) === "core";
        const fontSize = ((isCore ? 12 : 9.75) + node.depth * 1.55) * Math.min(2.1, Math.max(.46, scale));
        context.font = `${isCore ? 500 : 400} ${fontSize}px "SFMono-Regular", Menlo, Consolas, monospace`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = isSecondary
          ? `rgba(${palette.signal},.4)`
          : isActive
          ? `rgba(${palette.active},.98)`
          : `rgba(${palette.node},${node.item.status === "archived" ? .19 : .28 + node.depth * .17})`;
        context.fillText(node.glyph, point.x, point.y);
      });
      if (visibleNodeCount !== lastVisibleNodeCount && constellationElement) {
        lastVisibleNodeCount = visibleNodeCount;
        constellationElement.dataset.visibleNodeCount = String(visibleNodeCount);
      }
      if (zoomElement) zoomElement.textContent = `${scale.toFixed(2)}×`;

      selectionFeedbacks = selectionFeedbacks.filter((feedback) => {
        const duration = feedback.kind === "lock" ? 180 : 160;
        const elapsed = now - feedback.startedAt;
        if (elapsed >= duration) return false;
        const progress = reduceMotion ? 1 : easeOutCubic(Math.min(1, Math.max(0, elapsed / duration)));
        const point = points[feedback.index];
        if (!point || point.x < -30 || point.x > width + 30 || point.y < -30 || point.y > height + 30) return true;
        const distance = feedback.kind === "lock" ? 16 - progress * 7 : 9 + progress * 8;
        const arm = feedback.kind === "lock" ? 4.5 + progress * 1.5 : 6 - progress * 1.5;
        const alpha = feedback.kind === "lock" ? 1 - progress * .18 : 1 - progress;
        context.strokeStyle = `rgba(${palette.active},${alpha})`;
        context.lineWidth = feedback.kind === "lock" ? 1 : .75;
        context.beginPath();
        context.moveTo(point.x - distance, point.y - distance + arm);
        context.lineTo(point.x - distance, point.y - distance);
        context.lineTo(point.x - distance + arm, point.y - distance);
        context.moveTo(point.x + distance - arm, point.y - distance);
        context.lineTo(point.x + distance, point.y - distance);
        context.lineTo(point.x + distance, point.y - distance + arm);
        context.moveTo(point.x + distance, point.y + distance - arm);
        context.lineTo(point.x + distance, point.y + distance);
        context.lineTo(point.x + distance - arm, point.y + distance);
        context.moveTo(point.x - distance + arm, point.y + distance);
        context.lineTo(point.x - distance, point.y + distance);
        context.lineTo(point.x - distance, point.y + distance - arm);
        context.stroke();
        return true;
      });

      frameCount += 1;
      if (now - fpsAt > 500) {
        fps = Math.round(frameCount * 1000 / (now - fpsAt));
        frameCount = 0;
        fpsAt = now;
        if (fpsElement) fpsElement.textContent = String(Math.min(120, Math.max(1, fps)));
      }
    };

    const loop = (now: number) => {
      if (active && (!coarsePointer || now - lastFrame >= 32)) {
        draw(now);
        lastFrame = now;
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      worldWidth = width * worldScale;
      worldHeight = height * worldScale;
      dpr = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const nearest = (clientX: number, clientY: number) => {
      const bounds = canvas.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      const candidate = nearestIndicesAt(x, y, 1, performance.now()).find((entry) => nodes[entry.index].interactive);
      return candidate && candidate.distance <= (coarsePointer ? 38 : 26) ? candidate.index : null;
    };

    const localPoint = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    const pinchMetrics = () => {
      const [first, second] = [...touchPointers.values()];
      if (!first || !second) return null;
      return {
        centroidX: (first.x + second.x) / 2,
        centroidY: (first.y + second.y) / 2,
        distance: Math.max(12, Math.hypot(second.x - first.x, second.y - first.y)),
      };
    };

    const beginPinch = () => {
      const metrics = pinchMetrics();
      if (!metrics) return;
      pinch = { ...metrics, scale, panX, panY };
      pointer = null;
      if (drag) drag.moved = true;
    };

    const toggleSelectionAt = (clientX: number, clientY: number) => {
      const index = nearest(clientX, clientY);
      if (index !== null) {
        if (lockedNodeIndexRef.current === index) {
          selectionFeedbacks.push({ index, kind: "release", startedAt: performance.now() });
          lockedNodeIndexRef.current = null;
          selectedIdRef.current = null;
          setSelected(null);
        } else {
          selectionFeedbacks.push({ index, kind: "lock", startedAt: performance.now() });
          lockedNodeIndexRef.current = index;
          selectedIdRef.current = nodes[index].item.id;
          setSelected(nodes[index].item);
        }
        return;
      }
      if (lockedNodeIndexRef.current !== null) {
        selectionFeedbacks.push({ index: lockedNodeIndexRef.current, kind: "release", startedAt: performance.now() });
      }
      lockedNodeIndexRef.current = null;
      selectedIdRef.current = null;
      setSelected(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        const point = localPoint(event);
        touchPointers.set(event.pointerId, point);
        if (touchPointers.size === 1) {
          pointer = point;
          drag = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
        } else if (touchPointers.size === 2) {
          beginPinch();
        }
        return;
      }
      drag = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event);
      if (touchPointers.has(event.pointerId)) {
        touchPointers.set(event.pointerId, point);
        if (touchPointers.size >= 2) {
          if (!pinch) beginPinch();
          const metrics = pinchMetrics();
          if (!pinch || !metrics) return;
          const contentX = (pinch.centroidX - width / 2 - pinch.panX) / pinch.scale;
          const contentY = (pinch.centroidY - height / 2 - pinch.panY) / pinch.scale;
          scale = clampScale(pinch.scale * metrics.distance / pinch.distance);
          panX = metrics.centroidX - width / 2 - contentX * scale;
          panY = metrics.centroidY - height / 2 - contentY * scale;
          clampPan();
          pointer = null;
          if (drag) drag.moved = true;
          return;
        }
        pointer = point;
        if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
        return;
      }
      pointer = point;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      panX = drag.panX + dx;
      panY = drag.panY + dy;
      clampPan();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (touchPointers.has(event.pointerId)) {
        const wasPinching = touchPointers.size >= 2 || pinch !== null;
        touchPointers.delete(event.pointerId);
        if (!wasPinching && drag && !drag.moved) {
          toggleSelectionAt(event.clientX, event.clientY);
        }
        pinch = null;
        const remaining = [...touchPointers.values()][0] || null;
        pointer = remaining;
        drag = remaining
          ? { x: remaining.x + canvas.getBoundingClientRect().left, y: remaining.y + canvas.getBoundingClientRect().top, panX, panY, moved: true }
          : null;
        return;
      }
      if (drag && !drag.moved) {
        toggleSelectionAt(event.clientX, event.clientY);
      }
      drag = null;
    };
    const onPointerCancel = (event: PointerEvent) => {
      touchPointers.delete(event.pointerId);
      if (touchPointers.size < 2) pinch = null;
      pointer = [...touchPointers.values()][0] || null;
      if (touchPointers.size === 0) drag = null;
    };
    const onPointerLeave = () => {
      if (touchPointers.size > 0) return;
      pointer = null;
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      zoomAround(scale + (event.deltaY < 0 ? .12 : -.12), event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const onControl = (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "reset") {
        scale = 1;
        panX = 0;
        panY = 0;
      } else {
        const nextScale = clampScale(scale + (button.dataset.action === "in" ? .22 : -.22));
        zoomAround(nextScale, width / 2, height / 2);
        if (button.dataset.action === "out" && scale <= minimumScale + .001) {
          panX = 0;
          panY = 0;
        }
      }
    };
    const onVisibility = () => { active = !document.hidden; };

    const observer = new IntersectionObserver(([entry]) => { active = entry.isIntersecting && !document.hidden; }, { threshold: .01 });
    const resizeObserver = new ResizeObserver(resize);
    const shell = canvas.closest(".app-shell");
    const paletteObserver = new MutationObserver(() => {
      palette = readPalette();
      draw(performance.now());
    });
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    if (shell) paletteObserver.observe(shell, { attributes: true, attributeFilter: ["data-theme", "data-mode", "data-layout"] });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.parentElement?.querySelector("[data-controls]")?.addEventListener("click", onControl);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      resizeObserver.disconnect();
      paletteObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.parentElement?.querySelector("[data-controls]")?.removeEventListener("click", onControl);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [graph]);

  const selectMemory = (item: ConstellationMemory) => {
    lockedNodeIndexRef.current = null;
    selectedIdRef.current = item.id;
    setSelected(item);
  };

  const clearSelection = () => {
    lockedNodeIndexRef.current = null;
    selectedIdRef.current = null;
    setSelected(null);
  };

  return (
    <section className="memory-constellation-section">
      <div
        className="memory-constellation"
        aria-label={items.length ? `真实记忆星图，${items.length} 条记忆映射为 ${graph.nodes.length} 个字符` : `空记忆星图，${graph.nodes.length} 个不可点的视觉字符`}
        data-memory-count={items.length}
        data-visual-node-count={graph.nodes.length}
        data-world-scale={graph.worldScale.toFixed(3)}
        data-visible-node-count="0"
      >
        <canvas ref={canvasRef} />
        <div className="memory-constellation-fps" aria-hidden="true"><span data-fps>60</span> FPS <i data-zoom>1.00×</i></div>
        <div className="memory-constellation-controls" data-controls aria-label="星图视图控制">
          <button type="button" data-action="out" aria-label="缩小星图，查看更大范围"><Minus size={15} /></button>
          <button type="button" data-action="in" aria-label="放大星图，查看局部"><Plus size={15} /></button>
          <button type="button" data-action="reset" aria-label="回到局部默认视图"><RotateCcw size={14} /></button>
        </div>
      </div>
      {selected && (
        <article className="memory-constellation-detail" aria-live="polite">
          <header>
            <div>
              <small>{layerOf(selected) === "core" ? "L3 CORE" : layerOf(selected) === "semantic" ? "L2 LONG TERM" : selected.status === "archived" ? "ARCHIVE" : "L1 NEAR FIELD"}</small>
              <h3>{selected.title || selected.content.slice(0, 34)}</h3>
            </div>
            <button type="button" onClick={clearSelection} aria-label="收起记忆详情"><X size={16} /></button>
          </header>
          <p>{selected.content}</p>
          {selected.tags.length > 0 && <div className="memory-constellation-detail-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          {related.length > 0 && (
            <section className="memory-constellation-related" aria-label="相关记忆">
              <b><Link2 size={14} />相关记忆</b>
              <div>{related.map(({ item, labels }) => (
                <button type="button" key={item.id} onClick={() => selectMemory(item)}>
                  <strong>{item.title || item.content.slice(0, 24)}</strong>
                  <small>{[...labels].join(" · ")}</small>
                </button>
              ))}</div>
            </section>
          )}
          <footer><button type="button" onClick={() => onEdit(selected.id)}><Pencil size={14} />编辑这条记忆</button></footer>
        </article>
      )}
    </section>
  );
}
