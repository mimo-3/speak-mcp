import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePlayableFile } from "../src/playback.js";

describe("resolvePlayableFile", () => {
  it("allows files inside the output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const file = path.join(base, "voice.wav");
    fs.writeFileSync(file, Buffer.alloc(0));
    try {
      assert.equal(resolvePlayableFile(file, base), file);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects files outside the output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-outside-"));
    const file = path.join(outside, "voice.wav");
    fs.writeFileSync(file, Buffer.alloc(0));
    try {
      assert.throws(
        () => resolvePlayableFile(file, base),
        /outside the allowed base directory/,
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects symlinks that escape the output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-outside-"));
    const target = path.join(outside, "secret.wav");
    fs.writeFileSync(target, Buffer.alloc(0));
    const link = path.join(base, "leak.wav");
    fs.symlinkSync(target, link);
    try {
      assert.throws(
        () => resolvePlayableFile(link, base),
        /outside the allowed base directory/,
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects missing files", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    try {
      assert.throws(
        () => resolvePlayableFile(path.join(base, "missing.wav"), base),
        /audio file not found/,
      );
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
