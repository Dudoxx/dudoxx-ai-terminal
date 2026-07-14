
- 2026-06-28 · manual · domains: publish, harness, docs. Net-new lessons: 3.
  2026-06-28 · [PUBLISH] · DISCOVERY · MCP publish is wired via tsup noExternal bundling; README "npx not available" note was stale. (manual)
  2026-06-28 · [BROKER] · RULE · Broker's node-pty is for tmux -CC attach (shared session), NOT a private PTY; do not remove it. (manual)
  2026-06-28 · [HARNESS] · RULE · Root CLAUDE.md is a thin DOX cascade pointer; per-package CLAUDE.md own local detail (closer-wins). (manual)

- 2026-06-28 · c58dc3f · domains: none. Net-new lessons: 2.
  2026-06-28 · [GENERAL] · PITFALL · Don't embed logos as data URIs in package.json; npm strips them.
  2026-06-28 · [GENERAL] · RULE · Host external assets like logos on a CDN or raw file host for npm packages.

- 2026-06-28 · 0f9d5a4 · domains: none. Net-new lessons: 3.
  2026-06-28 · [CONTRACT] · PITFALL · Make optional fields explicit with default values.
  2026-06-28 · [WEB] · RULE · Poll frequently for live updates of dynamic resources.
  2026-06-28 · [DOCS] · DISCOVERY · npm strips data URIs from package assets.

- 2026-06-28 · d1e3bc1 · domains:  meta. Net-new lessons: 5.
  2026-06-28 · [GENERAL] · PITFALL · Don't embed logos as data URIs in package.json; npm strips them.
  2026-06-28 · [GENERAL] · RULE · Host external assets like logos on a CDN or raw file host for npm packages.
  2026-06-28 · [CONTRACT] · PITFALL · Make optional fields explicit with default values.
  2026-06-28 · [WEB] · RULE · Poll frequently for live updates of dynamic resources.
  2026-06-28 · [BROKER] · DISCOVERY · `@nestjs/platform-ws` routes upgrades by exact pathname match, preventing dynamic path segments.

- 2026-06-28 · 8a583d3 · domains:  meta. Net-new lessons: 5.
  2026-06-28 · [META] · RULE · Add handoffs and primers for new features.
  2026-06-28 · [META] · RULE · Update SUMMARY.md for new plans.
  2026-06-28 · [META] · DISCOVERY · npm strips data URIs from package.json, host logos elsewhere.
  2026-06-28 · [META] · PITFALL · Don't forget to include the /api/v1 broker prefix in DDX_TERM_BROKER_URL.
  2026-06-28 · [META] · DISCOVERY · tmux -CC %output encodes ESC as \033 and CR as \015; xterm needs raw bytes.

- 2026-06-28 · 5b37f8b · domains:  term-broker term-mcp term-web meta. Net-new lessons: 7.
  2026-06-28 · [TERM-BROKER] · PITFALL · Don't rely on `tmux -CC attach` to manage session state; use a separate registry for reconciliation.
  2026-06-28 · [TERM-BROKER] · RULE · Ensure terminal session destruction is idempotent to prevent race conditions.
  2026-06-28 · [TERM-WEB] · PITFALL · Polling for terminal list updates is necessary for agent-created terminals to appear live.
  2026-06-28 · [TERM-WEB] · RULE · Use `noServer: true` for `ws.Server` when integrating with an existing HTTP server.
  2026-06-28 · [TERM-WEB] · DISCOVERY · WebSocket frames and input require explicit end-to-end handling for live terminal functionality.
  2026-06-28 · [TERM-MCP] · RULE · The `DDX_TERM_BROKER_URL` must include the `/api/v1` broker prefix.
  2026-06-28 · [GENERAL] · RULE · Make `TermListEntry.active` optional with a default of `false` for flexibility.

