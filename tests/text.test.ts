import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeTtsPrompt } from "../src/text.js";

describe("composeTtsPrompt", () => {
  it("returns raw text without style instructions", () => {
    assert.equal(composeTtsPrompt("hello"), "hello");
  });

  it("includes style instructions when provided", () => {
    const prompt = composeTtsPrompt("hello", "warm and concise");
    assert.match(prompt, /warm and concise/);
    assert.match(prompt, /Text: hello/);
  });
});
