import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultKaomojiItems } from "../dist/repository.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const catalogDirectory = resolve(root, "catalog");
const items = defaultKaomojiItems().map(({ value, label, categories }) => ({
  value,
  ...(label ? { label } : {}),
  categories,
}));
const values = items.map(({ value }) => value);
const manifest = {
  schemaVersion: 1,
  libraryVersion: String(packageJson.version),
  generatedAt: new Date().toISOString(),
  itemCount: items.length,
  itemsUrl: "./kaomoji.json",
  valuesUrl: "./kaomoji-values.json",
};

await mkdir(catalogDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(catalogDirectory, "kaomoji.json"), `${JSON.stringify(items, null, 2)}\n`, "utf8"),
  writeFile(resolve(catalogDirectory, "kaomoji-values.json"), `${JSON.stringify(values, null, 2)}\n`, "utf8"),
  writeFile(resolve(catalogDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
]);

console.error(`catalog ${manifest.libraryVersion}: ${items.length} entries`);