- 2026-06-28 · ccb7ad9 · domains:  term-broker term-mcp term-web meta. Net-new lessons: 6.
  2026-06-28 · [TERM-WEB] · PITFALL · Avoid using native `<select>` for complex UI like font/theme pickers; use custom controls instead.
  2026-06-28 · [TERM-WEB] · RULE · Persist terminal appearance settings (font size, theme) to localStorage for live application and cross-tab sync.
  2026-06-28 · [TERM-WEB] · RULE · Use `useSyncExternalStore` for cross-tab synchronization of UI state like terminal appearance.
  2026-06-28 · [TERM-WEB] · RULE · Centralize appearance logic (themes, fonts, sizes) in a dedicated module (`appearance.ts`).
  2026-06-28 · [TERM-WEB] · DISCOVERY · xterm's `ITheme` cannot parse OKLCH; raw hex is an acceptable exemption for custom themes.
  2026-06-28 · [GENERAL] · RULE · Document pty-leak prevention strategies in invariants for future reference.

- 2026-06-28 · 0646dd0 · domains:  term-broker term-mcp term-web. Net-new lessons: 4.
  2026-06-28 · [TERM-BROKER,TERM-WEB] · PITFALL · Manually set DDX_TERM_BROKER_URL must include /api/v1 prefix.
  2026-06-28 · [GENERAL] · RULE · Use high port bands (e.g., 133XX) to avoid dev server collisions.
  2026-06-28 · [TERM-MCP] · RULE · Load .env files early in the MCP to resolve ports before spawning.
  2026-06-28 · [GENERAL] · RULE · Document environment variable precedence clearly for users.

- 2026-07-10 · 8b134eb · domains:  term-broker term-mcp meta. Net-new lessons: 7.
  2026-07-10 · [TERM-BROKER] · PITFALL · Unbounded reconnects can exhaust PTY resources; cap retries and use exponential backoff.
  2026-07-10 · [TERM-BROKER] · RULE · Implement a circuit breaker for persistent control-mode attach failures.
  2026-07-10 · [TERM-BROKER] · DISCOVERY · `tmux kill-window` fails if the window ID is invalid.
  2026-07-10 · [TERM-BROKER] · DISCOVERY · `term_signal` requires a valid signal name, not undefined.
  2026-07-10 · [TERM-BROKER] · DISCOVERY · `PID_NOT_IN_TERMINAL` error occurs when a PID is not part of the specified terminal's process tree.
  2026-07-10 · [TERM-MCP] · RULE · Use `.env` files for configuration overrides, respecting precedence.
  2026-07-10 · [GENERAL] · PITFALL · Manually set `DDX_TERM_BROKER_URL` must include `/api/v1` prefix or registry resolution fails.

- 2026-07-10 · aa064a2 · domains:  term-broker term-mcp meta. Net-new lessons: 5.
  2026-07-10 · [TERM-BROKER] · PITFALL · Reconnecting control-mode without stopping PTYs leaks masters.
  2026-07-10 · [TERM-BROKER] · RULE · Always reap PTY masters when closing terminals to prevent leaks.
  2026-07-10 · [TERM-BROKER] · RULE · Cap concurrent terminals to avoid resource exhaustion.
  2026-07-10 · [TERM-MCP] · RULE · Repair supervised production stack launch logic.
  2026-07-10 · [GENERAL] · DISCOVERY · `node-pty`'s `spawn` function must be mocked before the module under test imports it.

- 2026-07-14 · aa064a2 · domains: term-web term-broker term-mcp contract meta. Net-new lessons: 3.
  2026-07-14 · [CONTRACT] · RULE · New WS/cross-service frame: add to the shared contract package FIRST, then a producer shard + a consumer shard, closed by an exhaustive-`never` switch so the compiler forces every consumer to handle it.
  2026-07-14 · [TERM-BROKER] · RULE · Restore-on-attach must be byte-fidelity (raw snapshot concatenation, no inserted whitespace) — verify against the broker's raw capture, not eyeballed terminal output.
  2026-07-14 · [META] · PITFALL · Grep-based AC/design verification false-positives on comments/docstrings (`as never`, `window.confirm` in a doc string) — check the actual diff hunks, not a raw grep hit count.
