# Irodori reference voice profiles

This directory holds reference WAV files used by the Irodori-TTS provider in
`reference` mode.

## `franca-reference.wav`

- Source: a non-personal Japanese narration sample recorded for this project.
- License: MIT, alongside the rest of the repository.
- Purpose: drive the bundled `franca` voice profile used by Irodori-TTS in
  `reference` mode.

## Not included in the npm tarball

Reference WAV files are intentionally **excluded from the published npm
package** to keep the tarball small and to avoid shipping binary audio data to
users who only need the Gemini provider.

If you want to use the `franca` profile (or any other reference voice with
Irodori), do one of the following:

1. Clone or download this repository and point the server at the WAV file
   directly:

   ```bash
   export SPEAK_MCP_IRODORI_FRANCA_REF_WAV=/path/to/speak-mcp/assets/profiles/franca-reference.wav
   ```

2. Or supply your own reference WAV and point at it the same way:

   ```bash
   export SPEAK_MCP_IRODORI_FRANCA_REF_WAV=/path/to/your-reference.wav
   ```

When `SPEAK_MCP_IRODORI_FRANCA_REF_WAV` is unset and the bundled WAV is not
present, calls that select `provider: "irodori"` and `mode: "reference"` will
fail with a clear error. The Gemini provider is unaffected.
