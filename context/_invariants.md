# Project Invariants — dudoxx-ai-terminal (MUST-NEVER rules)

> Hard constraints. A change violating one is a defect, not a style choice.
> code-reviewer asserts these on every diff. Source: per-package CLAUDE.md cascade.

## Shared-state model
- **MUST NEVER** give the MCP server (`@dudoxx/ddx-term-mcp`) a PTY — no `node-pty`,
  no `pty.spawn`, no raw-shell `child_process`. It shells out to `tmux` ONLY.
  Enforced by `ddx-term-mcp/src/no-pty.spec.ts` — that test MUST stay green.
  **Scope note:** this forbids a *private PTY that holds terminal state* (which would fork
  shared state). The **broker** legitimately uses `node-pty` in `control-mode.attach.ts` to
  allocate a pty so `tmux -CC attach` succeeds — that pty drives the SHARED session, it does
  not hold private state. Do NOT "fix" the broker by removing node-pty.
- **MUST NEVER** target a tmux session other than `$DDX_TERM_SESSION`.
- **MUST** address terminals by `terminalId` (durable); signal/observe by `pid`
  (transient). **NEVER** conflate them. `term_signal(pid)` MUST validate the pid ∈ the
  terminal's process tree before `kill`.

## tmux footguns (broker)
- **MUST** create/attach the session with `tmux -f /dev/null` — NEVER inherit `~/.tmux.conf`.
- **MUST NEVER** use `set-window-option -g window-size manual` — that + `new-window` on a
  detached session KILLS the tmux 3.6a server.
- **MUST** pin terminal size (120×30) at session creation; broker owns canonical dims.
  Client NEVER renegotiates dims (resize war).
- **MUST** keep `destroyTerminal` / registry mutations idempotent and reconcile-safe
  (`reconcileRegistry()` re-adopts live windows on broker restart; session is NOT killed).

## send / capture mechanics (MCP)
- **MUST** send via `tmux send-keys -l <text>` (LITERAL) + a SEPARATE `Enter` key event.
  **NEVER** send `\n` in the literal text. Control keys → `term_signal`, never `term_send`.
- **MUST** cap every read by `DDX_TERM_MAX_READ_LINES` — never return unbounded scrollback.

## Contracts & types
- **MUST** source all WS frames / tool I/O / descriptors from `@ddx/term-contract`.
  **NEVER** redefine a frame or descriptor in broker/mcp/web.
- **MUST** keep the contract bundled into the published MCP via tsup (`noExternal`).
  `@ddx/term-contract` stays `private` + in changeset `ignore[]` — never published separately.

## Broker auth posture (recorded decision, not a re-flaggable gap)
- Auth is **none by design (v1)** — broker binds `127.0.0.1` only. If ever exposed beyond
  localhost, an auth guard + WS-origin check become mandatory FIRST (it executes shell commands).

## Cross-cutting
- **Zero `any`** in all TypeScript.
- `ddx-term-web`: semantic Tailwind v4 `@theme` tokens only; user-facing strings via
  next-intl `t()` in en/de/fr lockstep; `lucide-react` icons only.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
