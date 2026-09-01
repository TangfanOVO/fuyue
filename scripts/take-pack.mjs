import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalogPath = join(root, "fuyue.layers.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const groups = {
  function: catalog.functionPacks,
  frontend: catalog.frontendPacks,
  profile: catalog.profiles,
};

const scaffoldPaths = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "fuyue.layers.json",
  "docs/fuyue-layers.schema.json",
  "docs/PACKS.md",
  "tsconfig.base.json",
];
const workspaceOrder = [
  "@fuyue/core",
  "@fuyue/toybox",
  "@fuyue/ui",
  "@fuyue/travel-ui",
  "@fuyue/memory-cloud",
  "@fuyue/kaomoji-drawer",
  "@fuyue/relay",
  "@fuyue/web",
  "@fuyue/showcase",
];

function fail(message) {
  console.error(`\n取件失败：${message}\n`);
  process.exitCode = 1;
}

function resolveRef(reference) {
  const [groupName, id, extra] = reference.split("/");
  if (extra || !groupName || !id || !(groupName in groups)) return null;
  const item = groups[groupName]?.[id];
  return item ? { reference, groupName, id, item } : null;
}

function printList() {
  const headings = { function: "功能包", frontend: "外观 / 交互 / 前端", profile: "组合方案" };
  for (const [groupName, items] of Object.entries(groups)) {
    console.log(`\n${headings[groupName]}`);
    for (const [id, item] of Object.entries(items)) {
      const state = item.takeable === false ? "（直接 clone）" : "";
      console.log(`  ${groupName}/${id.padEnd(22)} ${item.label}${state}`);
      console.log(`    ${item.summary || item.truth}`);
    }
  }
  console.log("\n取件示例：npm run pack:take -- frontend/ambient /absolute/new-folder\n");
}

function dependencyClosure(start) {
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  function visit(reference) {
    if (visited.has(reference)) return;
    if (visiting.has(reference)) throw new Error(`依赖出现循环：${reference}`);
    const resolved = resolveRef(reference);
    if (!resolved) throw new Error(`目录里没有 ${reference}`);
    visiting.add(reference);
    for (const dependency of resolved.item.requires || []) visit(dependency);
    visiting.delete(reference);
    visited.add(reference);
    ordered.push(resolved);
  }
  visit(start);
  return ordered;
}

function normalizedPaths(items) {
  const candidates = [...new Set(items.flatMap(({ item }) => [...(item.paths || []), ...(item.docs || [])]).concat(scaffoldPaths))]
    .filter((value) => value && value !== ".")
    .map((value) => value.replaceAll("\\", "/").replace(/^\.\//, ""));
  return candidates.filter((candidate) => !candidates.some((parent) => parent !== candidate && candidate.startsWith(`${parent}/`)));
}

function shouldCopy(source) {
  const relativePath = relative(root, source);
  const segments = relativePath.split(sep);
  const blockedSegments = new Set([".git", "node_modules", "dist", "coverage", ".gradle", "build"]);
  if (segments.some((segment) => blockedSegments.has(segment))) return false;
  const name = basename(source);
  if (name === ".DS_Store" || name === "local.properties") return false;
  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") return false;
  if (/\.(jks|keystore|p12|mobileprovision)$/i.test(name)) return false;
  return true;
}

async function pathExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyPath(relativePath, target) {
  const source = join(root, relativePath);
  if (!(await pathExists(source))) throw new Error(`目录指向了不存在的路径：${relativePath}`);
  const destination = join(target, relativePath);
  const sourceStat = await stat(source);
  await mkdir(dirname(destination), { recursive: true });
  if (sourceStat.isDirectory()) await cp(source, destination, { recursive: true, filter: shouldCopy, preserveTimestamps: true });
  else if (shouldCopy(source)) await cp(source, destination, { preserveTimestamps: true });
}

async function workspacesIn(target) {
  const found = [];
  for (const parent of ["packages", "apps"]) {
    const directory = join(target, parent);
    if (!(await pathExists(directory))) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, "package.json");
      if (!(await pathExists(path))) continue;
      const manifest = JSON.parse(await readFile(path, "utf8"));
      found.push({ directory: `${parent}/${entry.name}`, manifest });
    }
  }
  return found.sort((left, right) => {
    const leftIndex = workspaceOrder.indexOf(left.manifest.name);
    const rightIndex = workspaceOrder.indexOf(right.manifest.name);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.manifest.name.localeCompare(right.manifest.name);
  });
}

