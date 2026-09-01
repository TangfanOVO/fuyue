import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createFileKaomojiRepository } from "../dist/file-repository.js";
import { analyzeKaomoji, createLocalKaomojiRepository, defaultKaomojiItems, initialKaomojiRenderLimit, normalizeKaomoji, normalizeKaomojiCategories, rankKaomojiCategories, readKaomojiCatalogSyncState, selectDiverseKaomoji, shouldAutomaticallySync, splitKaomojiCategories, syncKaomojiCatalog, writeKaomojiCatalogSyncState } from "../dist/index.js";

test("installs from GitHub without requiring a local TypeScript compiler", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts?.prepare, undefined);
  assert.ok(packageJson.files.includes("dist"));
  assert.ok(packageJson.files.includes("examples"));
});

test("ships a self-contained plain HTML entry and bounds the initial render", async () => {
  const bundle = await readFile(new URL("../dist/standalone.js", import.meta.url), "utf8");
  const example = await readFile(new URL("../examples/standalone.html", import.meta.url), "utf8");
  assert.match(bundle, /FuyueKaomoji/);
  assert.ok(bundle.length > 100_000);
  assert.match(example, /FuyueKaomoji\.mount/);
  assert.equal(initialKaomojiRenderLimit, 96);
});

test("normalizes transport-only controls without changing the visible face", () => {
  assert.equal(normalizeKaomoji("\u200e( ´▽｀)\ufeff"), "( ´▽｀)");
});

test("flags stacked marks and keeps a stable-copy option", () => {
  const result = analyzeKaomoji("a\u0301\u0302\u0303");
  assert.equal(result.compatibility, "limited");
  assert.ok(result.compatibilityNotes.some((note) => note.includes("黑条")));
  assert.equal(result.safeValue, "a");
});

test("splits multiple categories with English and Chinese punctuation", () => {
  assert.deepEqual(splitKaomojiCategories("傲娇, 猫猫，开心、可爱/害羞"), ["傲娇", "猫猫", "开心", "可爱", "害羞"]);
});

test("merges legacy English labels into the Chinese taxonomy", () => {
  assert.deepEqual(normalizeKaomojiCategories(["shy", "害羞", "studying", "happy"]), ["害羞", "学习", "开心"]);
  assert.deepEqual(normalizeKaomojiCategories(["ascii_art", "ASCII Art", "字符画"]), ["字符画"]);
});

test("treats line breaks as authored structure for explicit ASCII art", () => {
  const value = " /\\_/\\\n( o.o )\n > ^ <";
  assert.equal(analyzeKaomoji(value, ["ascii_art"]).compatibility, "stable");
});

test("orders category tabs by private usage before fallback taxonomy", () => {
  const items = [
    { value: "a", categories: ["丑陋"], favorite: false, useCount: 0, compatibility: "stable", compatibilityNotes: [] },
    { value: "b", categories: ["猫猫"], favorite: false, useCount: 3, compatibility: "stable", compatibilityNotes: [] },
    { value: "c", categories: ["可爱"], favorite: false, useCount: 0, compatibility: "stable", compatibilityNotes: [] },
  ];
  assert.deepEqual(rankKaomojiCategories(items), ["猫猫", "可爱", "丑陋"]);
  assert.deepEqual(rankKaomojiCategories(items, ["丑陋", "猫猫"]), ["丑陋", "猫猫", "可爱"]);
});

test("rotates AI picks away from the immediately repeated face", () => {
  const items = [
    { value: "a", categories: ["开心"], favorite: true, useCount: 20, compatibility: "stable", compatibilityNotes: [] },
    { value: "b", categories: ["开心"], favorite: false, useCount: 2, compatibility: "stable", compatibilityNotes: [] },
  ];
  assert.equal(selectDiverseKaomoji(items, ["a"], "balanced", () => 0)?.value, "b");
});

test("stores categories, favourites and hidden usage ranking locally", async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const repository = createLocalKaomojiRepository("test.drawer");
  await repository.upsert("(test-a)", ["猫猫", "开心"]);
  await repository.upsert("(test-b)", ["兔兔"]);
  await repository.markUsed("(test-b)");
  await repository.setFavorite("(test-a)", true);
  const items = await repository.list();
  assert.notEqual(items, await repository.list());
  assert.equal(items[0].value, "(test-a)");
  assert.deepEqual(items[0].categories, ["猫猫", "开心"]);
  assert.equal(items.find((item) => item.value === "(test-b)")?.useCount, 1);
  await repository.setCategoryOrder?.(["兔兔", "猫猫", "开心"]);
  assert.deepEqual(await repository.getCategoryOrder?.(), ["兔兔", "猫猫", "开心"]);
});

test("ships a non-empty reviewed library and merges duplicate category tags", () => {
  const items = defaultKaomojiItems();
  assert.equal(items.length, 325);
  assert.ok(items.some((item) => item.categories.length > 1));
  assert.equal(new Set(items.map((item) => item.value)).size, items.length);
});

test("ships an unclassified values-only catalog without losing multiline art", async () => {
  const values = JSON.parse(await readFile(new URL("../catalog/kaomoji-values.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../catalog/manifest.json", import.meta.url), "utf8"));
  assert.equal(values.length, defaultKaomojiItems().length);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((value) => typeof value === "string" && value.length > 0));
  assert.deepEqual(JSON.parse(JSON.stringify(["first line\nsecond line"])), ["first line\nsecond line"]);
  assert.equal(manifest.valuesUrl, "./kaomoji-values.json");
});

