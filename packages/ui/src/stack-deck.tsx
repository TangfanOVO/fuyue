import { ArrowRight } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

export interface StackDeckItem {
  id: string;
  icon: ReactNode;
  title: string;
  note: string;
  onOpen: () => void;
}

export interface StackDeckProps {
  title?: string;
  items: StackDeckItem[];
  className?: string;
}

const rotations = [-1.8, 1.4, -1.1, 1.7, -1.4, 1, -.8];
const shifts = [-2, 4, -1, 3, -3, 2, 0];

export function StackDeck({ title, items, className = "" }: StackDeckProps) {
  const [selected, setSelected] = useState("");
  useEffect(() => { if (selected && !items.some((item) => item.id === selected)) setSelected(""); }, [items, selected]);
  return <section className={`portal-group ${className}`.trim()}>{title ? <h2>{title}</h2> : null}<div className="portal-deck" style={{ height: `${90 + Math.max(0, items.length - 1) * 56}px` }}>{items.map((item, index) => {
    const active = item.id === selected;
    return <button
      key={item.id}
      className={active ? "portal-card selected" : "portal-card"}
      style={{ "--deck-offset": `${index * 56}px`, "--deck-rotate": `${rotations[index % rotations.length]}deg`, "--deck-shift": `${shifts[index % shifts.length]}px`, "--deck-z": items.length - index } as CSSProperties}
      aria-pressed={active}
      aria-label={`${item.title}，${active ? "已浮起，再点进入" : "点一下在原位浮起"}`}
      onClick={() => active ? item.onOpen() : setSelected(item.id)}
    ><span className="portal-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.note}</small></span><em>{active ? "再点进入" : "轻点浮起"}</em><ArrowRight /></button>;
  })}</div></section>;
}
