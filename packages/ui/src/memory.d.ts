import type { MemoryItem } from "@fuyue/core";
import type { ComponentType, ReactNode } from "react";
export interface MemoryLedgerProps { memories: MemoryItem[]; labels?: Partial<Record<MemoryItem["layer"], string>>; empty?: ReactNode; onToggle?: (memory: MemoryItem) => void; onOpen?: (memory: MemoryItem) => void }
export const MemoryLedger: ComponentType<MemoryLedgerProps>;
export interface MemoryMapProps { memories: MemoryItem[]; selectedId?: string; onSelect?: (memory: MemoryItem) => void; empty?: ReactNode }
export const MemoryMap: ComponentType<MemoryMapProps>;
export function visualNodeCountForMemoryCount(memoryCount: number): number;
export function worldDimensionScaleForVisualNodeCount(visualNodeCount: number): number;
export function wrapWorldY(normalizedY: number, travel: number, worldHeight: number): number;
