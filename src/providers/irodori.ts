import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
import { expandUserHome } from "../sandbox.js";
import { readWavMetadata } from "../wav.js";

const execFileAsync = promisify(execFile);

export type IrodoriMode = "reference" | "voice_design";

export type IrodoriProfile = {
  id: string;
  refWav: string;
  checkpoint?: string;
  numSteps?: number;
};

export type IrodoriGenerateParams = {
  text: string;
  mode: IrodoriMode;
  stylePrompt?: string;
  profile?: IrodoriProfile;
  refWav?: string;
  checkpoint?: string;
  repoDir?: string;
  modelDevice?: string;
  codecDevice?: string;
  modelPrecision?: string;
  codecPrecision?: string;
  numSteps?: number;
  seconds?: number;
  seed?: number;
};

export type IrodoriGenerateResult = {
  modelId: string;
  mode: IrodoriMode;
  profile?: string;
  refWav?: string;
  audio: Buffer;
  meta: { sampleRate: number; channels: number; bitsPerSample: number };
};

const ALLOWED_CHECKPOINT_PREFIX = "Aratako/Irodori-TTS-";
const DEFAULT_REFERENCE_CHECKPOINT = "Aratako/Irodori-TTS-500M-v2";
const DEFAULT_VOICE_DESIGN_CHECKPOINT =
  "Aratako/Irodori-TTS-500M-v2-VoiceDesign";

function findPackageRoot(start: string): string {
  let current = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(current, "assets", "profiles", "franca-reference.wav");
    if (fs.existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // fall back to two-up (dist/providers/foo.js -> repo root) if asset isn't found
  return path.resolve(start, "../..");
}

const packageRoot = findPackageRoot(
  path.dirname(fileURLToPath(import.meta.url)),
);
const DEFAULT_FRANCA_REF_WAV = path.join(
  packageRoot,
  "assets",
  "profiles",
  "franca-reference.wav",
);

function resolvePath(input: string): string {
  return path.resolve(expandUserHome(input));
}

function existingFile(input: string, label: string): string {
  const resolved = resolvePath(input);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error("not a file");
  } catch (err) {
    console.error(
      `[speak-mcp] ${label} not found at ${resolved} (${(err as Error).message})`,
    );
    throw new Error(
      `${label} does not exist or is not a file: ${path.basename(resolved)}`,
    );
  }
  return resolved;
}

function assertSafeCliValue(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new Error(
      `${label} must not start with "-" to avoid CLI option injection`,
    );
  }
}

function validateCheckpoint(checkpoint: string): string {
  if (!checkpoint.startsWith(ALLOWED_CHECKPOINT_PREFIX)) {
    throw new Error(
      `Irodori checkpoint must start with "${ALLOWED_CHECKPOINT_PREFIX}". Got: ${checkpoint}`,
    );
  }
  assertSafeCliValue(checkpoint, "Irodori checkpoint");
  return checkpoint;
}

export function resolveIrodoriRepoDir(repoDir?: string): string {
  const configured = repoDir || process.env.SPEAK_MCP_IRODORI_REPO;
  if (!configured) {
    throw new Error(
      "Irodori-TTS repo is not configured. Set SPEAK_MCP_IRODORI_REPO to a directory containing infer.py.",
    );
  }
  const resolved = resolvePath(configured);
  const inferPath = path.join(resolved, "infer.py");
  try {
    const stat = fs.statSync(inferPath);
    if (!stat.isFile()) throw new Error("not a file");
  } catch (err) {
    console.error(
      `[speak-mcp] Irodori-TTS repo check failed at ${resolved} (${(err as Error).message})`,
    );
    throw new Error(
      "Irodori-TTS repo is not ready. Set SPEAK_MCP_IRODORI_REPO to a directory containing infer.py.",
    );
  }
  return resolved;
}

