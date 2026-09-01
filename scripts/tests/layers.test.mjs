import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../../", import.meta.url);
const rootPath = fileURLToPath(root);
const manifest = JSON.parse(await readFile(new URL("../../fuyue.layers.json", import.meta.url), "utf8"));
const groups = { function: manifest.functionPacks, frontend: manifest.frontendPacks, profile: manifest.profiles };

function entry(reference) {
  const [group, id] = reference.split("/");
  return groups[group]?.[id];
}

test("dual take-away catalog has honest, resolvable entries", async () => {
  assert.equal(manifest.version, 2);
  assert.ok(Object.keys(manifest.functionPacks).length >= 10);
  assert.ok(Object.keys(manifest.frontendPacks).length >= 10);
  for (const [groupName, items] of Object.entries(groups)) {
    for (const [id, item] of Object.entries(items)) {
      assert.ok(item.label, `${groupName}/${id} needs a label`);
      assert.ok(item.summary, `${groupName}/${id} needs a summary`);
      assert.ok(item.truth, `${groupName}/${id} needs an honesty boundary`);
      assert.ok(["standalone", "application-slice", "integration", "complete"].includes(item.kind), `${groupName}/${id} has an unknown kind`);
      for (const dependency of item.requires || []) assert.ok(entry(dependency), `${groupName}/${id} points to missing ${dependency}`);
      for (const path of [...(item.paths || []), ...(item.docs || [])]) {
        if (path !== ".") await access(new URL(`../../${path}`, import.meta.url));
      }
    }
  }
  assert.equal(entry("frontend/ambient").requires.includes("frontend/ui-kit"), true);
  assert.equal(entry("frontend/chat-surface").kind, "application-slice");
  assert.equal(entry("profile/full-source").takeable, false);
});

test("take command produces a minimal ambient workspace with preview and no artifacts", async () => {
  const parent = await mkdtemp(join(tmpdir(), "fuyue-pack-test-"));
  const target = join(parent, "ambient");
  try {
    await execFileAsync(process.execPath, [fileURLToPath(new URL("../take-pack.mjs", import.meta.url)), "frontend/ambient", target], { cwd: rootPath });
    const generated = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    assert.deepEqual(generated.workspaces, ["packages/core", "packages/ui", "apps/showcase"]);
    assert.ok(generated.scripts.build.includes("@fuyue/showcase"));
    await access(join(target, "TAKEAWAY.md"));
    await access(join(target, "apps", "web", "src", "ambient-lines.tsx"));
    await access(join(target, "apps", "showcase", "src", "main.tsx"));
    await assert.rejects(access(join(target, "packages", "ui", "dist")));
    await assert.rejects(access(join(target, "packages", "ui", "node_modules")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
