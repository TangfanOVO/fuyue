import type { ComponentType, ReactNode } from "react";
export interface StackDeckItem { id: string; icon: ReactNode; title: string; note: string; onOpen: () => void }
export interface StackDeckProps { title: string; items: StackDeckItem[]; className?: string }
export const StackDeck: ComponentType<StackDeckProps>;
