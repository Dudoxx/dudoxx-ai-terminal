# Shard 02 — @ddx/term-contract (Group A)

**Task id:** `A2` · **Agent:** general-purpose · **Skills:** typescript-strict · **Parallel?** No (blocks B/C/D)

## Why this shard
The single source of truth for every shared shape: WS frames (control-mode → browser, terminalId-tagged),
the 9 MCP tool I/O schemas, and the core descriptors (`TerminalDescriptor`, `TerminalId`, `PidRef`,
`ProcessInfo`, `SessionDescriptor`, `ResizePolicy`, `InputArbitration`). Authored FIRST (ARCHITECTURE §9
build order step 2). Broker, MCP, and web all import from here — types are NEVER duplicated downstream
(`_invariants.md`: shared zod lives ONLY in `@ddx/term-contract`).

## Mirror (Pattern Basis)
`dudoxx-ai-hms/packages/ddx-sse-contract/` — real package `@ddx/sse-contract` v4.1.0. Copy its discipline:
- multi-target build (`tsconfig.esm.json` / `.cjs.json` / `.types.json`, `build = esm && cjs && types`),
- `exports` map (types/import/require), `files: [dist, src]`, `peerDependencies.zod ^4`,
- `schema-lock.json` + `CHANGELOG.md` (versioned-contract discipline), `vitest` for `test`.
- `author: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>`.

## Schema design (extensibility — discriminated unions, optional fields)
- **WS frames** = discriminated union on `type` (`output` / `layout-change` / `window-add` /
  `window-close` / `error` / `input` (client→server)), EVERY frame carries `terminalId`. Open for v2
  frame types without breaking consumers.
- **MCP tools** = one zod input + one zod output schema per verb (`term_create` … `term_snapshot`), each
  per-terminal verb's input has optional `terminalId` (defaults applied server-side). Error model is a
  shared discriminated union keyed on the `code` enum from MCP-SPEC §4 (`SESSION_NOT_FOUND`,
  `TERMINAL_NOT_FOUND`, `TERMINAL_PROTECTED`, `MAX_TERMINALS`, `PID_NOT_IN_TERMINAL`, `COMMAND_DENIED`,
  `INVALID_REGEX`, `TMUX_ERROR`) + `retriable: boolean`.
- **TerminalDescriptor** exactly per ARCHITECTURE §3a: `{terminalId, windowId, title, panePid,
  fgPid: number|null, cwd, command, createdAt}`. `terminalId`/`windowId` = identity; pids = snapshots.
- `ResizePolicy` enum + `InputArbitration` enum (`AGENT_OWN_WINDOW` default | `FREE_FOR_ALL` | `HUMAN_LOCK`).

## Boundaries
- Pure types/schemas only — no runtime tmux logic, no Nest, no React. No `node-pty`.

## Verification
`pnpm -F @ddx/term-contract build` emits esm+cjs+types; `pnpm -F @ddx/term-contract test` green; a
`term_send` input schema rejects a payload missing `text`. See tasks.json `A2`.
