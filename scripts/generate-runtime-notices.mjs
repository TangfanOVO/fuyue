import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packages = [
  ["@capacitor/android", "8.5.0"],
  ["@capacitor/core", "8.5.0"],
  ["@modelcontextprotocol/core", "2.0.0"],
  ["@modelcontextprotocol/server", "2.0.0"],
  ["@phosphor-icons/react", "2.1.10"],
  ["lucide-react", "1.35.0"],
  ["react", "19.2.8"],
  ["react-dom", "19.2.8"],
  ["scheduler", "0.27.0"],
  ["tslib", "2.8.1"],
  ["ws", "8.21.3"],
  ["zod", "4.4.3"],
];

async function licenseFor(name) {
  const packageRoot = join(root, "node_modules", ...name.split("/"));
  for (const file of ["LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING"]) {
    try {
      return (await readFile(join(packageRoot, file), "utf8")).trim();
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  throw new Error(`No license file found for ${name}`);
}

const sections = [
  "Fuyue public runtime - third-party license notices",
  "This file is generated from the exact installed dependency tree. Do not edit it by hand.",
];
for (const [name, expectedVersion] of packages) {
  const manifest = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(`${name} version changed from ${expectedVersion} to ${manifest.version}; review and update notices`);
  }
  sections.push(`\n${"=".repeat(72)}\n${name}@${manifest.version}\n${"=".repeat(72)}\n${await licenseFor(name)}`);
}

const target = join(root, "apps", "web", "public", "THIRD_PARTY_NOTICES.txt");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${sections.join("\n")}\n`, "utf8");
console.log(`Generated ${target}`);
