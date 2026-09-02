import { execFile } from "node:child_process";
import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const allowedTopLevel = new Set([".dockerignore", ".github", ".gitignore", "Dockerfile", "LICENSE", "PUBLICATION_BOUNDARY.md", "README.md", "THIRD_PARTY_NOTICES.md", "android", "apps", "capacitor.config.ts", "docs", "fuyue.layers.json", "licenses", "package-lock.json", "package.json", "packages", "render.yaml", "scripts", "tsconfig.base.json", "upstreams"]);
const ignored = new Set([".DS_Store", ".gradle", "build", "dist", "node_modules", "coverage"]);
const blockedExtensions = new Set([".db", ".dump", ".enc", ".jks", ".key", ".keystore", ".p12", ".pem", ".sqlite", ".sqlite3", ".tar", ".gz", ".zip"]);
const runFile = promisify(execFile);

function includePath(path) {
  const name = basename(path);
  if (ignored.has(name) || blockedExtensions.has(extname(name).toLowerCase())) return false;
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) return false;
  return !/^fuyue-(?:five-tab-draft|production-)/.test(name);
}

export async function preparePublicCopy(targetValue) {
  if (!targetValue) throw new Error("Pass an empty target directory path");
  const target = resolve(targetValue);
  if (!isAbsolute(target) || target === sourceRoot || target.startsWith(`${sourceRoot}/`)) throw new Error("Target must be outside the source directory");
  try { await lstat(target); throw new Error(`Target already exists: ${target}`); } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") { /* expected */ }
    else throw cause;
  }
  await mkdir(dirname(target), { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!allowedTopLevel.has(entry.name)) continue;
    await cp(join(sourceRoot, entry.name), join(target, entry.name), { recursive: true, filter: includePath });
  }
  try {
    await runFile(process.execPath, [join(target, "scripts/check-public-boundary.mjs"), "--root", target], {
      cwd: target,
      env: { ...process.env, PUBLIC_RELEASE: "1" },
    });
    return target;
  } catch (cause) {
    await rm(target, { recursive: true, force: true });
    throw new Error(`Prepared copy failed the privacy boundary scan and was removed: ${cause instanceof Error ? cause.message : "unknown error"}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const target = await preparePublicCopy(process.argv[2]);
  console.log(`Prepared fresh public copy at ${target}`);
}
