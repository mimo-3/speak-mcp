import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  irodoriArgs,
  resolveIrodoriProfile,
  type IrodoriGenerateParams,
} from "../src/providers/irodori.js";

const outputWav = "/tmp/speak-mcp-test.wav";

function baseArgs(overrides: Partial<IrodoriGenerateParams>): IrodoriGenerateParams {
  return {
    text: "こんにちは",
    mode: "reference",
    ...overrides,
  };
}

describe("resolveIrodoriProfile", () => {
  it("returns the franca profile with default checkpoint", () => {
    const profile = resolveIrodoriProfile("franca");
    assert.equal(profile.id, "franca");
    assert.match(profile.checkpoint ?? "", /^Aratako\/Irodori-TTS-/);
    assert.equal(profile.numSteps, 20);
    assert.match(profile.refWav, /franca-reference\.wav$/);
  });

  it("throws on unknown profile id", () => {
    assert.throws(() => resolveIrodoriProfile("unknown"), /Unknown Irodori voice profile/);
  });

  it("rejects non-Aratako checkpoint override", () => {
    const original = process.env.SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT;
    process.env.SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT = "evil/Other-Model";
    try {
      assert.throws(
        () => resolveIrodoriProfile("franca"),
        /Irodori checkpoint must start with/,
      );
    } finally {
      if (original === undefined) {
        delete process.env.SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT;
      } else {
        process.env.SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT = original;
      }
    }
  });
});

describe("irodoriArgs", () => {
  it("builds args for voice_design mode with caption", () => {
    const args = irodoriArgs(
      baseArgs({
        mode: "voice_design",
        stylePrompt: "low calm voice",
      }),
      outputWav,
    );

    assert.ok(args.includes("--caption"));
    assert.ok(args.includes("low calm voice"));
    assert.ok(args.includes("--no-ref"));
    // text is appended at the end after the options to avoid being parsed as a flag
    const textIndex = args.indexOf("--text");
    assert.ok(textIndex >= 0);
    assert.equal(args[textIndex + 1], "こんにちは");
    assert.equal(
      args[args.indexOf("--hf-checkpoint") + 1],
      "Aratako/Irodori-TTS-500M-v2-VoiceDesign",
    );
  });

  it("throws when voice_design caption is missing", () => {
    assert.throws(
      () =>
        irodoriArgs(
          baseArgs({ mode: "voice_design", stylePrompt: undefined }),
          outputWav,
        ),
      /voice_design mode requires stylePrompt/,
    );
  });

  it("builds args for reference mode using a profile", () => {
    const profile = resolveIrodoriProfile("franca");
    const args = irodoriArgs(baseArgs({ profile }), outputWav);

    assert.equal(args[args.indexOf("--ref-wav") + 1], profile.refWav);
    assert.equal(
      args[args.indexOf("--hf-checkpoint") + 1],
      "Aratako/Irodori-TTS-500M-v2",
    );
    assert.ok(!args.includes("--no-ref"));
    assert.ok(!args.includes("--caption"));
  });

  it("uses refWav override over profile refWav", () => {
    const profile = resolveIrodoriProfile("franca");
    const args = irodoriArgs(
      baseArgs({ profile, refWav: profile.refWav }),
      outputWav,
    );

    const refWavIndex = args.indexOf("--ref-wav");
    assert.equal(args[refWavIndex + 1], profile.refWav);
  });

  it("propagates numSteps from the profile when not provided", () => {
    const profile = resolveIrodoriProfile("franca");
    const args = irodoriArgs(baseArgs({ profile }), outputWav);
    assert.equal(args[args.indexOf("--num-steps") + 1], String(profile.numSteps));
  });

  it("omits --seconds when seconds is undefined", () => {
    const profile = resolveIrodoriProfile("franca");
    const args = irodoriArgs(baseArgs({ profile }), outputWav);
    assert.equal(args.indexOf("--seconds"), -1);
  });

  it("rejects text starting with a dash", () => {
    const profile = resolveIrodoriProfile("franca");
    assert.throws(
      () =>
        irodoriArgs(
          baseArgs({ profile, text: "--evil" }),
          outputWav,
        ),
      /text must not start with/,
    );
  });
});
