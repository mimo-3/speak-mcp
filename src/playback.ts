import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertInsideBase } from "./sandbox.js";

export function isPlaybackEnabled(): boolean {
  return process.env.SPEAK_MCP_DISABLE_PLAYBACK !== "1";
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

  await new Promise<void>((resolve, reject) => {
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
