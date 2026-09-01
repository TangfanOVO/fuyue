export type ThemeName = "redleaf" | "blue" | "sakura" | "wisteria" | "tide" | "amber";
export type AppearanceMode = "light" | "dark";
export type LineEffect = "none" | "snow" | "rain" | "heart" | "leaf" | "butterfly" | "star" | "bubble" | "glow" | "paw";
export type ShellLayout = "paper" | "client" | "official";
export interface AppearanceSettings { theme: ThemeName; mode: AppearanceMode; effect: LineEffect; effects: LineEffect[]; density: number; speed: number; layout: ShellLayout }
export declare const defaultAppearance: AppearanceSettings;
export declare const themeRegistry: readonly { id: ThemeName; name: string; note: string; colors: readonly string[] }[];
export declare const shellRegistry: readonly { id: ShellLayout; name: string; note: string }[];
export declare const lineEffectRegistry: readonly { id: LineEffect; name: string; darkOnly?: boolean }[];
export declare function normalizeAppearance(value: Partial<AppearanceSettings>): AppearanceSettings;
export declare function toggleLineEffectSelection(value: AppearanceSettings, effect: LineEffect): AppearanceSettings;
