import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BUILTIN_CAPABILITIES, BUILTIN_CAPABILITY_PACKS, CAPABILITY_CONTRACT_VERSION, createCapabilityBuildPlan, localCapabilityStatus } from "../dist/index.js";

test("built-in capability packs use one stable contract and unique ids", () => {
  assert.ok(BUILTIN_CAPABILITY_PACKS.length >= 5);
  assert.ok(BUILTIN_CAPABILITY_PACKS.every((pack) => pack.contractVersion === CAPABILITY_CONTRACT_VERSION));
  const ids = BUILTIN_CAPABILITIES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("memory.ledger"));
  assert.ok(ids.includes("companion.mood"));
  assert.ok(ids.includes("memory.visual"));
  assert.ok(ids.includes("reading.together"));
  assert.ok(ids.includes("call.realtime"));
  assert.ok(ids.includes("expression.kaomoji"));
  assert.ok(ids.includes("travel.story_cards"));
  assert.ok(ids.includes("leisure.fishing"));
});

test("bundled local features and optional backend surfaces report their real state", () => {
  const statuses = new Map(localCapabilityStatus().map((item) => [item.id, item]));
  assert.equal(statuses.get("shell.localdata")?.state, "local_only");
  assert.equal(statuses.get("memory.ledger")?.state, "local_only");
  assert.equal(statuses.get("memory.visual")?.state, "local_only");
  assert.equal(statuses.get("life.calendar")?.state, "surface_only");
  assert.equal(statuses.get("call.realtime")?.state, "local_only");
  assert.equal(statuses.get("leisure.toys")?.state, "local_only");
  assert.equal(statuses.get("media.cobrowse")?.state, "local_only");
  assert.equal(statuses.get("reading.engawa")?.state, "local_only");
  assert.equal(statuses.get("travel.story_cards")?.state, "local_only");
  assert.equal(statuses.get("reading.together")?.state, "surface_only");
  assert.equal(statuses.get("media.listening")?.state, "surface_only");
  assert.equal(statuses.get("travel.upstream")?.state, "surface_only");
  assert.equal(statuses.size, BUILTIN_CAPABILITIES.length);
});

test("build plans preserve source, routes, repository path and verification work", () => {
  const plan = createCapabilityBuildPlan("travel.upstream", "upstream", "2026-08-29T00:00:00.000Z");
  assert.equal(plan.format, "fuyue-build-plan");
  assert.equal(plan.targetPath, "extensions/travel-upstream/");
  assert.equal(plan.upstream?.url, "https://github.com/yuyixuanfu/nowhere");
  assert.ok(plan.requiredRoutes.length > 0);
  assert.ok(plan.verificationChecklist.some((item) => item.includes("返回")));
  const frontend = createCapabilityBuildPlan("travel.upstream", "frontend_only");
  assert.match(frontend.note, /只复用前端积木/);
});

test("package exposes every documented take-away boundary", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const path of [".", "./types", "./repository", "./indexeddb", "./snapshot", "./gateway", "./voice", "./capabilities"]) {
    assert.equal(typeof manifest.exports[path]?.import, "string", `${path} needs an ESM export`);
    assert.equal(typeof manifest.exports[path]?.types, "string", `${path} needs a types export`);
  }
});
