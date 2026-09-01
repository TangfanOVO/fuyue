import type { AppearanceMode, AppearanceSettings, LineEffect, ShellLayout, ThemeName } from "@fuyue/core";
export type { AppearanceMode, AppearanceSettings, LineEffect, ShellLayout, ThemeName } from "@fuyue/core";

export const defaultAppearance: AppearanceSettings = { theme: "redleaf", mode: "light", effect: "leaf", effects: ["leaf"], density: 2, speed: 2, layout: "paper" };
export const themeRegistry: readonly { id: ThemeName; name: string; note: string; colors: readonly string[] }[] = [
  { id: "redleaf", name: "红叶纸", note: "温暖、安静", colors: ["#f2ede3", "#7a3437", "#d8c6b3"] },
  { id: "blue", name: "晴空蓝", note: "澄蓝、轻亮", colors: ["#f5f8fc", "#4d73a3", "#dce8f4"] },
  { id: "sakura", name: "樱雾粉", note: "旧粉、柔和", colors: ["#faf5f4", "#8d5b66", "#eadadd"] },
  { id: "wisteria", name: "紫藤暮", note: "灰紫、安静", colors: ["#f7f5f7", "#6e6179", "#e4dfe7"] },
  { id: "tide", name: "潮汐青", note: "海盐、透气", colors: ["#f3f7f5", "#466f68", "#d9e7e2"] },
  { id: "amber", name: "蜜糖琥珀", note: "茶金、松软", colors: ["#faf6ee", "#866239", "#eadfc9"] },
];
export const shellRegistry: readonly { id: ShellLayout; name: string; note: string }[] = [
  { id: "paper", name: "赴约纸页", note: "柔软纸感" }, { id: "client", name: "客户端简洁", note: "更紧凑的聊天" }, { id: "official", name: "黑白版", note: "留下家里的素净版" },
];
export const lineEffectRegistry: readonly { id: LineEffect; name: string; darkOnly?: boolean }[] = [
  { id: "none", name: "不飘" }, { id: "snow", name: "下雪" }, { id: "rain", name: "下雨" }, { id: "heart", name: "爱心" }, { id: "leaf", name: "树叶" }, { id: "butterfly", name: "蝴蝶" }, { id: "star", name: "星屑 · 夜", darkOnly: true }, { id: "glow", name: "萤火微光 · 夜", darkOnly: true }, { id: "bubble", name: "泡泡" }, { id: "paw", name: "猫爪脚印" },
];
export function normalizeAppearance(value: Partial<AppearanceSettings>): AppearanceSettings {
  const legacyTheme = String(value.theme || ""); const legacyEffect = String(value.effect || "");
  const candidateEffect = ["petal", "feather", "origami"].includes(legacyEffect) ? "leaf" : value.effect;
  const fallbackEffect = lineEffectRegistry.some((item) => item.id === candidateEffect) ? candidateEffect as LineEffect : defaultAppearance.effect;
  const suppliedEffects = Array.isArray(value.effects) ? value.effects : [fallbackEffect];
  const effects = suppliedEffects.includes("none") ? [] : [...new Set(suppliedEffects.filter((effect): effect is LineEffect => effect !== "none" && lineEffectRegistry.some((item) => item.id === effect)))];
  const effect = effects[0] ?? "none";
  return { theme: themeRegistry.some((item) => item.id === value.theme) ? value.theme as ThemeName : defaultAppearance.theme, mode: value.mode === "dark" || legacyTheme === "night" ? "dark" : "light", effect, effects, density: Math.max(1, Math.min(5, Math.round(Number(value.density) || defaultAppearance.density))), speed: Math.max(1, Math.min(5, Math.round(Number(value.speed) || defaultAppearance.speed))), layout: shellRegistry.some((item) => item.id === value.layout) ? value.layout as ShellLayout : defaultAppearance.layout };
}

export function toggleLineEffectSelection(value: AppearanceSettings, effect: LineEffect): AppearanceSettings {
  if (effect === "none") return { ...value, effect: "none", effects: [] };
  const effects = value.effects.includes(effect) ? value.effects.filter((item) => item !== effect) : [...value.effects, effect];
  return { ...value, effect: effects[0] ?? "none", effects };
}