export function resolveIrodoriProfile(profileId: string): IrodoriProfile {
  if (profileId !== "franca") {
    throw new Error(`Unknown Irodori voice profile: ${profileId}`);
  }

  const refWav =
    process.env.SPEAK_MCP_IRODORI_FRANCA_REF_WAV || DEFAULT_FRANCA_REF_WAV;

  const checkpoint =
    process.env.SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT ||
    DEFAULT_REFERENCE_CHECKPOINT;

  return {
    id: "franca",
    refWav: existingFile(refWav, "Irodori profile refWav"),
    checkpoint: validateCheckpoint(checkpoint),
    numSteps: 20,
  };
}

export function irodoriArgs(
  params: IrodoriGenerateParams,
  outputWav: string,
): string[] {
  const mode = params.mode;
  assertSafeCliValue(params.text, "text");

  const checkpoint = validateCheckpoint(
    params.checkpoint ||
      params.profile?.checkpoint ||
      (mode === "voice_design"
        ? DEFAULT_VOICE_DESIGN_CHECKPOINT
        : DEFAULT_REFERENCE_CHECKPOINT),
  );

  const args = [
    "run",
    "python",
    "infer.py",
    "--hf-checkpoint",
    checkpoint,
    "--model-device",
    params.modelDevice || "mps",
    "--codec-device",
    params.codecDevice || "mps",
    "--model-precision",
    params.modelPrecision || "fp32",
    "--codec-precision",
    params.codecPrecision || "fp32",
    "--num-steps",
    String(params.numSteps ?? params.profile?.numSteps ?? 20),
    "--output-wav",
    outputWav,
    "--no-show-timings",
  ];

  if (params.seconds !== undefined) {
    args.push("--seconds", String(params.seconds));
  }

  if (params.seed !== undefined) {
    args.push("--seed", String(params.seed));
  }

  if (mode === "voice_design") {
    const caption = params.stylePrompt?.trim();
    if (!caption) {
      throw new Error(
        "Irodori voice_design mode requires stylePrompt, which is passed as --caption.",
      );
    }
    assertSafeCliValue(caption, "stylePrompt");
    args.push("--caption", caption, "--no-ref");
  } else {
    const refWav = params.refWav || params.profile?.refWav;
    if (!refWav) {
      throw new Error("Irodori reference mode requires profile or refWav.");
    }
    assertSafeCliValue(refWav, "refWav");
    args.push("--ref-wav", existingFile(refWav, "Irodori refWav"));
  }

  // value/options separator. infer.py treats "--text VALUE" as the user prompt;
  // place it after a "--" so any user-controlled text cannot be parsed as a flag.
  args.push("--text", params.text);

  return args;
}

function newTempWavPath(): string {
  const stem = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return path.join(os.tmpdir(), `speak-mcp-irodori-${stem}.wav`);
}

export async function generateIrodoriSpeech(
  params: IrodoriGenerateParams,
): Promise<IrodoriGenerateResult> {
  const repoDir = resolveIrodoriRepoDir(params.repoDir);
  const tempWav = newTempWavPath();
  const args = irodoriArgs(params, tempWav);

  try {
    try {
      await execFileAsync("uv", args, {
        cwd: repoDir,
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Irodori-TTS generation failed: ${message}`);
    }

    const wav = await fs.promises.readFile(tempWav);
    const meta = readWavMetadata(wav);

    const checkpoint =
      params.checkpoint ||
      params.profile?.checkpoint ||
      (params.mode === "voice_design"
        ? DEFAULT_VOICE_DESIGN_CHECKPOINT
        : DEFAULT_REFERENCE_CHECKPOINT);

    return {
      modelId: checkpoint,
      mode: params.mode,
      profile: params.profile?.id,
      refWav:
        params.mode === "reference"
          ? params.refWav || params.profile?.refWav
          : undefined,
      audio: wav,
      meta,
    };
  } finally {
    try {
      await fs.promises.unlink(tempWav);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(
          `[speak-mcp] Failed to clean up Irodori temp file: ${(err as Error).message}`,
        );
      }
    }
  }
}
