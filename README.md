# speak-mcp

An MCP server for text-to-speech generation using **Gemini TTS** and local **Irodori-TTS**.

`speak-mcp` lets MCP clients such as Codex, Claude Code, and Claude Desktop ask a tool to turn text into a local `.wav` file and play it immediately. It is designed for open-source use: API keys stay in environment variables, output paths are sandboxed, and generated speech text is not logged by the server.

## Providers & Models

### Gemini

| Name | Model ID | Best for |
| ---- | -------- | -------- |
| `gemini-3.1-flash-tts` | `gemini-3.1-flash-tts-preview` | Fast, controllable text-to-speech |

### Irodori-TTS

| Mode | Checkpoint | Best for |
| ---- | ---------- | -------- |
| `reference` | `Aratako/Irodori-TTS-500M-v2` | Generate speech from a fixed reference voice profile |
| `voice_design` | `Aratako/Irodori-TTS-500M-v2-VoiceDesign` | Generate speech from a style prompt/caption |

Built-in reference profile:

| Profile | Reference audio |
| ------- | --------------- |
| `franca` | `assets/profiles/franca-reference.wav` (in the source repo; not bundled in the npm tarball) |

## Requirements

- Node.js 20+
- macOS (local playback uses `afplay`; audio generation works on Linux and Windows but local playback does not)
- A Gemini API key for `provider: "gemini"`
- `uv` and a local Irodori-TTS checkout for `provider: "irodori"`

## Installation

```bash
npx speak-mcp
```

Or install globally:

```bash
npm install -g speak-mcp
```

## Quick start

The fastest path to a working install is the Gemini provider with one
environment variable:

```bash
export GEMINI_TTS_API_KEY=your_key_here
npx speak-mcp
```

Then have your MCP client call the `speak_text` tool with `provider: "gemini"`
(the default). A `.wav` file is written under `SPEAK_MCP_OUTPUT_DIR`
(default `~/speak-mcp-output`) and played via `afplay` on macOS.

The Irodori provider needs additional setup (a local checkout of Irodori-TTS
with `infer.py`, plus a reference WAV). See **Irodori reference profiles**
below.

## Setup

Set a Gemini API key:

```bash
export GEMINI_TTS_API_KEY=your_key_here
```

Optional output and voice defaults:

```bash
export SPEAK_MCP_OUTPUT_DIR="$HOME/speak-mcp-output"
export SPEAK_MCP_DEFAULT_VOICE=Zephyr
export SPEAK_MCP_STYLE_PROMPT="Warm, concise, and calm. Speak naturally, like a close colleague."
# or
export SPEAK_MCP_DEFAULT_VOICE=Leda
export SPEAK_MCP_IRODORI_REPO=/path/to/Irodori-TTS
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "speak-mcp": {
      "command": "npx",
      "args": ["speak-mcp"],
      "env": {
        "GEMINI_TTS_API_KEY": "${GEMINI_TTS_API_KEY}",
        "SPEAK_MCP_OUTPUT_DIR": "/path/to/audio/output",
        "SPEAK_MCP_DEFAULT_VOICE": "Zephyr"
      }
    }
  }
}
```

### Codex

If your API key lives in `~/.zshrc`, use the bundled launcher so Codex can read it without putting the key in `~/.codex/config.toml`:

```bash
codex mcp add speak-mcp \
  --env SPEAK_MCP_OUTPUT_DIR="${HOME}/speak-mcp-output" \
  --env SPEAK_MCP_DEFAULT_VOICE=Zephyr \
  -- /path/to/speak-mcp/scripts/codex-launcher.zsh
```

The launcher sources `~/.zshrc` with stdout redirected away from the MCP protocol, then starts `dist/index.js`. Replace `/path/to/speak-mcp` with your local clone.

## Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `GEMINI_TTS_API_KEY` | Yes | Gemini API key dedicated to TTS. Takes precedence over the fallback variables. |
| `GEMINI_API_KEY` | No | Fallback Gemini API key variable |
| `GOOGLE_API_KEY` | No | Fallback Gemini API key variable |
| `SPEAK_MCP_OUTPUT_DIR` | No | Base directory for saved audio. All output paths are sandboxed within this directory. |
| `SPEAK_MCP_DEFAULT_VOICE` | No | Default voice for `speak_text`. Defaults to `Zephyr`; `Leda` is also a recommended default. |
| `SPEAK_MCP_STYLE_PROMPT` | No | Shared voice and delivery instructions applied to every `speak_text` call. |
| `SPEAK_MCP_STYLE_PROMPT_FILE` | No | Path to a text file containing shared voice and delivery instructions. Used when `SPEAK_MCP_STYLE_PROMPT` is unset. |
| `SPEAK_MCP_KEEP_AUDIO` | No | Set to `1` to keep generated files after playback by default. |
| `SPEAK_MCP_DISABLE_PLAYBACK` | No | Set to `1` to save audio without playing it by default. |
| `SPEAK_MCP_IRODORI_REPO` | Yes (for `provider: "irodori"`) | Path to a local Irodori-TTS checkout containing `infer.py`. Required when `provider: "irodori"` is used. |
| `SPEAK_MCP_IRODORI_FRANCA_REF_WAV` | No | Optional override for the built-in `franca` reference WAV. |
| `SPEAK_MCP_IRODORI_FRANCA_CHECKPOINT` | No | Optional override for the `franca` profile checkpoint. Must start with `Aratako/Irodori-TTS-`. |

## Tool: `speak_text`

### Parameters

| Parameter | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| `text` | `string` (1-32,000 chars) | - | Text to synthesize |
| `provider` | `"gemini"` or `"irodori"` | `"gemini"` | Speech provider |
| `mode` | `"reference"` or `"voice_design"` | inferred | Irodori mode |
| `model` | `"gemini-3.1-flash-tts"` | `"gemini-3.1-flash-tts"` | TTS model to use |
| `voice` | Gemini voice name | `SPEAK_MCP_DEFAULT_VOICE` or `"Zephyr"` | Prebuilt voice name |
| `outputDir` | `string` | `"."` | Directory where audio will be saved, relative to `SPEAK_MCP_OUTPUT_DIR` |
| `play` | `boolean` | `true` | Play the generated audio after saving it |
| `keepFiles` | `boolean` | `false` | Keep generated audio files after playback |
| `stylePrompt` | `string` | - | Gemini voice instructions, or Irodori `voice_design` caption |
| `profile` | `string` | `"franca"` | Irodori reference profile |
| `refWav` | `string` | profile ref | Irodori reference WAV override |
| `numSteps` | `number` | `20` | Irodori sampling steps (1-120) |
| `seconds` | `number` | provider default | Irodori target duration in seconds (1-120) |
| `seed` | `number` | random | Irodori sampling seed |
| `modelDevice` | `"mps"`, `"cpu"`, `"cuda"` | `"mps"` | Irodori model device |
| `codecDevice` | `"mps"`, `"cpu"`, `"cuda"` | `"mps"` | Irodori codec device |
| `modelPrecision` | `"fp32"`, `"bf16"` | `"fp32"` | Irodori model precision |
| `codecPrecision` | `"fp32"`, `"bf16"` | `"fp32"` | Irodori codec precision |

### Style prompts

Use a shared prompt to shape tone without repeating it in every call:

```bash
export SPEAK_MCP_STYLE_PROMPT="Warm, concise, and calm. Sound like a close colleague, not a narrator."
```

For longer instructions:

```bash
export SPEAK_MCP_STYLE_PROMPT_FILE="$HOME/.config/speak-mcp/style.txt"
```

Per-call `stylePrompt` is appended after the shared prompt.

### Irodori reference mode

Use the built-in `franca` voice profile:

```json
{
  "provider": "irodori",
  "mode": "reference",
  "profile": "franca",
  "text": "今日は急がず、ひとつずつ確かめながら進めていきましょう。",
  "play": true
}
```

