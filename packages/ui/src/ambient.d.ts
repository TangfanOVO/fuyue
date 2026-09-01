import type { ComponentType } from "react";
export type LineEffect = "none" | "snow" | "rain" | "heart" | "leaf" | "butterfly" | "star" | "bubble" | "glow" | "paw";
export const LineEffectGlyph: ComponentType<{ effect: LineEffect }>;
export const AmbientLines: ComponentType<{ effect?: LineEffect; effects?: readonly LineEffect[]; density: number; speed: number; theme: string }>;
