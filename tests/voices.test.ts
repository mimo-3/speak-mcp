import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_TTS_VOICES, isGeminiTtsVoice } from "../src/voices.js";

describe("Gemini TTS voices", () => {
  it("includes the preferred default voices", () => {
    assert.ok(GEMINI_TTS_VOICES.includes("Zephyr"));
    assert.ok(GEMINI_TTS_VOICES.includes("Leda"));
  });

  it("validates known voices", () => {
    assert.equal(isGeminiTtsVoice("Zephyr"), true);
    assert.equal(isGeminiTtsVoice("Leda"), true);
    assert.equal(isGeminiTtsVoice("NotAVoice"), false);
  });
});
