import { GoogleGenAI } from "@google/genai";
import { readWavMetadata } from "../wav.js";
import type { ProviderRegistration, SpeakParams, SpeakResult } from "./types.js";

type GenerateContentResponse = Awaited<
  ReturnType<GoogleGenAI["models"]["generateContent"]>
>;

export function extractInlineAudio(
  response: GenerateContentResponse,
  modelId: string,
): string {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new Error(`No candidates returned by ${modelId}`);
  }
  const part = candidate.content?.parts?.[0];
  if (!part) {
    throw new Error(`No content parts returned by ${modelId}`);
  }
  const data = part.inlineData?.data;
  if (!data) {
    throw new Error(`No inline audio data returned by ${modelId}`);
  }
  return data;
}

export function isWav(audio: Buffer): boolean {
  return (
    audio.length >= 12 &&
    audio.toString("ascii", 0, 4) === "RIFF" &&
    audio.toString("ascii", 8, 12) === "WAVE"
  );
}

function summarizeGeminiError(err: unknown, modelId: string): string {
  const e = err as { name?: string; status?: number | string };
  const name = (e && typeof e.name === "string" && e.name) || "Error";
  const status =
    e && (typeof e.status === "number" || typeof e.status === "string")
      ? String(e.status)
      : "unknown";
  return `name=${name} status=${status} model=${modelId}`;
}

export function createGeminiProvider(apiKey: string): ProviderRegistration {
  const ai = new GoogleGenAI({ apiKey });

  const speak = async (params: SpeakParams): Promise<SpeakResult> => {
    let response: GenerateContentResponse;
    try {
      response = await ai.models.generateContent({
        model: params.modelId,
        contents: [{ parts: [{ text: params.text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: params.voice,
              },
            },
          },
        },
      });
    } catch (err) {
      console.error(
        `[speak-mcp] Gemini provider error: ${summarizeGeminiError(err, params.modelId)}`,
      );
      throw new Error(`Failed to call Gemini TTS (model: ${params.modelId})`);
    }

    const audio = Buffer.from(extractInlineAudio(response, params.modelId), "base64");

    // 3.1 returns headerless 24kHz/mono/16-bit PCM; 3.8 returns WAV by default,
    // so report the format its own header declares.
    if (isWav(audio)) {
      return { audio, containerFormat: "wav", ...readWavMetadata(audio) };
    }
    return {
      audio,
      containerFormat: "pcm",
      sampleRate: 24_000,
      channels: 1,
      bitsPerSample: 16,
    };
  };

  return {
    models: {
      "gemini-3.8-flash-tts": "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts": "gemini-3.8-flash-lite-tts",
      "gemini-3.1-flash-tts": "gemini-3.1-flash-tts-preview",
    },
    speak,
  };
}
