import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { analyzeKaomoji, decodeKaomojiState, hydrateKaomojiState, normalizeKaomoji, normalizeKaomojiCategories, normalizeKaomojiCategoryOrder } from "./repository.js";
import type { StoredKaomojiState } from "./repository.js";
import type { KaomojiCatalogEntry, KaomojiItem, KaomojiRepository } from "./types.js";

export function defaultKaomojiPath() {
  return resolve(process.env.FUYUE_KAOMOJI_PATH || resolve(homedir(), ".fuyue-kaomoji", "kaomoji.json"));
}

export function createFileKaomojiRepository(filePath = defaultKaomojiPath()): KaomojiRepository {
  const path = resolve(filePath);
  let writeQueue = Promise.resolve();

  const readState = async (): Promise<StoredKaomojiState> => {
    try {
      return hydrateKaomojiState(decodeKaomojiState(JSON.parse(await readFile(path, "utf8"))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return hydrateKaomojiState(decodeKaomojiState(null));
      throw error;
    }
  };

  const write = async (state: StoredKaomojiState) => {
    writeQueue = writeQueue.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    });
    await writeQueue;
  };

  return {
    async list() {
      return [...(await readState()).items].sort((a, b) =>
        Number(b.favorite) - Number(a.favorite)
        || b.useCount - a.useCount
        || ({ stable: 0, limited: 1, blocked: 2 }[a.compatibility] - { stable: 0, limited: 1, blocked: 2 }[b.compatibility]),
      );
    },
    async upsert(value, categories, label) {
      const cleanCategories = normalizeKaomojiCategories(categories);
      const analysis = analyzeKaomoji(value, cleanCategories);
      if (!analysis.value) throw new TypeError("Kaomoji must contain a visible character after normalization.");
      const state = await readState();
      const previous = state.items.find((item) => item.value === analysis.value);
      const saved: KaomojiItem = {
        ...analysis,
        label: label?.trim() || previous?.label,
        categories: cleanCategories,
        favorite: previous?.favorite ?? false,
        useCount: previous?.useCount ?? 0,
        lastUsedAt: previous?.lastUsedAt,
      };
      await write({ ...state, items: [saved, ...state.items.filter((item) => item.value !== saved.value)], removed: state.removed.filter((item) => item !== saved.value) });
      return saved;
    },
    async remove(value) {
      const state = await readState();
      const clean = normalizeKaomoji(value);
      if (!clean || !state.items.some((item) => item.value === clean)) return false;
      await write({ ...state, items: state.items.filter((item) => item.value !== clean), removed: [...new Set([...state.removed, clean])] });
      return true;
    },
    async markUsed(value) {
      const state = await readState();
      const clean = normalizeKaomoji(value);
      await write({ ...state, items: state.items.map((item) => item.value === clean ? { ...item, useCount: item.useCount + 1, lastUsedAt: new Date().toISOString() } : item) });
    },
    async setFavorite(value, favorite) {
      const state = await readState();
      const clean = normalizeKaomoji(value);
      await write({ ...state, items: state.items.map((item) => item.value === clean ? { ...item, favorite } : item) });
    },
    async getCategoryOrder() {
      return (await readState()).categoryOrder;
    },
    async setCategoryOrder(categories) {
      const state = await readState();
      await write({ ...state, categoryOrder: normalizeKaomojiCategoryOrder(categories) });
    },
    async mergeCatalog(entries: KaomojiCatalogEntry[]) {
      const state = await readState();
      const removed = new Set(state.removed.map(normalizeKaomoji));
      const existing = new Set(state.items.map((item) => normalizeKaomoji(item.value)));
      const additions: KaomojiItem[] = [];
      for (const entry of entries) {
        const value = normalizeKaomoji(entry.value);
        if (!value || removed.has(value) || existing.has(value)) continue;
        const categories = normalizeKaomojiCategories(entry.categories);
        additions.push({
          ...analyzeKaomoji(value, categories),
          label: entry.label?.trim() || undefined,
          categories,
          favorite: false,
          useCount: 0,
        });
        existing.add(value);
      }
      if (additions.length) await write({ ...state, items: [...additions, ...state.items] });
      return { added: additions.length, skipped: entries.length - additions.length };
    },
  };
}
