# @dudoxx/ddx-term-mcp — CLAUDE.md (DOX local contract)

## Purpose
The agent channel for ddx-terminal-bridge: an MCP stdio (JSON-RPC 2.0) server
that lets Claude Code / Claude Desktop drive the SAME shared tmux session a human
is watching. It is a **thin client over tmux** — the 9 verbs + 2 helpers of the
agent channel. Launched as `node dist/server.js` (stdio); `bin` =
`ddx-term-mcp` → `dist/server.js`. ESM (`"type": "module"`).

## Ownership
- `src/server.ts` — stdio server wiring (entry → `dist/server.js`).
- `src/tools/term-*.tool.ts` — the verbs (create/list/destroy, send/read/wait-for/
  signal/ps, panes/snapshot) + `registry.ts`.
- `src/tmux/tmux.client.ts` — the ONLY thing that shells out to tmux (`execFile`).
- `src/{read-cursor,terminal-map,registry-resolver,resolver-factory}.ts` — per-
  terminal read-cursor + slug↔window map (standalone mode) / broker REST (attached).
- `src/{allow-list,capture-util,context,errors}.ts`.

## Local Contracts — THE load-bearing invariant
> **This server MUST NEVER hold a PTY (no `node-pty`, no `pty.spawn`, no
> `child_process` of a raw shell). It shells out to `tmux` ONLY.**

A private PTY breaks shared state (the webmux trap, FM#1) — the human and the
agent would no longer be looking at the same terminal. The package has NO
`node-pty` dependency; `no-pty.spec.ts` greps the source to enforce this and MUST
stay green. Every verb resolves `terminalId → windowId` and runs
`tmux -S $DDX_TERM_SOCKET <cmd> -t $DDX_TERM_SESSION:<windowId>`.

### Send / capture mechanics (the heart of the agent channel)
- **Send** (`term_send`): `tmux send-keys -t … -l <text>` (LITERAL — so `$VAR`,
  `;`, `|`, and words like `Enter`/`C-c` are typed, not interpreted) followed by a
  **SEPARATE** `Enter` key event when `enter:true`. NEVER send `\n` in the literal
  text. Control keys (Ctrl-C/D/Z) are KEY NAMES → `term_signal`, never `term_send`.
- **Snapshot** (`term_snapshot`): the VISIBLE viewport grid — `capture-pane -p`
  **WITHOUT `-S`** (cols×lines exactly on screen now; `-e` to keep ANSI). Answers
  "what does the screen look like right now" (TUIs, prompts, spinners). Resets the
  read-cursor to tail.
- **Read** (`term_read`, default `since:'last'`): the SCROLLBACK DELTA —
  `capture-pane -p -S -N` + a per-terminalId read-cursor returning only new lines.
  Answers "what did my command output since I last looked." Every read is capped
  by `DDX_TERM_MAX_READ_LINES` (never return unbounded scrollback — FM#3).
- **Wait** (`term_wait_for`): poll `capture-pane -p` until a regex matches —
  call it before answering interactive prompts so keystrokes don't race readiness.

### Other invariants
- Address by `terminalId` (durable); signal/observe by `pid` (transient). Never
  conflate them; `term_signal(pid)` MUST validate the pid ∈ the terminal's process
  tree before `kill`.
- Never target a session other than `$DDX_TERM_SESSION`; never exceed
  `DDX_TERM_MAX_TERMINALS`. Zero `any`.

## Env (MCP-SPEC §2)
`DDX_TERM_SOCKET` (`/tmp/ddx-term.sock`) · `DDX_TERM_SESSION` (`ddx-shared`) ·
`DDX_TERM_DEFAULT` (`t01`) · `DDX_TERM_ALLOWLIST` · `DDX_TERM_MAX_READ_LINES`
(2000) · `DDX_TERM_MAX_TERMINALS` (16) · `DDX_TERM_BROKER_URL` (set →
broker-attached; unset → standalone slug↔window map).

## Verification
`pnpm --filter @dudoxx/ddx-term-mcp build` → `dist/server.js` runs under plain
`node`. `pnpm --filter @dudoxx/ddx-term-mcp test` (vitest) — incl. `no-pty.spec.ts`
(zero `node-pty`/`pty.spawn`), the `-l`+separate-Enter send assertion, snapshot vs
read flag assertions, and `server.e2e.spec.ts` (real throwaway tmux on a temp
socket). Typecheck: `… typecheck`.

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
