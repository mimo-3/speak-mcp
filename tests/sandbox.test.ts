import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  expandUserHome,
  isInsideBase,
  prepareOutputDir,
  resolveOutputBaseDir,
  resolveOutputDir,
} from "../src/sandbox.js";

describe("isInsideBase", () => {
  it("requires a path separator boundary", () => {
    assert.equal(isInsideBase("/tmp/base", "/tmp/base"), true);
    assert.equal(isInsideBase("/tmp/base/file.wav", "/tmp/base"), true);
    assert.equal(isInsideBase("/tmp/base-other/file.wav", "/tmp/base"), false);
  });
});

describe("resolveOutputDir", () => {
  it("resolves relative paths inside the output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    try {
      const result = resolveOutputDir("sub/dir", base);
      assert.equal(result, path.join(base, "sub/dir"));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("allows the exact output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    try {
      assert.equal(resolveOutputDir(".", base), base);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects path traversal outside the output base", () => {
    assert.throws(
      () => resolveOutputDir("../../etc", "/tmp/speak-mcp-base"),
      /outside the allowed base directory/,
    );
  });

  it("rejects absolute paths outside the output base", () => {
    assert.throws(
      () => resolveOutputDir("/etc", "/tmp/speak-mcp-base"),
      /outside the allowed base directory/,
    );
  });

  it("rejects symlinks that resolve outside the output base", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-outside-"));
    const symlinkPath = path.join(base, "escape");
    fs.symlinkSync(outside, symlinkPath);

    try {
      assert.throws(
        () => resolveOutputDir("escape", base),
        /outside the allowed base directory/,
      );
    } finally {
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outside, { recursive: true, force: true });
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects symlink ancestors even when the requested subpath does not yet exist", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-outside-"));
    const symlinkPath = path.join(base, "evil");
    fs.symlinkSync(outside, symlinkPath);

    try {
      assert.throws(
        () => resolveOutputDir("evil/sub", base),
        /outside the allowed base directory/,
      );
    } finally {
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outside, { recursive: true, force: true });
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("prepareOutputDir", () => {
  it("creates a sandboxed directory and returns its resolved path", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    try {
      const result = await prepareOutputDir("a/b/c", base);
      assert.equal(result, path.join(base, "a/b/c"));
      assert.ok(fs.statSync(result).isDirectory());
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("rejects symlink ancestors before mkdir", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-base-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-outside-"));
    const symlinkPath = path.join(base, "evil");
    fs.symlinkSync(outside, symlinkPath);

    try {
      await assert.rejects(
        () => prepareOutputDir("evil/sub", base),
        /outside the allowed base directory/,
      );
      assert.equal(fs.existsSync(path.join(outside, "sub")), false);
    } finally {
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outside, { recursive: true, force: true });
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("expandUserHome", () => {
  it("expands a bare tilde to the home directory", () => {
    assert.equal(expandUserHome("~"), os.homedir());
  });

  it("expands a tilde-prefixed path", () => {
    assert.equal(expandUserHome("~/foo/bar"), path.join(os.homedir(), "foo/bar"));
  });

  it("leaves absolute paths unchanged", () => {
    assert.equal(expandUserHome("/abs/path"), "/abs/path");
  });

  it("leaves relative paths unchanged", () => {
    assert.equal(expandUserHome("rel/path"), "rel/path");
  });

  it("does not expand other-user tilde syntax", () => {
    assert.equal(expandUserHome("~user/foo"), "~user/foo");
  });
});

describe("resolveOutputBaseDir", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.SPEAK_MCP_OUTPUT_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SPEAK_MCP_OUTPUT_DIR;
    } else {
      process.env.SPEAK_MCP_OUTPUT_DIR = originalEnv;
    }
  });

  it("uses the default base directory when the env is unset", () => {
    delete process.env.SPEAK_MCP_OUTPUT_DIR;
    const result = resolveOutputBaseDir();
    assert.equal(result.usingDefault, true);
    assert.equal(result.dir, path.join(os.homedir(), "speak-mcp-output"));
  });

  it("uses the env value when set", () => {
    process.env.SPEAK_MCP_OUTPUT_DIR = "/tmp/explicit-base";
    const result = resolveOutputBaseDir();
    assert.equal(result.usingDefault, false);
    assert.equal(result.dir, "/tmp/explicit-base");
  });

  it("expands a tilde-prefixed env value", () => {
    process.env.SPEAK_MCP_OUTPUT_DIR = "~/audio";
    const result = resolveOutputBaseDir();
    assert.equal(result.usingDefault, false);
    assert.equal(result.dir, path.join(os.homedir(), "audio"));
  });
});
