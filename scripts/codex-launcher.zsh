#!/bin/zsh
# Local launcher example for Codex (~/.codex/config.toml).
# Sources ~/.zshrc so env vars defined there (e.g. GEMINI_TTS_API_KEY) are
# available, with stdout redirected away from the MCP stdio protocol, then
# starts the bundled `dist/index.js`.
set -euo pipefail

script_dir=${0:A:h}
project_root=${script_dir:h}

if [[ -f "$HOME/.zshrc" ]]; then
  set +u
  source "$HOME/.zshrc" >/dev/null
  set -u
fi

exec node "$project_root/dist/index.js"