async function writeRootManifest(target, selected, included, paths) {
  const workspaces = await workspacesIn(target);
  const workspaceLicenses = new Set(workspaces.map(({ manifest }) => manifest.license).filter(Boolean));
  const license = workspaceLicenses.size === 1 ? [...workspaceLicenses][0] : catalog.license;
  const commands = (script) => workspaces.filter(({ manifest }) => manifest.scripts?.[script]).map(({ manifest }) => `npm run ${script} -w ${manifest.name}`);
  const build = commands("build");
  const tests = commands("test");
  const typecheck = workspaces.flatMap(({ manifest }) => [
    ...(manifest.scripts?.typecheck ? [`npm run typecheck -w ${manifest.name}`] : []),
    ...(manifest.scripts?.build ? [`npm run build -w ${manifest.name}`] : []),
  ]);
  const hasAndroid = paths.some((path) => path === "android" || path.startsWith("android/") || path === "capacitor.config.ts");
  const scripts = {};
  if (build.length) scripts.build = build.join(" && ");
  if (typecheck.length) scripts.typecheck = typecheck.join(" && ");
  if (tests.length) scripts.test = `${build.length ? "npm run build && " : ""}${tests.join(" && ")}`;
  if (workspaces.some(({ manifest }) => manifest.name === "@fuyue/showcase")) scripts["dev:showcase"] = "npm run dev -w @fuyue/showcase";
  if (workspaces.some(({ manifest }) => manifest.name === "@fuyue/web")) scripts["dev:web"] = "npm run dev -w @fuyue/web";
  if (workspaces.some(({ manifest }) => manifest.name === "@fuyue/relay")) scripts["dev:relay"] = "npm run start -w @fuyue/relay";
  if (await pathExists(join(target, "scripts", "setup-deepseek.mjs"))) scripts["setup:deepseek"] = "node scripts/setup-deepseek.mjs";
  const slug = selected.reference.replaceAll("/", "-").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const manifest = {
    name: `fuyue-takeaway-${slug}`,
    private: true,
    version: "0.1.0",
    license,
    engines: { node: ">=22.12.0" },
    workspaces: workspaces.map(({ directory }) => directory),
    scripts,
    ...(hasAndroid ? {
      dependencies: { "@capacitor/android": "8.5.0", "@capacitor/core": "8.5.0" },
      devDependencies: { "@capacitor/cli": "8.5.0" },
      overrides: { xcode: { uuid: "11.1.1" } },
    } : {}),
  };
  await writeFile(join(target, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (license === "MIT" && await pathExists(join(target, "packages", "ui", "LICENSE"))) {
    await cp(join(target, "packages", "ui", "LICENSE"), join(target, "LICENSE"));
  }

  const imports = [...new Set(included.flatMap(({ item }) => item.imports || []))];
  const notes = included.map(({ reference, item }) => `- \`${reference}\` — ${item.label}\n  - ${item.truth}`).join("\n");
  const pathLines = paths.map((path) => `- \`${path}\``).join("\n");
  const importLines = imports.length ? imports.map((path) => `- \`${path}\``).join("\n") : "- 这个切片没有独立 import 路径，请按目录中的应用契约接入。";
  const readme = `# ${selected.item.label}\n\n这是由 \`fuyue.layers.json\` 生成的最小取件工作区。选中项为 \`${selected.reference}\`，所有必要依赖已自动带上。\n\n## 先跑起来\n\n\`\`\`bash\nnpm install\n${scripts.build ? "npm run build\n" : ""}${scripts["dev:showcase"] ? "npm run dev:showcase\n" : scripts["dev:web"] ? "npm run dev:web\n" : ""}\`\`\`\n\n## 包含的积木\n\n${notes}\n\n## 可引入路径\n\n${importLines}\n\n## 保留的源码路径\n\n${pathLines}\n\n## 许可\n\n这份取件使用 **${license}**。完整赴约应用仍使用 AGPL-3.0-only；只有被单独标明的前端积木可按 MIT 带走。\n\n## 边界\n\n- 取件工具不复制 \`.env\`、KeyStore、构建产物、缓存或 \`node_modules\`。\n- 包含前端预览不代表已连接真实模型、语音、记忆蒸馏或系统日历。\n- 继续分发修改版时，请保留本目录的授权与第三方说明。\n`;
  await writeFile(join(target, "TAKEAWAY.md"), readme, "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") return printList();
  if (args.length !== 2) throw new Error("用法：node scripts/take-pack.mjs <function|frontend|profile>/<id> /absolute/new-folder");
  const [reference, targetArgument] = args;
  const selected = resolveRef(reference);
  if (!selected) throw new Error(`目录里没有 ${reference}；先运行 --list 查看可取项`);
  if (selected.item.takeable === false) throw new Error(`${reference} 就是整仓，请直接 clone，不再生成一份重复副本`);
  if (!isAbsolute(targetArgument)) throw new Error("目标必须是绝对路径，避免把副本误生成在源码树里");
  const target = resolve(targetArgument);
  if (target === root || target.startsWith(`${root}${sep}`)) throw new Error("目标不能在原仓内部");
  if (await pathExists(target)) throw new Error("目标路径已存在；请换一个全新空路径，防止覆盖文件");
  const included = dependencyClosure(reference);
  const paths = normalizedPaths(included);
  await mkdir(target, { recursive: false });
  try {
    for (const path of paths) await copyPath(path, target);
    await writeRootManifest(target, selected, included, paths);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  console.log(`\n已取出 ${selected.item.label}`);
  console.log(`目标：${target}`);
  console.log(`包含：${included.map(({ reference: itemRef }) => itemRef).join("、")}`);
  if (await pathExists(join(target, "apps", "showcase"))) console.log("预览：cd 到目标后运行 npm install && npm run dev:showcase");
  else console.log("下一步：cd 到目标后运行 npm install && npm run build");
  console.log("");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
