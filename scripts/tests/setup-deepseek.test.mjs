import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveDeepSeekConfig, upsertEnvContent } from "../setup-deepseek.mjs";

test("DeepSeek setup preserves unrelated relay settings and replaces stale provider values", () => {
  const result = upsertEnvContent("FUYUE_RELAY_PORT=9000\nFUYUE_ACTIVE_PROVIDER=gemini\n", {
    FUYUE_ACTIVE_PROVIDER: "deepseek",
    FUYUE_DEEPSEEK_API_KEY: "secret-value",
  });
  assert.match(result, /FUYUE_RELAY_PORT=9000/);
  assert.match(result, /FUYUE_ACTIVE_PROVIDER="deepseek"/);
  assert.match(result, /FUYUE_DEEPSEEK_API_KEY="secret-value"/);
});

test("DeepSeek setup writes a private env file without echoing secrets into other files", async () => {
  const root = await mkdtemp(join(tmpdir(), "fuyue-setup-"));
  const target = join(root, ".env");
  try {
    await saveDeepSeekConfig("sk-test-secret-value", "deepseek-v4-pro", target);
    const content = await readFile(target, "utf8");
    const mode = (await stat(target)).mode & 0o777;
    assert.match(content, /FUYUE_DEEPSEEK_MODEL="deepseek-v4-pro"/);
    assert.match(content, /FUYUE_DEEPSEEK_API_KEY="sk-test-secret-value"/);
    assert.equal(mode, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});
