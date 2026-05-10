# Architecture

`speak-mcp` is a narrow MCP server for deterministic text-to-speech generation.

```text
MCP client
  -> speak_text tool
  -> Gemini TTS provider
  -> local WAV file
  -> local audio playback
  -> optional cleanup
  -> JSON metadata response
```

## Goals

- Let coding agents and MCP clients speak exact text through a small tool surface.
- Save audio files locally instead of streaming opaque binary data through MCP responses.
- Play generated speech by default so agents can speak with one tool call.
- Generate the full input text in a single TTS request so prosody stays unified.
- Delete generated files after playback by default to reduce local retention.
- Keep provider credentials in environment variables only.
- Avoid logging input text, provider payloads, or generated audio.
- Keep the implementation provider-shaped so more TTS engines can be added later.

## Non-goals

- No microphone input.
- No speech-to-text.
- No realtime voice conversation loop.
- No remote audio streaming.
- No long-running Live API or WebSocket session management.

## Tool Surface

### `speak_text`

Inputs:

- `text`: text to synthesize
- `model`: public model alias, currently `gemini-3.1-flash-tts`
- `voice`: Gemini prebuilt voice, defaulting to `Zephyr` unless `SPEAK_MCP_DEFAULT_VOICE` is set
- `outputDir`: sandboxed relative output directory
- `play`: whether to play the generated audio after saving it, defaulting to `true`
- `keepFiles`: whether to keep files after playback
- `stylePrompt`: per-call voice and delivery instructions

Output:

- model ID
- voice
- saved `.wav` path
- deleted file paths
- audio metadata
- whether playback ran

The tool returns metadata only. It does not return the input text or audio bytes.

### `play_audio`

Inputs:

- `filePath`: existing audio file under `SPEAK_MCP_OUTPUT_DIR`

Output:

- played file path

This tool is intentionally limited to the output sandbox.

## Provider Boundary

The Gemini provider interface is intentionally small:

```ts
type SpeakParams = {
  text: string;
  modelId: string;
  voice: GeminiTtsVoice;
};

type SpeakResult = {
  audio: Buffer;
  containerFormat: "pcm" | "wav";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};
```

Gemini TTS returns PCM audio (`containerFormat: "pcm"`). The server wraps it in a WAV container before saving.

## Irodori Provider

`provider: "irodori"` shells out to a local Irodori-TTS checkout via `uv run python infer.py`. The repo path comes from `SPEAK_MCP_IRODORI_REPO`; the server requires it to be set explicitly and to contain `infer.py`.

Two modes are supported:

- `reference`: pass a built-in voice profile (`franca`) or a custom `refWav`. Default checkpoint: `Aratako/Irodori-TTS-500M-v2`.
- `voice_design`: pass a `stylePrompt` that is forwarded to Irodori as `--caption`. Default checkpoint: `Aratako/Irodori-TTS-500M-v2-VoiceDesign`.

Default device is `mps` (Apple Silicon) for both the model and the codec; both are overridable via `modelDevice` / `codecDevice` (`mps` / `cpu` / `cuda`). Precisions default to `fp32` and can be set to `bf16`.

`infer.py` writes a WAV file to a temporary path. The Node side reads that WAV into memory, deletes the temp file, and then writes the result through the same sandboxed path used by the Gemini route. Both providers share the same WAV write + TOCTOU re-check + playback pipeline.

## Style Prompt Boundary

Shared style instructions can come from:

1. `SPEAK_MCP_STYLE_PROMPT`
2. `SPEAK_MCP_STYLE_PROMPT_FILE`
3. per-call `stylePrompt`

Per-call instructions are appended after shared instructions. The composed prompt tells the model to follow the instructions and speak only the target text.

## Generation Boundary

`speak_text` issues one TTS request per call for the full input text. This keeps prosody, pacing, and tone consistent across the whole utterance instead of stitching together independently generated sentence chunks.

## Playback Boundary

Local playback uses `afplay` on macOS. `speak_text` plays generated audio by default. Callers can pass `play: false`, and deployments can set `SPEAK_MCP_DISABLE_PLAYBACK=1` to disable playback globally.

Generated files are deleted after successful playback unless `keepFiles: true` or `SPEAK_MCP_KEEP_AUDIO=1` is set.

## Why Gemini TTS, Not Live API

Gemini TTS is suited for exact text recitation with controllable style and voice. That matches MCP clients that need a tool like "read this response aloud".

The Gemini Live API is better for interactive, unstructured audio conversations. It requires session lifecycle management and streaming transport decisions that do not belong in this minimal MCP server. A future Live API mode should be added as a separate tool or sibling server instead of expanding `speak_text`.

## Filesystem Boundary

`SPEAK_MCP_OUTPUT_DIR` is the filesystem root for generated audio.

All requested output directories are resolved under that root. The server rejects traversal and symlink escapes before writing files.

## Default Voice

The default voice is:

1. `SPEAK_MCP_DEFAULT_VOICE`, when set and valid
2. `Zephyr`, otherwise

`Leda` is intentionally included in the supported voice list and documented as the other recommended default.

## Future Extensions

- Additional providers behind the same `SpeakParams` interface
- Multi-speaker Gemini TTS as a separate `speak_dialogue` tool
- Additional playback controls such as queueing and interruption
- Additional playback backends for Linux and Windows
- Live API conversation support as a separate package or explicit streaming tool
