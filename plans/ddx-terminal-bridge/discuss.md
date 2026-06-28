# discuss.md — ddx-terminal-bridge

> **This file is the precedence-bearing input to `/plan-feature`.** It carries Scope, Acceptance
> Criteria (testable), Boundaries (out-of-scope), Parallel-hints, Failure Modes, and Pattern Basis.
> When `/plan-feature` runs against `plans/ddx-terminal-bridge/`, the Plan agent treats this as
> authoritative — at the same precedence as a `--discuss` session output.

## Scope statement

Build **ddx-terminal-bridge**: a stateful, shared terminal system where **one persistent tmux
session** is the single source of truth hosting **MANY addressable terminals** (one tmux window each,
each with a stable `terminalId` and live process introspection by `pid`), attached simultaneously by:
1. a **human** through a web page (xterm.js, terminal tabs) and/or a native window (iTerm2/WezTerm),
2. an **AI coding agent** through an **MCP server** (the chosen agent channel),
3. (optionally) a raw CLI user.

Anything one party does in a terminal — `cd`, export an env var, open a REPL, start `npm run dev`,
run `vim` — persists and is visible/controllable by the others, in real time. Multiple terminals run
concurrently and independently (a build in one, a REPL in another) while sharing the session. The MCP
server is a **thin client over the shared tmux session; it MUST NEVER own a private PTY** (the one
decision that separates this from webmux, which locked CLI users out by spawning per-consumer PTYs).

**Two identifiers, never conflated:** `terminalId` = stable handle for a terminal (a tmux window) —
what every operation ADDRESSES; `pid` = the transient OS PID of a process inside it — what you SIGNAL
and observe. Commands are sent literally (`send-keys -l` + `Enter`); output is captured two ways — a
**visible-viewport snapshot** (the cols×lines grid on screen now, for TUIs/prompts) and a
**scrollback delta** (new lines since last read, for command output).

The deliverable of THIS plan run is a **production-grade monorepo** with three `ddx-*` packages
(`ddx-term-broker`, `ddx-term-mcp`, `ddx-term-web`) plus a shared contract package, following Dudoxx
NestJS/Next conventions, day-zero runnable, with tests.

## Acceptance Criteria (numbered, testable — EARS where the planner will lift them)

1. WHEN a human types a command in the web terminal THE SYSTEM SHALL execute it in the shared tmux
   session and reflect output in <150 ms p95 round-trip on localhost.
2. WHEN the agent calls `term_send` over MCP THE SYSTEM SHALL inject the keystrokes into the SAME
   tmux session the human is attached to (verified: human's web view shows the agent's command).
3. WHEN the agent calls `term_read` THE SYSTEM SHALL return the exact pane scrollback the human sees
   (byte-for-byte parity with `tmux capture-pane -p`).
4. WHEN either party runs a stateful sequence (`cd /tmp` then `pwd`; open `python3` REPL then eval)
   THE SYSTEM SHALL preserve state across separate MCP/web interactions (no fresh shell per call).
5. WHEN a client disconnects and reconnects THE SYSTEM SHALL restore the live session with full
   scrollback (tmux survives client disconnect natively; broker re-attaches).
6. WHEN the agent calls `term_wait_for(pattern, timeout)` THE SYSTEM SHALL block until the pattern
   appears in pane output or the timeout elapses, returning which occurred (no fixed sleeps).
7. WHEN a TUI program runs (vim, htop, less) THE SYSTEM SHALL render it correctly in the web view via
   tmux control-mode (`-CC`) `%output`/`%layout-change` parsing — not a flat screen-scrape.
8. WHEN the human resizes the browser THE SYSTEM SHALL NOT shrink the session below a pinned size,
   so the agent's headless attach never collapses the human's viewport (resize arbitration).
9. WHEN two parties type concurrently THE SYSTEM SHALL apply the configured input-arbitration policy
   (default: agent gets its own tmux window; human owns window 0) — no interleaved-keystroke corruption.
10. THE SYSTEM SHALL ship unit tests (`*.spec.ts` co-located) for the broker fan-out, the 9 MCP
    verbs, the terminal registry/PID resolution, and the control-mode parser, plus e2e tests proving
    3-way attach parity and multi-terminal isolation.
