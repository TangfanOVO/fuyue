import test from "node:test";
import assert from "node:assert/strict";
import { homeConfigUpdates } from "../setup-home.mjs";

test("whole-home setup maps chat and voice choices without logging or persisting elsewhere", () => {
  assert.deepEqual(homeConfigUpdates({ chatProvider: "deepseek", chatKey: "example_token_123", chatModel: "deepseek-v4-flash", voiceProvider: "elevenlabs", voiceKey: "voice_example_123", voiceId: "voice-one" }), {
    FUYUE_ACTIVE_PROVIDER: "deepseek",
    FUYUE_DEEPSEEK_API_KEY: "example_token_123",
    FUYUE_DEEPSEEK_MODEL: "deepseek-v4-flash",
    FUYUE_ACTIVE_VOICE_PROVIDER: "elevenlabs",
    FUYUE_ELEVENLABS_API_KEY: "voice_example_123",
    FUYUE_ELEVENLABS_VOICE_ID: "voice-one",
    FUYUE_ELEVENLABS_MODEL: "eleven_flash_v2_5",
  });
});

test("whole-home setup can remain chat-only", () => {
  const updates = homeConfigUpdates({ chatProvider: "qwen", chatKey: "example_token_456", chatModel: "", voiceProvider: "none" });
  assert.equal(updates.FUYUE_ACTIVE_PROVIDER, "qwen");
  assert.equal(updates.FUYUE_QWEN_MODEL, "qwen-plus");
  assert.equal("FUYUE_ACTIVE_VOICE_PROVIDER" in updates, false);
});
