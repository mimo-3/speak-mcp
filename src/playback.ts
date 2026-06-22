import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { assertInsideBase } from "./sandbox.js";
import {
  isMicGuardEnabled,
  waitForMicrophoneFree,
} from "./mic.js";

export function isPlaybackEnabled(): boolean {
  return process.env.SPEAK_MCP_DISABLE_PLAYBACK !== "1";
}

// --- playback serialization lock --------------------------------------------
//
// Multiple speak-mcp processes (or any tool sharing this lock path) must not
// play audio over each other. A tiny file lock at a well-known path serialises
// playback across processes: an acquirer either creates the lock, reclaims one
// that is stale / abandoned / corrupt, or waits for the live holder to release.

/** Shape persisted in the lock file. */
interface LockInfo {
  pid: number;
  time: number;
}

/** Reclaim a lock whose holder hasn't refreshed it within this long (ms). */
const DEFAULT_STALE_MS = 10 * 60_000;
/** Max time to wait for a live holder before giving up and skipping the lock (ms). */
const DEFAULT_MAX_WAIT_MS = 2 * 60_000;
/** Poll interval while waiting for a held lock (ms). */
const DEFAULT_POLL_MS = 100;

export interface PlaybackLockOptions {
  /** Path to the lock file. */
  lockPath: string;
  /** Reclaim the lock if its timestamp is older than this (ms). */
  staleMs?: number;
  /** Give up waiting for a live holder after this long (ms). */
  maxWaitMs?: number;
  /** Poll interval while a live holder is waited on (ms). */
  pollMs?: number;
  /** Injectable clock (for tests). */
  now?: () => number;
}

/** Default cross-process lock path (per-user temp dir; override with env). */
export function resolvePlaybackLockPath(): string {
  return (
    process.env.SPEAK_MCP_LOCK_PATH ||
    path.join(os.tmpdir(), "speak-mcp", "playback.lock")
  );
}

/**
 * Acquire the playback lock, returning a `release()` function. If a live holder
 * keeps the lock past `maxWaitMs`, this gives up and returns a no-op release
 * (the caller may then play anyway) without disturbing the other holder.
 */
export async function acquirePlaybackLock(
  opts: PlaybackLockOptions,
): Promise<() => void> {
  const {
    lockPath,
    staleMs = DEFAULT_STALE_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    pollMs = DEFAULT_POLL_MS,
    now = Date.now,
  } = opts;

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = now() + maxWaitMs;
  const ourData = (): string =>
    JSON.stringify({ pid: process.pid, time: now() } satisfies LockInfo);

  for (;;) {
    // Fast path: create the lock exclusively.
    try {
      fs.writeFileSync(lockPath, ourData(), { flag: "wx" });
      return makeRelease(lockPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    // Lock exists — inspect the holder and decide whether to reclaim it.
    const info = readLockInfo(lockPath);
    if (shouldReclaim(info, now(), staleMs)) {
      fs.writeFileSync(lockPath, ourData()); // steal (overwrite)
      return makeRelease(lockPath);
    }

    // A live, fresh holder: wait and retry, or give up past the deadline.
    if (now() >= deadline) {
      return () => {
        /* no-op: we never held the lock, so don't touch the holder's file */
      };
    }
    await sleep(pollMs);
  }
}

/** Build an idempotent release that only deletes a lock we still own. */
function makeRelease(lockPath: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const info = readLockInfo(lockPath);
      if (info && info.pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* best-effort: a missing/!owned lock needs no cleanup */
    }
  };
}

/** Read + validate the lock file; null if missing, unreadable, or corrupt. */
function readLockInfo(lockPath: string): LockInfo | null {
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as LockInfo).pid === "number" &&
      typeof (parsed as LockInfo).time === "number"
    ) {
      return { pid: (parsed as LockInfo).pid, time: (parsed as LockInfo).time };
    }
    return null;
  } catch {
    return null;
  }
}

/** A lock is reclaimable when it's corrupt, stale by age, or held by a dead pid. */
function shouldReclaim(
  info: LockInfo | null,
  nowMs: number,
  staleMs: number,
): boolean {
  if (!info) return true;
  if (nowMs - info.time > staleMs) return true;
  return !isProcessAlive(info.pid);
}

/** True if a process with `pid` is currently alive (best-effort). */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we may not signal it → still alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

export function resolvePlayableFile(
  filePath: string,
  outputBaseDir: string,
): string {
  const base = path.resolve(outputBaseDir);
  const resolved = path.resolve(filePath);

  assertInsideBase(resolved, base, "audio file");

  let realResolved: string;
  let realBase: string;
  try {
    realResolved = fs.realpathSync(resolved);
    realBase = fs.realpathSync(base);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`audio file not found: ${resolved}`);
    }
    throw err;
  }

  assertInsideBase(
    realResolved,
    realBase,
    "audio file (resolved through symlinks)",
  );

  return resolved;
}

export async function playAudioFile(filePath: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Audio playback is currently supported on macOS only.");
  }

  // Serialise against any other speak-mcp playback so lines never overlap.
  const release = await acquirePlaybackLock({
    lockPath: resolvePlaybackLockPath(),
  });
  try {
    // If a mic detector is configured, hold off while the mic is in use so we
    // don't talk over a call/recording. Best-effort: after the cap we proceed.
    if (isMicGuardEnabled()) {
      await waitForMicrophoneFree();
    }
    await runAfplay(filePath);
  } finally {
    release();
  }
}

/** Spawn afplay and resolve when playback ends; reject on error/non-zero exit. */
function runAfplay(filePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("afplay", [filePath], { stdio: "ignore" });

    let settled = false;
    const settle = (run: () => void): void => {
      if (settled) return;
      settled = true;
      run();
    };

    child.once("error", (err) => settle(() => reject(err)));
    child.once("exit", (code) => {
      if (code === 0) {
        settle(() => resolve());
        return;
      }
      settle(() =>
        reject(new Error(`afplay exited with code ${code ?? "unknown"}`)),
      );
    });
  });
}
