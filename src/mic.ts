/**
 * Best-effort microphone-in-use detection.
 *
 * macOS does not expose "is the mic capturing right now?" through a stable,
 * dependency-free API, so this stays deliberately opt-in: the guard is only
 * active when the operator supplies a detector command via
 * `SPEAK_MCP_MIC_BUSY_CMD`. The command is run as-is; exit code 0 means "mic is
 * busy", anything else means "free". This lets each environment plug in whatever
 * actually works for it (a CoreAudio helper, `lsof`, a Shortcut, ...) without
 * baking a fragile heuristic in here.
 *
 * When no detector is configured, `isMicrophoneBusy()` reports "free" and the
 * playback path never blocks — speech behaves exactly as before.
 */

import { spawn } from "node:child_process";

/** Default per-check timeout for the detector command (ms). */
const DEFAULT_CHECK_TIMEOUT_MS = 1500;
/** Default poll interval while waiting for the mic to free up (ms). */
const DEFAULT_POLL_MS = 250;
/** Default cap on how long to wait for the mic before giving up (ms). */
const DEFAULT_MAX_WAIT_MS = 60_000;

/** True when a mic detector is configured, so the guard should run at all. */
export function isMicGuardEnabled(): boolean {
  return Boolean(process.env.SPEAK_MCP_MIC_BUSY_CMD?.trim());
}

export interface MicBusyOptions {
  /** Override the detector command (defaults to SPEAK_MCP_MIC_BUSY_CMD). */
  busyCmd?: string;
  /** Per-check timeout (ms). */
  timeoutMs?: number;
}

/**
 * Best-effort check: is the microphone currently in use? Returns false (free)
 * unless a detector command is configured and exits 0. Never throws.
 */
export function isMicrophoneBusy(opts: MicBusyOptions = {}): Promise<boolean> {
  const cmd = (opts.busyCmd ?? process.env.SPEAK_MCP_MIC_BUSY_CMD)?.trim();
  if (!cmd) return Promise.resolve(false);
  return runExitsZero(cmd, opts.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS);
}

export interface WaitForMicOptions {
  /** Cap on total wait (ms). After this we stop waiting and let the caller proceed. */
  maxWaitMs?: number;
  /** Poll interval (ms). */
  pollMs?: number;
  /** Injectable busy-check (for tests). */
  isBusy?: () => Promise<boolean>;
  /** Injectable clock (for tests). */
  now?: () => number;
}

/**
 * Poll until the mic is free or `maxWaitMs` elapses. Resolves true if the mic
 * became free, false if we gave up (the caller then plays anyway, preferring a
 * late line over silently dropping it).
 */
export async function waitForMicrophoneFree(
  opts: WaitForMicOptions = {},
): Promise<boolean> {
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const isBusy = opts.isBusy ?? (() => isMicrophoneBusy());
  const now = opts.now ?? Date.now;

  const start = now();
  for (;;) {
    if (!(await isBusy())) return true;
    if (now() - start >= maxWaitMs) return false;
    await sleep(pollMs);
  }
}

/** Run a shell command, resolving true iff it exits 0. Never rejects. */
function runExitsZero(cmd: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    // The command comes from local operator config (an env var), not from tool
    // input, so running it through a shell is acceptable here.
    const child = spawn(cmd, { shell: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish(false);
    }, timeoutMs);
    timer.unref?.();

    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}
