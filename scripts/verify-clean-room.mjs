import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { preparePublicCopy } from "./prepare-public-copy.mjs";

function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const npmCli = process.env.npm_execpath || join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
function runNpm(args, cwd) { return run(process.execPath, [npmCli, ...args], cwd); }

const temporaryRoot = await mkdtemp(join(tmpdir(), "fuyue-public-"));
const copy = join(temporaryRoot, "source");
try {
  await preparePublicCopy(copy);
  await run(process.execPath, ["scripts/check-public-boundary.mjs", "--root", copy], copy);
  await runNpm(["ci"], copy);
  await runNpm(["run", "typecheck"], copy);
  await runNpm(["test"], copy);
  await runNpm(["run", "build"], copy);
  await runNpm(["audit", "--omit=dev"], copy);
  console.log("Clean-room verification passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
