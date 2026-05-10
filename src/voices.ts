export const GEMINI_TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number];

export function isGeminiTtsVoice(value: unknown): value is GeminiTtsVoice {
  return (
    typeof value === "string" &&
    (GEMINI_TTS_VOICES as readonly string[]).includes(value)
  );
}

export function getDefaultVoice(): GeminiTtsVoice {
  const configured = process.env.SPEAK_MCP_DEFAULT_VOICE;
  if (!configured) return "Zephyr";
  if (!isGeminiTtsVoice(configured)) {
    throw new Error(
      `Invalid SPEAK_MCP_DEFAULT_VOICE: ${configured}. Supported voices: ${GEMINI_TTS_VOICES.join(", ")}`,
    );
  }
  return configured;
}
