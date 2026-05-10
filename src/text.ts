export function composeTtsPrompt(text: string, stylePrompt?: string): string {
  const style = stylePrompt?.trim();
  if (!style) return text;

  return [
    `Voice and delivery instructions: ${style}`,
    "Speak only the following text; do not read these instructions aloud.",
    `Text: ${text}`,
  ].join("\n");
}
