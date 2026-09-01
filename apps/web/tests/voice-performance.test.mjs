import assert from "node:assert/strict";
import test from "node:test";

import { cleanVoicePerformance, mergeStreamingText, prepareElevenV3Speech, visibleVoicePerformanceTags } from "../src/voice-performance.js";

test("voice performance cues stay out of the formal transcript", () => {
  assert.equal(cleanVoicePerformance("[温柔地说][叹气] 我在呢。"), "我在呢。");
  assert.deepEqual(visibleVoicePerformanceTags("【sigh】[温柔地说]好。"), ["[sigh]", "[温柔地说]"]);
});

test("Eleven v3 receives normalized ASCII audio tags instead of a fixed preset", () => {
  const result = prepareElevenV3Speech("【sigh】[温柔地说] I am here. [叹气] Still here.");
  assert.equal(result.cleanText, "I am here. Still here.");
  assert.equal(result.speechText, "[sighs] [softly] I am here. [sighs] Still here.");
  assert.deepEqual(result.tags, ["[sighs]", "[softly]"]);
});

test("non-v3 playback uses the clean transcript so stage directions are never spoken", () => {
  const prepared = prepareElevenV3Speech("[softly] Mm, only for you.");
  const flashSpeech = prepared.cleanText;
  assert.equal(flashSpeech, "Mm, only for you.");
  assert.doesNotMatch(flashSpeech, /\[softly\]/);
});

test("realtime text accepts cumulative prefixes without flashing duplicated words", () => {
  let transcript = "";
  for (const delta of ["可以", "可以听见", "可以听见我吗？"]) transcript = mergeStreamingText(transcript, delta);
  assert.equal(transcript, "可以听见我吗？");

  let tokens = "";
  for (const delta of ["我", "在", "呢。"]) tokens = mergeStreamingText(tokens, delta);
  assert.equal(tokens, "我在呢。");
  assert.equal(mergeStreamingText("我在呢。", "我在"), "我在呢。");
});
