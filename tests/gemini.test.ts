import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractInlineAudio, isWav } from "../src/providers/gemini.js";

const modelId = "gemini-3.1-flash-tts-preview";

describe("extractInlineAudio", () => {
  it("returns the inline audio payload from a well-formed response", () => {
    const data = "AAECAw==";
    const response = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data } }],
          },
        },
      ],
    } as unknown as Parameters<typeof extractInlineAudio>[0];

    assert.equal(extractInlineAudio(response, modelId), data);
  });

  it("throws when candidates is missing", () => {
    const response = {} as unknown as Parameters<typeof extractInlineAudio>[0];
    assert.throws(() => extractInlineAudio(response, modelId), /No candidates/);
  });

  it("throws when content parts are empty", () => {
    const response = {
      candidates: [{ content: { parts: [] } }],
    } as unknown as Parameters<typeof extractInlineAudio>[0];
    assert.throws(
      () => extractInlineAudio(response, modelId),
      /No content parts/,
    );
  });

  it("throws when inlineData is missing", () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{}],
          },
        },
      ],
    } as unknown as Parameters<typeof extractInlineAudio>[0];
    assert.throws(
      () => extractInlineAudio(response, modelId),
      /No inline audio data/,
    );
  });
});

describe("isWav", () => {
  it("detects the WAV container gemini-3.8 returns", () => {
    const header = Buffer.alloc(12);
    header.write("RIFF", 0, "ascii");
    header.write("WAVE", 8, "ascii");
    assert.equal(isWav(header), true);
  });

  it("treats headerless PCM from gemini-3.1 as not WAV", () => {
    assert.equal(isWav(Buffer.from([0x01, 0x02, 0x03, 0x04])), false);
  });
});