The `franca` profile expects a reference WAV file at
`assets/profiles/franca-reference.wav` inside the source repository. The WAV
is **not** included in the npm tarball to keep the package small. To use the
`franca` profile, set `SPEAK_MCP_IRODORI_FRANCA_REF_WAV` to a local path:

```bash
export SPEAK_MCP_IRODORI_FRANCA_REF_WAV=/path/to/franca-reference.wav
```

You can either clone this repository and reuse
`assets/profiles/franca-reference.wav`, or supply your own reference WAV.
See `assets/profiles/README.md` in the repository for details.

### Irodori VoiceDesign mode

In VoiceDesign mode, `stylePrompt` is passed to Irodori-TTS as `--caption`:

```json
{
  "provider": "irodori",
  "mode": "voice_design",
  "text": "今日は少しゆっくり話してみます。",
  "stylePrompt": "若い日本人女性の声。少し低めで気だるげ。近い距離で自然に話す。",
  "play": true
}
```

### Single-request generation

`speak_text` issues a single TTS request for the full input text. This preserves prosody and tone across the whole utterance.

### Cleanup

Generated audio is deleted after successful playback by default. To keep files:

```json
{
  "text": "Keep this one.",
  "keepFiles": true
}
```

Or set:

```bash
export SPEAK_MCP_KEEP_AUDIO=1
```

### Recommended voices

- `Zephyr` - bright
- `Leda` - youthful

Gemini TTS supports 30 prebuilt voices including `Zephyr`, `Puck`, `Kore`, `Leda`, `Aoede`, `Achird`, and `Sulafat`.

### Response

Returns a JSON object:

```json
{
  "model": "gemini-3.1-flash-tts-preview",
  "voice": "Zephyr",
  "savedFile": "/path/to/audio/1760000000000-ab12cd34.wav",
  "savedFiles": ["/path/to/audio/1760000000000-ab12cd34.wav"],
  "deletedFiles": ["/path/to/audio/1760000000000-ab12cd34.wav"],
  "format": "wav",
  "played": true,
  "keptFiles": false,
  "audio": {
    "sampleRate": 24000,
    "channels": 1,
    "bitsPerSample": 16
  }
}
```

## Tool: `play_audio`

Plays an existing generated audio file under `SPEAK_MCP_OUTPUT_DIR`.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `filePath` | `string` | Path to a generated audio file under `SPEAK_MCP_OUTPUT_DIR` |

Playback currently uses `afplay`, so local playback is macOS-only. On Linux and Windows, audio generation works but playback is not yet supported. Set `SPEAK_MCP_DISABLE_PLAYBACK=1` (or pass `play: false` per call) to suppress playback attempts on those platforms.

## Why not the Live API?

Gemini TTS is for exact text recitation and controlled speech output. The Gemini Live API is better for interactive, unstructured audio conversations. MCP clients usually need a deterministic "read this text aloud and save the file" tool, so this server starts with TTS and keeps Live API support as a future extension.

## Security

- **Path sandboxing**: all audio is written under `SPEAK_MCP_OUTPUT_DIR` or the default `~/speak-mcp-output`. Path traversal and symlinks that escape the sandbox are rejected.
- **Secret handling**: API keys are read only from environment variables. Do not commit `.env` files.
- **No prompt logging**: the server does not log the input text, generated audio data, or API keys.
- **Explicit output**: audio is saved to disk and only metadata plus the saved path are returned to the MCP client.
- **Default playback**: `speak_text` plays generated audio by default. Set `play: false` per call or `SPEAK_MCP_DISABLE_PLAYBACK=1` globally to disable playback.
- **Default cleanup**: generated files are deleted after successful playback unless `keepFiles: true` or `SPEAK_MCP_KEEP_AUDIO=1` is set.
- **AI voice disclosure**: applications using generated speech should clearly disclose that users are hearing AI-generated audio.

## Development

```bash
npm install
npm test
```

## References

- Gemini API speech generation: https://ai.google.dev/gemini-api/docs/speech-generation

## License

MIT
