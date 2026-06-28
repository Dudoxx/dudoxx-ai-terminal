# @ddx/term-contract — Changelog

## 0.1.0 — 2026-06-28

### Initial

Single source of truth for the ddx-terminal-bridge shared contract. The broker
(NestJS), the MCP server (stdio), and the web client (Next.js + xterm.js) all
import from here — types are never duplicated downstream.

- **terminal.ts** — `TerminalId` (branded), `WindowId` (branded), `PidRef`,
  `ProcessInfo`, `TerminalDescriptor` (identity: terminalId/windowId; snapshots:
  panePid/fgPid/cwd/command). Exact per ARCHITECTURE §3a.
- **session.ts** — `SessionDescriptor`, `ResizePolicy` enum (default
  `PINNED_DEFAULT_SIZE`), `InputArbitration` enum (default `AGENT_OWN_WINDOW` |
  `FREE_FOR_ALL` | `HUMAN_LOCK`).
- **ws-frames.ts** — control-mode → WS discriminated union on `type`, every
  variant tagged with `terminalId`: `output` / `layout-change` / `window-add` /
  `window-close` / `error` / `process-snapshot` (server→client) and `input`
  (client→server). Open for v2 frame types.
- **mcp-tools.ts** — one zod input + one output schema per verb for the 10 v1
  MCP verbs (`term_create`, `term_list`, `term_destroy`, `term_send`,
  `term_read`, `term_wait_for`, `term_signal`, `term_ps`, `term_panes`,
  `term_snapshot`); per-terminal inputs have optional `terminalId`. Shared
  `TermError` discriminated union keyed on the MCP-SPEC §4 code enum +
  `retriable`.

Built multi-target (esm + cjs + types) with an exports map, mirroring
`@ddx/sse-contract`. zod is a `^4` peer dependency.
