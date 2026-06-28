
- 2026-06-28 · c58dc3f · domains: none. Net-new lessons: 2.
  2026-06-28 · [GENERAL] · PITFALL · Don't embed images as data URIs in npm packages; they will be stripped.
  2026-06-28 · [GENERAL] · RULE · Host external assets like logos on a CDN or raw file host for npm packages.

- 2026-06-28 · dbbe87a · domains: none. Net-new lessons: 2.
  2026-06-28 · [WEB] · PITFALL · Polling for terminal updates is necessary for live display.
  2026-06-28 · [DOCS] · RULE · Host assets via raw.githubusercontent to avoid stripping by npm.

- 2026-06-28 · 9521334 · domains: none. Net-new lessons: 3.
  2026-06-28 · [BROKER] · PITFALL · DDX_TERM_BROKER_URL must include the /api/v1 broker prefix.
  2026-06-28 · [WEB] · RULE · Poll terminal list every 2s to show agent-created terminals live.
  2026-06-28 · [GENERAL] · DISCOVERY · npm strips data URIs from packages.

- 2026-06-28 · 0f9d5a4 · domains: none. Net-new lessons: 3.
  2026-06-28 · [CONTRACT] · PITFALL · Make optional fields explicit with default values.
  2026-06-28 · [WEB] · RULE · Poll frequently for live updates of dynamic resources.
  2026-06-28 · [DOCS] · DISCOVERY · npm strips data URIs from package assets.

- 2026-06-28 · d1e3bc1 · domains:  meta. Net-new lessons: 4.
  2026-06-28 · [GENERAL] · PITFALL · Don't assume pane IDs map directly to window IDs; resolve them via the session service.
  2026-06-28 · [GENERAL] · PITFALL · Forwarding raw octal-encoded tmux output to xterm.js caused data loss; decode it first.
  2026-06-28 · [GENERAL] · RULE · Poll the terminal list every 2 seconds to ensure agent-created terminals appear live.
  2026-06-28 · [GENERAL] · DISCOVERY · The `DDX_TERM_BROKER_URL` must include the `/api/v1` broker prefix.

- 2026-06-28 · 8a583d3 · domains:  meta. Net-new lessons: 5.
  2026-06-28 · [GENERAL] · PITFALL · Strip trailing CR from PTY output to prevent garbled terminal lines.
  2026-06-28 · [GENERAL] · RULE · Decode tmux octal escapes (\\033, \\015) to raw control bytes for xterm.
  2026-06-28 · [GENERAL] · RULE · Decode escaped literal backslashes (\\\\) to single backslashes.
  2026-06-28 · [GENERAL] · DISCOVERY · npm package.json version is used to stamp serverInfo.version at build.
  2026-06-28 · [GENERAL] · DISCOVERY · npm strips data URIs, host logos via raw.githubusercontent.com.
