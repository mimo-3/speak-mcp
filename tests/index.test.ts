import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { isEntrypoint, runSpeakText, type GeneratedAudio, type SpeakTextInput } from "../src/index.js";
import { pcmToWav } from "../src/wav.js";

const VOICE = "Zephyr" as const;

function freshSandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-test-"));
}

function fakeWavBuffer(): Buffer {
  return pcmToWav(Buffer.from([0x01, 0x02, 0x03, 0x04]), {
    channels: 1,
    sampleRate: 24_000,
    bitsPerSample: 16,
  });
}

function buildInput(overrides: Partial<SpeakTextInput> = {}): SpeakTextInput {
  return {
    text: "hello",
    provider: "gemini",
    model: "gemini-3.1-flash-tts",
    voice: VOICE,
    outputDir: ".",
    play: true,
    keepFiles: false,
    ...overrides,
  };
}

function fakeGenerate(): GeneratedAudio {
  return {
    audio: fakeWavBuffer(),
    containerFormat: "wav",
    modelId: "fake-model",
    meta: { sampleRate: 24_000, channels: 1, bitsPerSample: 16 },
  };
}

describe("runSpeakText", () => {
  it("does not play and keeps the file when play is false", async () => {
    const outputBaseDir = freshSandbox();
    let played = false;

    const result = await runSpeakText(buildInput({ play: false }), {
      outputBaseDir,
      defaultStylePrompt: undefined,
      generate: async () => fakeGenerate(),
      play: async () => {
        played = true;
      },
    });

    assert.equal(played, false);
    assert.equal(result.played, false);
    assert.deepEqual(result.deletedFiles, []);
    assert.equal(result.keptFiles, true);
    assert.ok(fs.existsSync(result.savedFile));

    fs.rmSync(outputBaseDir, { recursive: true, force: true });
  });

  it("keeps the file when keepFiles is true", async () => {
    const outputBaseDir = freshSandbox();

    const result = await runSpeakText(buildInput({ keepFiles: true }), {
      outputBaseDir,
      defaultStylePrompt: undefined,
      generate: async () => fakeGenerate(),
      play: async () => undefined,
    });

    assert.equal(result.played, true);
    assert.deepEqual(result.deletedFiles, []);
    assert.equal(result.keptFiles, true);
    assert.ok(fs.existsSync(result.savedFile));

    fs.rmSync(outputBaseDir, { recursive: true, force: true });
  });

  it("deletes the file by default after successful playback", async () => {
    const outputBaseDir = freshSandbox();

    const result = await runSpeakText(buildInput(), {
      outputBaseDir,
      defaultStylePrompt: undefined,
      generate: async () => fakeGenerate(),
      play: async () => undefined,
    });

    assert.equal(result.played, true);
    assert.equal(result.deletedFiles.length, 1);
    assert.equal(result.keptFiles, false);
    assert.ok(!fs.existsSync(result.savedFile));

    fs.rmSync(outputBaseDir, { recursive: true, force: true });
  });

  it("still cleans up the file when playback fails", async () => {
    const outputBaseDir = freshSandbox();

    let savedFilePath: string | undefined;
    await assert.rejects(
      runSpeakText(buildInput(), {
        outputBaseDir,
        defaultStylePrompt: undefined,
        generate: async () => fakeGenerate(),
        play: async (filePath) => {
          savedFilePath = filePath;
          throw new Error("simulated playback failure");
        },
      }),
      /simulated playback failure/,
    );

    assert.ok(savedFilePath, "play should have been invoked");
    assert.ok(!fs.existsSync(savedFilePath!));

    fs.rmSync(outputBaseDir, { recursive: true, force: true });
  });
});

describe("isEntrypoint", () => {
  it("returns true when argv[1] points at the module file directly", () => {
    const tmpDir = freshSandbox();
    const file = path.join(tmpDir, "entry.js");
    fs.writeFileSync(file, "");
    try {
      assert.equal(isEntrypoint(file, pathToFileURL(file).href), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns true when argv[1] is a symlink resolving to the module file (npx case)", () => {
    const tmpDir = freshSandbox();
    const file = path.join(tmpDir, "entry.js");
    const symlinkPath = path.join(tmpDir, "bin-symlink");
    fs.writeFileSync(file, "");
    fs.symlinkSync(file, symlinkPath);
    try {
      assert.equal(isEntrypoint(symlinkPath, pathToFileURL(file).href), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns false when argv[1] points at an unrelated existing file", () => {
    const tmpDir = freshSandbox();
    const file = path.join(tmpDir, "entry.js");
    const other = path.join(tmpDir, "other.js");
    fs.writeFileSync(file, "");
    fs.writeFileSync(other, "");
    try {
      assert.equal(isEntrypoint(other, pathToFileURL(file).href), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns false (without throwing) when argv[1] does not exist", () => {
    const tmpDir = freshSandbox();
    const file = path.join(tmpDir, "entry.js");
    const missing = path.join(tmpDir, "does-not-exist.js");
    fs.writeFileSync(file, "");
    try {
      assert.equal(isEntrypoint(missing, pathToFileURL(file).href), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns false when argv[1] is empty", () => {
    assert.equal(isEntrypoint("", pathToFileURL("/tmp/unused.js").href), false);
  });
});
