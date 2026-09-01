import assert from "node:assert/strict";
import test from "node:test";
import { buildSandboxedToyDocument, parseToyBridgeEvent, validateToyHtml, WHACK_A_MOLE_HTML } from "../dist/index.js";

test("bundled whack-a-mole is a valid complete offline toy", () => {
  assert.equal(validateToyHtml(WHACK_A_MOLE_HTML), WHACK_A_MOLE_HTML);
  assert.match(WHACK_A_MOLE_HTML, /FuyueToy\?\.emit/);
});

test("sandboxed document installs a network-denying CSP and token bridge", () => {
  const output = buildSandboxedToyDocument(WHACK_A_MOLE_HTML, "session-safe");
  assert.match(output, /connect-src 'none'/);
  assert.match(output, /sandbox|session-safe/);
  assert.doesNotMatch(output, /https?:\/\//);
});

test("validator rejects embedded pages and external resources", () => {
  assert.throws(() => validateToyHtml('<!doctype html><html><iframe src="https://example.com"></iframe></html>'));
  assert.throws(() => validateToyHtml('<!doctype html><html><script src="https://example.com/a.js"></script></html>'));
});

test("bridge parser requires the current token and bounds details", () => {
  const input = { source: "fuyue-toy", version: 1, token: "right", type: "score", eventId: "toy.1.abc", summary: "得分", details: { score: 4, nested: { no: true } } };
  assert.equal(parseToyBridgeEvent(input, "wrong"), null);
  assert.deepEqual(parseToyBridgeEvent(input, "right")?.details, { score: 4 });
});
