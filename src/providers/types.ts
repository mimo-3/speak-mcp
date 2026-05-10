import type { GeminiTtsVoice } from "../voices.js";

export type SpeakParams = {
  text: string;
  modelId: string;
  voice: GeminiTtsVoice;
};

export type SpeakResult = {
  audio: Buffer;
  containerFormat: "pcm" | "wav";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

export type ProviderRegistration = {
  models: Record<string, string>;
  speak(params: SpeakParams): Promise<SpeakResult>;
};
