import { createGeminiProvider } from "./gemini.js";
import type { ProviderRegistration } from "./types.js";

type ProviderEntry = {
  provider: ProviderRegistration;
  modelId: string;
};

const modelMap = new Map<string, ProviderEntry>();
const GEMINI_MODEL_NAME = "gemini-3.1-flash-tts";

export function initRegistry(): string[] {
  modelMap.clear();

  const geminiKey =
    process.env.GEMINI_TTS_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    const provider = createGeminiProvider(geminiKey);
    for (const [name, modelId] of Object.entries(provider.models)) {
      modelMap.set(name, { provider, modelId });
    }
  }

  return [...modelMap.keys()];
}

export function getDefaultModel(): string | undefined {
  if (modelMap.has(GEMINI_MODEL_NAME)) return GEMINI_MODEL_NAME;
  return undefined;
}

function missingGeminiKeyError(): Error {
  return new Error(
    "Gemini TTS is not configured. Set GEMINI_TTS_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY, or call speak_text with provider: \"irodori\".",
  );
}

export function resolveModel(name: string): {
  modelId: string;
  speak: ProviderRegistration["speak"];
} {
  const entry = modelMap.get(name);
  if (!entry && name === GEMINI_MODEL_NAME) {
    throw missingGeminiKeyError();
  }
  if (!entry) {
    throw new Error(`Unknown model: ${name}`);
  }
  return { modelId: entry.modelId, speak: entry.provider.speak };
}
