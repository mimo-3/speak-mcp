# Changelog

All notable changes to `speak-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-10

Initial public release.

### Added

- `speak_text` MCP tool that turns text into a `.wav` file using either Gemini
  TTS (`provider: "gemini"`) or a local Irodori-TTS checkout
  (`provider: "irodori"`, modes: `reference` and `voice_design`).
- `play_audio` MCP tool that plays an existing audio file from the configured
  output directory.
- Path sandboxing: every saved audio file resolves under
  `SPEAK_MCP_OUTPUT_DIR` (or `~/speak-mcp-output` by default). Path traversal
  and symlinks that escape the sandbox are rejected.
- Configurable shared style prompts via `SPEAK_MCP_STYLE_PROMPT` /
  `SPEAK_MCP_STYLE_PROMPT_FILE`.
- macOS local playback via `afplay`. Audio generation works on Linux and
  Windows, but local playback is currently macOS-only.
- Default cleanup of generated audio after successful playback, with
  `keepFiles` / `SPEAK_MCP_KEEP_AUDIO` opt-out.

### Notes

- `0.1.x` is an early release. Tool parameter names, environment variable
  names, and response shapes may change in subsequent `0.x` releases.
- The Irodori `franca` reference WAV is **not** included in the npm tarball.
  To use `provider: "irodori"` with `mode: "reference"`, point
  `SPEAK_MCP_IRODORI_FRANCA_REF_WAV` at a reference WAV (see
  `assets/profiles/README.md` in the repository).
- Published with `"os": ["darwin"]`. Installs on Linux and Windows will see a
  warning but will not fail; only local playback is unsupported there.
- Requires Node.js `>=20`.
- Build runs only at publish time via `prepublishOnly`. Installing from a git
  URL (e.g. `npm i github:mimo-3/speak-mcp`) is not supported; clone and run
  `npm run build` manually if you need that path.
