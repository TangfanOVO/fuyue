import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootArgument = process.argv[2] === "--root" ? process.argv[3] : "";
const root = rootArgument ? resolve(rootArgument) : fileURLToPath(new URL("..", import.meta.url));
if (rootArgument && !isAbsolute(root)) throw new Error("Privacy scan root must resolve to an absolute path");
const ignoredDirectories = new Set([".git", ".runtime", "dist", "node_modules", "coverage"]);
const ignoredDirectoryPaths = [
  /^android\/\.gradle$/,
  /^android(?:\/[^/]+)*\/build$/,
];
// Local review reports can contain machine paths as evidence. They are excluded
// from prepare-public-copy's top-level allowlist and must never enter a release.
const localOnlyFiles = [/^REVIEW-[^/]+\.md$/];
const blockedNames = new Set([".env", ".env.local", ".npmrc", ".netrc", "auth.json", "cookies.json"]);
const blockedExtensions = new Set([".db", ".dump", ".enc", ".jks", ".key", ".keystore", ".map", ".p12", ".pem", ".sqlite", ".sqlite3"]);
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/,
  /(?:postgres|postgresql):\/\/[^\s"']+/i,
  /gh[opsu]_[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /AKIA[0-9A-Z]{16}/,
];
const privatePathPatterns = [/\/Users\/[^/]+\//, /\/home\/[^/]+\/\.fuyue/i, /\\Users\\[^\\]+\\/];
const privateMarkers = (process.env.PUBLIC_PRIVATE_MARKERS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const releaseMode = process.env.PUBLIC_RELEASE === "1";

const files = [];
const failures = [];
if (releaseMode && privateMarkers.length === 0) {
  failures.push("release scan requires PUBLIC_PRIVATE_MARKERS; configure a private comma-separated marker secret before packaging or deployment");
}
function isReviewedBinary(relativePath, extension) {
  if (extension === ".png") {
    return /^apps\/web\/public\/icon-(?:192|512)\.png$/.test(relativePath)
      || /^android\/app\/src\/main\/(?:res\/(?:mipmap|drawable)[^/]*|assets\/public)\/[^/]+\.png$/.test(relativePath);
  }
  return relativePath === "android/gradle/wrapper/gradle-wrapper.jar";
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (entry.isDirectory() && (ignoredDirectories.has(entry.name) || ignoredDirectoryPaths.some((pattern) => pattern.test(relativePath)))) continue;
    if (entry.isFile() && localOnlyFiles.some((pattern) => pattern.test(relativePath))) continue;
    if ((await lstat(path)).isSymbolicLink()) { failures.push(`${relative(root, path)}: symbolic links are not allowed`); continue; }
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
  }
}

await walk(root);
for (const path of files) {
  const name = path.split("/").at(-1) ?? "";
  const extension = extname(name).toLowerCase();
  if (blockedNames.has(name) || blockedExtensions.has(extension)) {
    failures.push(`${relative(root, path)}: blocked file type`);
    continue;
  }
  if ((await stat(path)).size > 2_000_000) { failures.push(`${relative(root, path)}: file exceeds 2 MB review limit`); continue; }
  const relativePath = relative(root, path);
  if (extension === ".png" && !isReviewedBinary(relativePath, extension)) {
    failures.push(`${relative(root, path)}: unreviewed raster image`); continue;
  }
  if (extension === ".jar" && !isReviewedBinary(relativePath, extension)) {
    failures.push(`${relativePath}: unreviewed executable archive`); continue;
  }
  if (isReviewedBinary(relativePath, extension)) continue;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"].includes(extension)) continue;
  const content = await readFile(path, "utf8");
  if (credentialPatterns.some((pattern) => pattern.test(content))) failures.push(`${relative(root, path)}: credential-shaped text`);
  if (privatePathPatterns.some((pattern) => pattern.test(content))) failures.push(`${relative(root, path)}: private absolute path found`);
  for (const marker of privateMarkers) {
    if (content.includes(marker)) failures.push(`${relative(root, path)}: private marker found`);
  }
}

if (failures.length) {
  console.error("Public boundary check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Public boundary check passed for ${files.length} files.`);
}