11. THE SYSTEM SHALL expose the MCP server over stdio (JSON-RPC) registrable in a Claude Code/Desktop
    `.mcp.json`, with a documented tool surface.
12. WHEN the agent calls `term_create` THE SYSTEM SHALL allocate a NEW independent terminal (tmux
    window) with a stable `terminalId`, and `term_list` SHALL enumerate all terminals; a command sent
    to terminal A SHALL NOT appear in terminal B's output (per-terminal isolation).
13. WHEN `term_list`/`term_ps` is called THE SYSTEM SHALL report each terminal's `panePid` (shell) and
    `fgPid` (foreground child) as live snapshots, distinct from the durable `terminalId`.
14. WHEN `term_signal(terminalId, sig, pid)` targets a specific `pid` THE SYSTEM SHALL validate the
    pid belongs to that terminal's process tree before signalling, rejecting otherwise — proving
    `terminalId` (address) and `pid` (process) are not conflated.
15. WHEN `term_snapshot(terminalId)` is called THE SYSTEM SHALL return the VISIBLE viewport as a
    cols×lines grid (`capture-pane` without `-S`, optional ANSI), reporting `#{pane_width}` ×
    `#{pane_height}`; `term_read` SHALL instead return the scrollback DELTA (`-S -N` + cursor).

## Boundaries (explicit out-of-scope)

- **No custom PTY broker that replaces tmux.** tmux IS the multiplexer. We attach; we do not reimplement.
- **No hosted/cloud relay** (sshx-style global mesh). v1 is localhost / single-host LAN only.
- **No end-to-end encryption / multi-tenant auth in v1.** Single-host trust boundary; auth is a v2 line.
- **No replacement of Claude Code's built-in shell.** This augments: the agent drives a *shared,
  human-visible* terminal, distinct from its private `bash -c` tool.
- **No Windows-native support in v1** (macOS + Linux; tmux required). WSL acceptable.
- **No infinite-canvas / multi-window-tiling UX** (sshx-style) in v1 — single active session, but the
  control-mode layer is chosen so this is addable later without rework.

## Authority / conflict resolution

- **tmux-as-source-of-truth OUTRANKS any convenience shortcut.** If a design choice would let the MCP
  server hold its own PTY "just for the agent," reject it — that breaks AC #2/#3.