test("shows stable default faces before unused limited-compatibility faces", async () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const items = await createLocalKaomojiRepository("test.stable-first").list();
  const firstLimited = items.findIndex((item) => item.compatibility === "limited");
  const lastStable = items.findLastIndex((item) => item.compatibility === "stable");
  assert.ok(firstLimited > lastStable);
});

test("rejects normalized-empty faces and reports missing removals", async () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const repository = createLocalKaomojiRepository("test.validation");
  await assert.rejects(() => repository.upsert(" \u200e \ufeff ", ["可爱"]), /visible character/);
  assert.equal(await repository.remove("(definitely-missing)"), false);
});

test("keeps catalog sync opt-in and remembers the chosen mode", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  assert.equal(readKaomojiCatalogSyncState("test.catalog").mode, "manual");
  writeKaomojiCatalogSyncState({ mode: "automatic", lastCheckedAt: "2026-08-20T00:00:00.000Z" }, "test.catalog");
  const state = readKaomojiCatalogSyncState("test.catalog");
  assert.equal(state.mode, "automatic");
  assert.equal(shouldAutomaticallySync(state, { checkIntervalMs: 1000 }, Date.parse("2026-08-20T00:00:02.000Z")), true);
});

test("syncs a reviewed catalog without restoring a locally removed face", async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const repository = createLocalKaomojiRepository("test.catalog.merge");
  await repository.upsert("(remote-one)", ["开心"]);
  await repository.remove("(remote-one)");
  const fetcher = async (url) => new Response(JSON.stringify(String(url).endsWith("manifest.json") ? {
    schemaVersion: 1,
    libraryVersion: "test-1",
    generatedAt: "2026-08-25T00:00:00.000Z",
    itemCount: 2,
    itemsUrl: "./kaomoji.json",
  } : [
    { value: "(remote-one)", categories: ["开心"] },
    { value: "(remote-two)", categories: ["开心", "猫猫"] },
  ]), { status: 200, headers: { "content-type": "application/json" } });
  const result = await syncKaomojiCatalog(repository, {
    manifestUrl: "https://example.com/catalog/manifest.json",
    fetcher,
  });
  assert.equal(result.added, 1);
  const items = await repository.list();
  assert.equal(items.some((item) => item.value === "(remote-one)"), false);
  assert.deepEqual(items.find((item) => item.value === "(remote-two)")?.categories, ["开心", "猫猫"]);
});

test("persists a private file library atomically", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fuyue-kaomoji-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "kaomoji.json");
  const repository = createFileKaomojiRepository(file);
  await assert.rejects(() => repository.upsert(" \u200e \ufeff ", ["可爱"]), /visible character/);
  assert.equal(await repository.remove("(definitely-missing)"), false);
  await repository.upsert("(file-test)", ["开心", "猫猫"], "test face");
  await repository.markUsed("(file-test)");
  await repository.setFavorite("(file-test)", true);
  const saved = JSON.parse(await readFile(file, "utf8"));
  const item = saved.items.find((candidate) => candidate.value === "(file-test)");
  assert.equal(item.useCount, 1);
  assert.ok(item.lastUsedAt);
  assert.equal(item.favorite, true);
  assert.deepEqual(item.categories, ["开心", "猫猫"]);
  await repository.setCategoryOrder?.(["猫猫", "开心"]);
  assert.deepEqual((JSON.parse(await readFile(file, "utf8"))).categoryOrder, ["猫猫", "开心"]);
  assert.notEqual(await repository.list(), await repository.list());
  const defaultValue = (await repository.list())[0].value;
  await repository.remove(defaultValue);
  assert.equal((await repository.list()).some((candidate) => candidate.value === defaultValue), false);
});

test("exposes searchable MCP tools and increments hidden use frequency", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "fuyue-kaomoji-mcp-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "kaomoji.json");
  const client = new Client({ name: "kaomoji-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/mcp-cli.js", import.meta.url))],
    env: { ...process.env, FUYUE_KAOMOJI_PATH: file },
    stderr: "pipe",
  });
  context.after(() => client.close());
  await client.connect(transport);
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(client.getServerVersion()?.version, packageJson.version);

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "kaomoji_pick"));
  const missingRemoval = await client.callTool({ name: "kaomoji_remove", arguments: { value: "(definitely-missing)" } });
  assert.deepEqual(JSON.parse(missingRemoval.content.find((part) => part.type === "text")?.text), {
    removed: false,
    value: "(definitely-missing)",
    reason: "not_found",
  });
  await client.callTool({ name: "kaomoji_add", arguments: { value: "(mcp-test)", categories: ["开心"], label: "mcp happy" } });
  await client.callTool({ name: "kaomoji_add", arguments: { value: "(mcp-test-2)", categories: ["开心"], label: "mcp happy" } });
  const bulk = await client.callTool({ name: "kaomoji_add", arguments: { items: [
    { value: "(bulk-1)", categories: ["开心"] },
    { value: "(bulk-2)", categories: ["困困"] },
    { value: "(bulk-2)", categories: ["困困"] },
  ] } });
  assert.equal(JSON.parse(bulk.content.find((part) => part.type === "text")?.text).savedCount, 2);
  const first = await client.callTool({ name: "kaomoji_pick", arguments: { query: "mcp happy" } });
  const second = await client.callTool({ name: "kaomoji_pick", arguments: { query: "mcp happy" } });
  const firstValue = JSON.parse(first.content.find((part) => part.type === "text")?.text).item.value;
  const secondValue = JSON.parse(second.content.find((part) => part.type === "text")?.text).item.value;
  assert.notEqual(firstValue, secondValue);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.items.filter((item) => item.label === "mcp happy").reduce((sum, item) => sum + item.useCount, 0), 2);
});
