import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { analyzeKaomoji, normalizeKaomoji } from "./repository.js";
import { createFileKaomojiRepository, defaultKaomojiPath } from "./file-repository.js";
import { selectDiverseKaomoji } from "./selection.js";
import type { KaomojiVariety } from "./selection.js";
import type { KaomojiItem, KaomojiRepository } from "./types.js";

const packageVersion = String(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function score(item: KaomojiItem, query: string, category?: string) {
  const needle = query.toLocaleLowerCase();
  const haystack = [item.value, item.label, ...item.categories].filter(Boolean).join(" ").toLocaleLowerCase();
  const matched = !needle || haystack.includes(needle);
  const categoryMatched = !category || item.categories.includes(category);
  if (!matched || !categoryMatched || item.compatibility === "blocked") return Number.NEGATIVE_INFINITY;
  return Number(item.favorite) * 100 + Math.log1p(Math.max(0, item.useCount)) * 4 + (item.compatibility === "stable" ? 10 : 0);
}

async function search(repository: KaomojiRepository, query = "", category?: string, limit = 12) {
  return (await repository.list())
    .map((item) => ({ item, score: score(item, query.trim(), category?.trim()) }))
    .filter(({ score: value }) => Number.isFinite(value))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map(({ item }) => item);
}

export type BuildKaomojiMcpOptions = {
  repository?: KaomojiRepository;
  filePath?: string;
};

export function buildKaomojiMcpServer(options: BuildKaomojiMcpOptions = {}) {
  const repository = options.repository ?? createFileKaomojiRepository(options.filePath);
  const server = new McpServer({ name: "fuyue-kaomoji", version: packageVersion });
  const recentPicks: string[] = [];

  server.registerTool("kaomoji_search", {
    title: "Search kaomoji",
    description: "Search the local kaomoji library by visible face, label, or category. Results are ranked by favourite and hidden usage frequency.",
    inputSchema: {
      query: z.string().optional().describe("Mood, label, category, or literal kaomoji fragment"),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(12),
    },
  }, async ({ query, category, limit }) => textResult({ items: await search(repository, query, category, limit) }));

  server.registerTool("kaomoji_pick", {
    title: "Pick and use a kaomoji",
    description: "Choose from the best matching kaomoji while avoiding immediate repetition, increment its private usage count, and return it for inclusion in the assistant response.",
    inputSchema: {
      query: z.string().optional().describe("Mood, label, category, or literal kaomoji fragment"),
      category: z.string().optional(),
      variety: z.enum(["steady", "balanced", "fresh"]).default("balanced").describe("How widely to rotate among good matches"),
    },
  }, async ({ query, category, variety }) => {
    const candidates = await search(repository, query, category, 10);
    const picked = selectDiverseKaomoji(candidates, recentPicks, variety as KaomojiVariety);
    if (!picked) return textResult({ found: false, message: "No matching kaomoji." });
    await repository.markUsed(picked.value);
    recentPicks.unshift(picked.value);
    recentPicks.splice(6);
    return textResult({ found: true, item: { ...picked, useCount: picked.useCount + 1, lastUsedAt: new Date().toISOString() } });
  });

  server.registerTool("kaomoji_add", {
    title: "Add or update kaomoji",
    description: "Add one or up to 200 kaomoji to the private local library, merge duplicate values, and classify each into one or more categories.",
    inputSchema: {
      value: z.string().min(1).max(300).refine((value) => Boolean(normalizeKaomoji(value)), "Kaomoji must contain a visible character.").optional(),
      categories: z.array(z.string().min(1).max(40)).min(1).max(8).optional(),
      label: z.string().max(80).optional(),
      items: z.array(z.object({
        value: z.string().min(1).max(300).refine((value) => Boolean(normalizeKaomoji(value)), "Kaomoji must contain a visible character."),
        categories: z.array(z.string().min(1).max(40)).min(1).max(8),
        label: z.string().max(80).optional(),
      })).min(1).max(200).optional(),
    },
  }, async ({ value, categories, label, items }) => {
    const pending = items ?? (value && categories ? [{ value, categories, label }] : []);
    if (!pending.length) throw new TypeError("Provide value with categories, or a non-empty items array.");
    const saved = [];
    const seen = new Set<string>();
    for (const item of pending) {
      const clean = normalizeKaomoji(item.value);
      if (seen.has(clean)) continue;
      seen.add(clean);
      saved.push(await repository.upsert(clean, item.categories, item.label));
    }
    if (!items) return textResult({ item: saved[0] });
    const categoryCounts: Record<string, number> = {};
    for (const item of saved) for (const category of item.categories) categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    return textResult({ savedCount: saved.length, categoryCounts, examples: saved.slice(0, 12) });
  });

  server.registerTool("kaomoji_remove", {
    title: "Remove a kaomoji",
    description: "Delete an exact kaomoji value from the private local library.",
    inputSchema: { value: z.string().min(1).max(300) },
  }, async ({ value }) => {
    const clean = analyzeKaomoji(value).value;
    const removed = await repository.remove(value);
    return textResult({ removed, value: clean, ...(!removed ? { reason: "not_found" } : {}) });
  });

  server.registerTool("kaomoji_favorite", {
    title: "Favourite or unfavourite a kaomoji",
    description: "Change whether an exact kaomoji value is ranked as a favourite.",
    inputSchema: { value: z.string().min(1).max(300), favorite: z.boolean() },
  }, async ({ value, favorite }) => {
    await repository.setFavorite(value, favorite);
    return textResult({ value: analyzeKaomoji(value).value, favorite });
  });

  server.registerTool("kaomoji_inspect", {
    title: "Inspect kaomoji compatibility",
    description: "Check a kaomoji for transport controls, stacked combining marks, rare glyphs, and an optional safer copy without saving it.",
    inputSchema: { value: z.string().min(1).max(300) },
  }, async ({ value }) => textResult(analyzeKaomoji(value)));

  server.registerResource("kaomoji-library", "kaomoji://library", {
    title: "Local kaomoji library",
    description: "Private local kaomoji library without a public usage dashboard.",
    mimeType: "application/json",
  }, async () => ({
    contents: [{
      uri: "kaomoji://library",
      mimeType: "application/json",
      text: JSON.stringify({ storagePath: options.filePath ?? defaultKaomojiPath(), items: await repository.list() }, null, 2),
    }],
  }));

  return server;
}
