import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("cloud relay ships only the relay, requires a private code, and has an unauthenticated health check", async () => {
  const [dockerfile, blueprint, server, readme] = await Promise.all([
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("render.yaml", root), "utf8"),
    readFile(new URL("apps/relay/src/server.ts", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  assert.match(dockerfile, /apps\/relay\/dist\/index\.js/);
  assert.doesNotMatch(dockerfile, /apps\/web\/dist/);
  assert.doesNotMatch(dockerfile, /npm prune/);
  assert.match(blueprint, /FUYUE_REQUIRE_ACCESS_CODE[\s\S]*value: "1"/);
  assert.match(blueprint, /FUYUE_ACCESS_CODE\n\s+sync: false/);
  assert.match(blueprint, /FUYUE_DEEPSEEK_API_KEY\n\s+sync: false/);
  assert.match(blueprint, /healthCheckPath: \/healthz/);
  assert.match(server, /url\.pathname === "\/healthz"/);
  assert.match(readme, /这颗按钮只部署模型转发/);
  assert.doesNotMatch(blueprint, /sk-[A-Za-z0-9_-]{20,}/);
});
