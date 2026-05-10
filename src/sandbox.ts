import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function isInsideBase(resolved: string, base: string): boolean {
  return resolved === base || resolved.startsWith(base + path.sep);
}

export function assertInsideBase(
  resolved: string,
  base: string,
  label: string,
): void {
  if (!isInsideBase(resolved, base)) {
    throw new Error(
      `${label} is outside the allowed base directory (${base})`,
    );
  }
}

export function getDefaultOutputBaseDir(): string {
  return path.join(os.homedir(), "speak-mcp-output");
}

export function expandUserHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function resolveOutputBaseDir(): { dir: string; usingDefault: boolean } {
  const fromEnv = process.env.SPEAK_MCP_OUTPUT_DIR;
  if (fromEnv) {
    return { dir: path.resolve(expandUserHome(fromEnv)), usingDefault: false };
  }
  return { dir: getDefaultOutputBaseDir(), usingDefault: true };
}

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return target;
    throw err;
  }
}

function findExistingAncestorWithinBase(
  target: string,
  base: string,
): string | null {
  let current = target;
  while (true) {
    try {
      fs.accessSync(current);
      return current;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (current === base) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    if (!isInsideBase(parent, base)) return null;
    current = parent;
  }
}

export function resolveOutputDir(
  outputDir: string,
  outputBaseDir: string,
): string {
  const base = path.resolve(outputBaseDir);
  const resolved = path.resolve(base, outputDir);

  assertInsideBase(resolved, base, "outputDir");

  const existingAncestor = findExistingAncestorWithinBase(resolved, base);
  if (existingAncestor !== null) {
    const realAncestor = fs.realpathSync(existingAncestor);
    const realBase = realpathOrSelf(base);
    assertInsideBase(
      realAncestor,
      realBase,
      "outputDir (resolved through symlinks)",
    );
  }

  return resolved;
}

export async function prepareOutputDir(
  outputDir: string,
  outputBaseDir: string,
): Promise<string> {
  const resolved = resolveOutputDir(outputDir, outputBaseDir);
  await fs.promises.mkdir(resolved, { recursive: true });

  const realResolved = fs.realpathSync(resolved);
  const realBase = fs.realpathSync(path.resolve(outputBaseDir));
  assertInsideBase(
    realResolved,
    realBase,
    "outputDir (after mkdir, resolved through symlinks)",
  );

  return resolved;
}
