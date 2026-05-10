# Security Policy

## Supported Versions

Security fixes are provided for the latest published version.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory, or by contacting the repository owner directly if advisories are unavailable.

Do not open public issues for vulnerabilities that expose credentials, generated private speech, or filesystem escape behavior.

## Security Model

`speak-mcp` is a local MCP server. It receives text from an MCP client, sends that text to a configured TTS provider, writes generated audio to disk, plays it by default, and returns the saved path.

The main trust boundaries are:

- MCP client to `speak-mcp`
- `speak-mcp` to the Gemini API
- `speak-mcp` to the local filesystem
- `speak-mcp` to the local audio player

## Secrets

- API keys must be provided through environment variables.
- `.env` and `.env.*` files are ignored by git.
- The server does not log API keys.
- The server does not return API keys in tool responses.

## Generated Text and Audio

The input text may contain private information. The server therefore avoids logging:

- raw input text
- generated audio bytes
- provider request payloads
- provider response payloads

MCP clients and provider dashboards may have their own logging and retention behavior. Configure those systems separately for sensitive deployments.

## Filesystem Access

All generated audio is written under `SPEAK_MCP_OUTPUT_DIR`, or `~/speak-mcp-output` when unset.

The server rejects:

- `..` path traversal outside the output base
- absolute output paths outside the output base
- symlinks that resolve outside the output base

## Local Playback

`speak_text` plays generated audio by default. The `play_audio` tool only accepts files under `SPEAK_MCP_OUTPUT_DIR`.

Set `SPEAK_MCP_DISABLE_PLAYBACK=1` to disable local playback globally.

## Cleanup

Generated audio is deleted after successful playback by default. This reduces local data retention for private speech content.

Set `keepFiles: true` per call or `SPEAK_MCP_KEEP_AUDIO=1` globally when you need to preserve generated files.

## Style Prompts

Shared style prompts can be configured with `SPEAK_MCP_STYLE_PROMPT` or `SPEAK_MCP_STYLE_PROMPT_FILE`. Treat these prompts as configuration, not secrets. Avoid storing credentials or private user data in style prompt files.

`SPEAK_MCP_STYLE_PROMPT_FILE` should point at a file in a directory you trust. The file is read once at startup, capped at 16 KB, and stripped of NUL and ASCII control characters before it is composed into the per-call prompt.

## Prompt Injection Out of Scope

`speak-mcp` does not defend against prompt injection inside the synthesized text. The `text` field is intentionally narrated verbatim by the provider, so a caller can include phrases like "ignore previous instructions" and the model will simply read them aloud. Treat input text the same way you treat any other content the MCP client decides to play to the user.

## AI Voice Disclosure

Applications that play generated audio to end users should clearly disclose that the voice is AI-generated.
