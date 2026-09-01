// @ts-check

const BRACKETED_CUE = /\[([^\[\]\r\n]{1,80})\]|【([^【】\r\n]{1,80})】/g;
const ENGLISH_CUES = new Map([
  ["sigh", "sighs"], ["sighs", "sighs"], ["sighing", "sighs"],
  ["exhale", "exhales"], ["exhales", "exhales"], ["exhaling", "exhales"],
  ["whisper", "whispers"], ["whispers", "whispers"], ["whispering", "whispers"],
  ["soft", "softly"], ["softly", "softly"], ["gentle", "softly"], ["gently", "softly"],
  ["laugh", "laughs"], ["laughs", "laughs"], ["laughing", "laughs"],
  ["giggle", "giggles"], ["giggles", "giggles"], ["giggling", "giggles"],
  ["chuckle", "chuckles"], ["chuckles", "chuckles"], ["chuckling", "chuckles"],
  ["excited", "excited"], ["curious", "curious"], ["crying", "crying"], ["sad", "sad"],
  ["warmly", "warmly"], ["mischievously", "mischievously"], ["sarcastic", "sarcastic"],
  ["slow", "slow"], ["slowly", "slow"], ["pause", "pause"], ["pauses", "pause"],
]);

/** @param {string} value */
function tidy(value) {
  return value.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
}

/** @param {string} value */
function normalizedElevenCue(value) {
  const cue = value.trim().toLowerCase().replace(/[.!?]+$/g, "");
  const exact = ENGLISH_CUES.get(cue);
  if (exact) return exact;
  if (/叹气|叹息|无奈/.test(cue)) return "sighs";
  if (/呼气|舒一口气/.test(cue)) return "exhales";
  if (/耳语|低声|悄悄话|悄声/.test(cue)) return "whispers";
  if (/温柔|轻柔|柔声|温声/.test(cue)) return "softly";
  if (/大笑|笑出声|笑着|轻笑|窃笑/.test(cue)) return "laughs";
  if (/兴奋|激动|惊喜/.test(cue)) return "excited";
  if (/好奇|试探/.test(cue)) return "curious";
  if (/哭|哽咽/.test(cue)) return "crying";
  if (/难过|伤心|悲伤/.test(cue)) return "sad";
  if (/慢慢|放慢|缓慢/.test(cue)) return "slow";
  return null;
}

/** @param {string} input */
function cueValues(input) {
  return [...input.matchAll(BRACKETED_CUE)].map((match) => (match[1] || match[2] || "").trim()).filter(Boolean);
}

/** @param {string} input */
export function cleanVoicePerformance(input) {
  const cleaned = input.replace(BRACKETED_CUE, " ").replace(/(?:\[|【)[^\]\】\r\n]{0,80}$/g, "");
  return tidy(cleaned);
}

/**
 * Some realtime providers send the complete prefix on every delta while others
 * send only the new token. Accept both without flashing duplicated prefixes.
 * @param {string} current
 * @param {string} incoming
 */
export function mergeStreamingText(current, incoming) {
  if (!incoming) return current;
  if (!current || incoming.startsWith(current)) return incoming;
  if (current.startsWith(incoming)) return current;
  return current + incoming;
}

/** @param {string} input */
export function visibleVoicePerformanceTags(input) {
  return [...new Set(cueValues(input).map((cue) => `[${cue}]`))];
}

/** @param {string} input */
export function prepareElevenV3Speech(input) {
  /** @type {string[]} */
  const tags = [];
  const speechText = input.replace(BRACKETED_CUE, (_match, ascii, fullWidth) => {
    const normalized = normalizedElevenCue(ascii || fullWidth || "");
    if (!normalized) return " ";
    const tag = `[${normalized}]`;
    tags.push(tag);
    return ` ${tag} `;
  });
  return { cleanText: cleanVoicePerformance(input), speechText: tidy(speechText), tags: [...new Set(tags)] };
}

/** @param {string[]} tags */
export function performanceSourceSuffix(tags) {
  return tags.length ? ` · 表演标签 ${tags.join("")}`.slice(0, 120) : "";
}
