import { build } from "esbuild"; import { copyFile, mkdir } from "node:fs/promises"; import { fileURLToPath } from "node:url";
const path = (value) => fileURLToPath(new URL(value, import.meta.url)); await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await build({ entryPoints: [path("../src/index.tsx")], outfile: path("../dist/index.js"), bundle: true, format: "esm", target: "es2022", sourcemap: true, external: ["react", "react/jsx-runtime"] });
await copyFile(new URL("../src/index.d.ts", import.meta.url), new URL("../dist/index.d.ts", import.meta.url)); await copyFile(new URL("../src/styles.css", import.meta.url), new URL("../dist/styles.css", import.meta.url));
