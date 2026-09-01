import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const path = (value) => fileURLToPath(new URL(value, import.meta.url));

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({
  entryPoints: {
    ambient: path("../src/ambient.ts"),
    motion: path("../src/motion.ts"),
    "stack-deck": path("../src/stack-deck.tsx"),
    memory: path("../src/memory.tsx"),
    appearance: path("../src/appearance.ts"),
    splash: path("../src/splash.tsx"),
  },
  outdir: path("../dist/"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  external: ["react", "react/jsx-runtime", "lucide-react"],
});
await copyFile(new URL("../src/styles.css", import.meta.url), new URL("../dist/styles.css", import.meta.url));
await copyFile(new URL("../src/memory-constellation.css", import.meta.url), new URL("../dist/memory-constellation.css", import.meta.url));
for (const name of ["ambient", "motion", "stack-deck", "memory", "appearance", "splash"]) {
  await copyFile(new URL(`../src/${name}.d.ts`, import.meta.url), new URL(`../dist/${name}.d.ts`, import.meta.url));
}
