# Invariants — terminal-ui-refactor

These MUST-NEVER rules govern every task in this plan. A specialist that violates one has failed the task regardless of other outcomes.

## MUST NEVER
1. **MCP server NEVER holds a PTY.** `@dudoxx/ddx-term-mcp` shells out to `tmux`/`ps`/`pgrep`/`kill` via `execFile` ONLY. `no-pty.spec.ts` guards this. A private PTY breaks shared canonical state.
2. **NEVER remove the BROKER's node-pty.** The broker legitimately holds a node-pty for its `tmux -CC` control-mode attach. This is a DIFFERENT service from the MCP. Keep them straight — the no-PTY rule applies to MCP only.
3. **All cross-boundary types come from `@ddx/term-contract`.** Any NEW frame (scrollback/restore/snapshot) lands in the contract package FIRST (turbo DAG: contract builds before broker/mcp/web). Never redefine a frame/descriptor in broker/mcp/web.
4. **`appearance.ts` is the ONE sanctioned raw-hex exemption** (xterm ITheme cannot parse OKLCH). NEVER route xterm theme through OKLCH `@theme` tokens; NEVER add raw hex anywhere else.
5. **Broker pins session size 120×30 and owns canonical dims** — no client renegotiation, ever.
6. **Zero `any`** across all TypeScript. Semantic Tailwind `@theme` tokens only. next-intl `t()` keys in en/de/fr lockstep. lucide-react icons only.
7. **`terminalId` = stable address; `pid` = transient signal target.** Never conflate.
8. **Keep the raw `ws.Server({noServer:true})` path-parsing for `/term/:terminalId`.** `@nestjs/platform-ws` matches WS upgrades by EXACT pathname — NO dynamic segments. NEVER "modernize" the per-terminal WS routing to platform-ws.

## MUST ALWAYS
- Decode `tmux -CC %output` escapes (`\033`→ESC, `\015`→CR) to RAW bytes before any snapshot/scrollback frame reaches `xterm.restoreSnapshot`.
- Keep the `/api/v1` prefix in `DDX_TERM_BROKER_URL` (already fixed — do not regress).
- Contract optional fields carry explicit default values.
