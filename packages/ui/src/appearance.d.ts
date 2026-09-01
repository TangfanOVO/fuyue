import type { AppearanceSettings, LineEffect, ShellLayout, ThemeName } from "@fuyue/core";
export * from "@fuyue/core";
export declare const defaultAppearance: AppearanceSettings;
export declare const themeRegistry: readonly { id: ThemeName; name: string; note: string; colors: readonly string[] }[];
export declare const shellRegistry: readonly { id: ShellLayout; name: string; note: string }[];
export declare const lineEffectRegistry: readonly { id: LineEffect; name: string; darkOnly?: boolean }[];
export declare function normalizeAppearance(value: Partial<AppearanceSettings>): AppearanceSettings;
export declare function toggleLineEffectSelection(value: AppearanceSettings, effect: LineEffect): AppearanceSettings;