- **Dudoxx conventions win over generic tutorials**: `ddx-*` package naming, NestJS `modules/`+`platform/`
  split, co-located `*.spec.ts`, kebab-case files, OKLCH/Dudoxx branding for the web UI, ports in the
  3400-3490 band (or the host's 6xxx dev band per `dudoxx-ai-hms/context/ENVIRONMENT.md`).
- **The MCP-vs-CLI benchmark governs the agent channel**: thin, clean verbs beat exposing raw tmux.

## Out of scope (user-deferred to later)

- E2E encryption, SSO/RBAC, multi-tenant session isolation → v2.
- Hosted relay / remote-over-WAN access → v2 (would route through the Dudoxx Apache cascade).
- Session recording / asciinema export → v2.
- Collaboration UX polish (live cursors, predictive echo, presence) → v2 (port from sshx ideas).

## Decisions already made (locked by user)

- **MCP is the agent channel** (explicit user instruction "opt for mcp approach").
- The render path stays **channel-independent** from MCP (control-mode → WebSocket for the human).
- Folder + naming + test conventions follow **Dudoxx** (`create-nestjs` skeleton, `module-layout.md`).
- This is its own repo/workspace (`dudoxx-ai-terminal`), NOT a module inside `dudoxx-ai-hms`.
- **Multi-terminal is v1 core** (user: "handle multiple terminal with terminal id and process id"). A
  terminal = one tmux window in the shared session, addressed by a stable `terminalId`; the OS `pid`
  (panePid + fgPid) is a separate, transient process handle. The two are NEVER conflated.
- **Send/capture mechanics are locked** (user: "how do we send commands and capture output, snapshot
  of the rendered visible area col/line"): send = `send-keys -l <text>` + separate `Enter` key (never
  `\n` literal; control keys via `term_signal`). Capture = TWO modes: `term_snapshot` for the visible
  viewport grid (`capture-pane -p` without `-S`, optional `-e` ANSI, dims from `#{pane_width}×#{pane_height}`),
  `term_read` for the scrollback delta (`capture-pane -p -S -N` + per-terminal read-cursor).

## Parallel-hints (independently workable areas)

- **A — `ddx-term-broker`** (tmux control-mode attach + WS fan-out + terminal registry/CRUD):
  independent of MCP package.
- **B — `ddx-term-mcp`** (the 9 verbs over the shared socket): independent of web package.
- **C — `ddx-term-web`** (Next.js + xterm.js render + terminal tabs): depends only on the broker's
  WS+REST contract.
- **D — `@ddx/term-contract`** (shared types: WS frames, MCP tool schemas, `TerminalDescriptor`,
  `ProcessInfo`): the contract package both A/B/C import — author FIRST, then A/B/C parallelize.

## Failure modes (four, with agreed handling — carried into tasks.json validation)

1. **MCP server spawns its own PTY instead of attaching to the shared tmux** (the webmux trap).
   → Handling: `_invariants.md` MUST-NEVER rule + a test asserting the agent's command appears in the
   human's `capture-pane`. The MCP server gets NO `node-pty` dependency; it shells out to `tmux` only.
2. **Resize war**: agent's headless attach negotiates the session to a tiny size, collapsing the
   human's viewport (tmux negotiates to the smallest client).
   → Handling: pin session size (`window-size manual` / per-client `aggressive-resize off`); the
   broker owns canonical dimensions; agent attaches read-mostly. Test: agent attach does not change
   `tmux display -p '#{window_width}'`. (Also makes the agent's snapshot grid match the human's.)
3. **Output flood / token blowout**: agent reads full scrollback every turn, exploding token cost.
   → Handling: `term_read` returns marker-delimited DELTAS since last read by default (full snapshot
   only on explicit `since=all`); `term_wait_for` replaces poll-sleep loops. Test: a 1000-line output
   read twice returns the delta the second time, not 2000 lines.
4. **`terminalId`/`pid` conflation** — code treats the OS PID as a terminal handle (or vice-versa), so
   a `kill`/signal hits the wrong process when a terminal's foreground PID changes between calls.
   → Handling: `terminalId`↔windowId is the ONLY durable binding; PIDs are re-read snapshots.
   `term_signal(pid)` validates the pid is in the terminal's process tree before `kill`
   (`PID_NOT_IN_TERMINAL` otherwise). `_invariants.md` MUST-NEVER rule (MCP invariant 5). Test:
   signalling a foreign pid is rejected; signalling the foreground after a command change still works.

## Pattern Basis (modules/skeletons to mirror — MANDATORY reuse)

| Reuse | Source | For |
|---|---|---|
| NestJS skeleton (main.ts, platform/common, Dockerfile, port band) | `create-nestjs` skill + `dudoxx-ai-hms/ddx-api` | `ddx-term-broker`, `ddx-term-mcp` boot/structure |
| `modules/` + `platform/` split, kebab-case, co-located `*.spec.ts` | `~/.claude/skills/create-nestjs/references/module-layout.md` | all backend packages |
| Next.js 16 skeleton + Dudoxx OKLCH branding | `create-nextjs` skill + `dudoxx-ai-hms/ddx-web` | `ddx-term-web` |
| Shared-contract-package pattern (`@ddx/sse-contract`) | `dudoxx-ai-hms/packages/ddx-sse-contract` | `@ddx/term-contract` |
| MCP stdio server shape | `dudoxx-ai-hms/ddx-fhir-r4-mcp` (13-tool stdio MCP bridge) | `ddx-term-mcp` |
| Per-subproject CLAUDE.md (DOX) | `dudoxx-ai-hms` child CLAUDE.md index | each `ddx-term-*` package |

## Companion specs in this folder (read before planning)

- `ARCHITECTURE.md` — the 3-layer design, the tmux-control-mode keystone, package topology.
- `FEATURES.md` — full enumerated feature list (v1 must-have / v2 deferred), responsibility-mapped.
- `MCP-SPEC.md` — the agent channel: full tool surface, JSON-RPC shapes, error model, registration.
- `RESPONSIVENESS.md` — latency budget, the responsiveness mechanisms, and how each AC is met.
