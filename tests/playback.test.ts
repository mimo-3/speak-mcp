import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { acquirePlaybackLock, resolvePlayableFile } from "../src/playback.js";

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

describe("acquirePlaybackLock", () => {
  function lockDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "speak-mcp-lock-"));
  }

  it("creates the lock file and removes it on release", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      const release = await acquirePlaybackLock({ lockPath });
      assert.equal(fs.existsSync(lockPath), true);
      const info = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      assert.equal(info.pid, process.pid);
      release();
      assert.equal(fs.existsSync(lockPath), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("release is idempotent", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      const release = await acquirePlaybackLock({ lockPath });
      release();
      assert.doesNotThrow(() => release());
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a lock with a stale timestamp", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      // Held by this (live) process but written long ago → stale by age.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, time: 1_000 }),
      );
      const release = await acquirePlaybackLock({
        lockPath,
        staleMs: 5_000,
        now: () => 1_000_000,
      });
      const info = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      assert.equal(info.time, 1_000_000);
      release();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a lock held by a dead process", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      // PID 0x7fffffff is effectively guaranteed not to exist.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 0x7fffffff, time: 2_000_000 }),
      );
      const release = await acquirePlaybackLock({
        lockPath,
        staleMs: 60_000,
        now: () => 2_000_000,
      });
      const info = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      assert.equal(info.pid, process.pid);
      release();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a corrupt lock file", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      fs.writeFileSync(lockPath, "not json");
      const release = await acquirePlaybackLock({ lockPath, maxWaitMs: 500 });
      const info = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      assert.equal(info.pid, process.pid);
      release();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gives up on a live holder after maxWaitMs and returns a no-op release", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      // Live holder (this process), fresh timestamp → never stale.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, time: 5_000_000 }),
      );
      const release = await acquirePlaybackLock({
        lockPath,
        staleMs: 60_000,
        maxWaitMs: 0,
        now: () => 5_000_000,
      });
      // The pre-existing lock must be left untouched...
      const info = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      assert.equal(info.time, 5_000_000);
      // ...and the no-op release must not delete the other holder's lock.
      release();
      assert.equal(fs.existsSync(lockPath), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serialises two acquirers on the same lock path", async () => {
    const dir = lockDir();
    const lockPath = path.join(dir, "playback.lock");
    try {
      const release1 = await acquirePlaybackLock({ lockPath });
      let secondAcquired = false;
      const second = acquirePlaybackLock({ lockPath, pollMs: 10 }).then(
        (release) => {
          secondAcquired = true;
          return release;
        },
      );
      // Give the second acquirer a chance to (not) proceed while held.
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(secondAcquired, false);
      release1();
      const release2 = await second;
      assert.equal(secondAcquired, true);
      release2();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
