import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ui package exposes independently importable visual layers", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["./ambient", "./motion", "./stack-deck", "./memory", "./appearance", "./splash", "./styles.css"]) assert.ok(pkg.exports[name]);
  const splash = await readFile(new URL("../src/splash.tsx", import.meta.url), "utf8");
  assert.match(splash, /setVisible\(false\)/);
  assert.doesNotMatch(splash, /setTimeout\(\(\) => setVisible\(false\)/);
  const memory = await readFile(new URL("../src/memory.tsx", import.meta.url), "utf8");
  const constellation = await readFile(new URL("../src/memory-constellation.tsx", import.meta.url), "utf8");
  const ambient = await readFile(new URL("../../../apps/web/src/ambient-lines.tsx", import.meta.url), "utf8");
  const appearance = await readFile(new URL("../src/appearance.ts", import.meta.url), "utf8");
  const memoryStyles = await readFile(new URL("../src/memory-constellation.css", import.meta.url), "utf8");
  assert.match(memory, /export function MemoryMap/);
  assert.match(memory, /sourceRelations/);
  assert.match(constellation, /const MIN_VISUAL_NODE_COUNT = 144/);
  assert.match(constellation, /visualNodeCountForMemoryCount/);
  assert.match(constellation, /Math\.max\(MIN_VISUAL_NODE_COUNT, normalized\)/);
  assert.match(constellation, /worldDimensionScaleForVisualNodeCount/);
  assert.match(constellation, /return wrapWorldY\(node\.y, travel, worldHeight\)/);
  assert.doesNotMatch(constellation, /waitingRoom/);
  assert.match(constellation, /worldWidth = width \* worldScale/);
  assert.match(constellation, /minimumScale = Math\.max\(\.12, 1 \/ worldScale\)/);
  assert.match(constellation, /const cells = new Map/);
  assert.match(constellation, /data-visual-node-count/);
  assert.match(constellation, /data-visible-node-count/);
  assert.match(constellation, /data-world-scale/);
  assert.match(constellation, /interactive: hasMemories/);
  assert.match(constellation, /INTERACTION_NEIGHBOR_COUNT = 4/);
  assert.match(constellation, /INTERACTION_RADIUS = 110/);
  assert.match(constellation, /traceLengthWorld \* scale/);
  assert.match(constellation, /zoomAround/);
  assert.doesNotMatch(constellation, /memory-constellation-ambient/);
  assert.match(constellation, /toggleSelectionAt/);
  assert.match(ambient, /effects\?: readonly LineEffect\[\]/);
  assert.match(ambient, /selected\.map\(\(item\) => <AmbientEffectLayer/);
  assert.match(ambient, /Math\.ceil\(Math\.log2/);
  assert.match(appearance, /toggleLineEffectSelection/);
  assert.match(appearance, /effect === "none"/);
  assert.match(memoryStyles, /--memory-canvas-background: color-mix\(in srgb,var\(--panel-solid,var\(--paper-raised,#fff\)\) 90%,var\(--accent-soft/);
  assert.match(memoryStyles, /data-layout="official"[^}]+--memory-canvas-background:#fff/);
});

test("memory constellation character count has a 144 floor and only grows", async () => {
  const { visualNodeCountForMemoryCount, worldDimensionScaleForVisualNodeCount, wrapWorldY } = await import("../dist/memory.js");
  const samples = [0, 1, 3, 143, 144, 145, 159, 160, 449, 450, 500, 1000];
  const counts = samples.map(visualNodeCountForMemoryCount);
  assert.deepEqual(counts, [144, 144, 144, 144, 144, 145, 159, 160, 449, 450, 500, 1000]);
  counts.slice(1).forEach((count, index) => assert.ok(count >= counts[index]));
  assert.equal(worldDimensionScaleForVisualNodeCount(144), 1);
  assert.ok(Math.abs(worldDimensionScaleForVisualNodeCount(500) - Math.sqrt(500 / 144)) < 1e-10);
  assert.ok(worldDimensionScaleForVisualNodeCount(1000) > worldDimensionScaleForVisualNodeCount(500));

  for (const count of [144, 500, 1000]) {
    const worldHeight = 920 * worldDimensionScaleForVisualNodeCount(count);
    for (const travel of [0, worldHeight * .17, worldHeight * .61, worldHeight * 1.4]) {
      const bins = Array(10).fill(0);
      for (let index = 0; index < count; index += 1) {
        const y = wrapWorldY((index + .5) / count, travel, worldHeight);
        const bin = Math.min(9, Math.floor(((y + worldHeight / 2) / worldHeight) * 10));
        bins[bin] += 1;
      }
      assert.ok(Math.max(...bins) - Math.min(...bins) <= 1, `${count} nodes must stay evenly tiled while looping`);
    }
  }
});
