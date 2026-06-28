# CLAUDE_ARCHITECTURE.md — dudoxx-ai-terminal

> Referencable deep-dive (loaded on demand from `CLAUDE.md`). The architecture of the
> shared multi-terminal bridge. For the prose docs, see `ddx-documentation/00-overview/`.

## The one-line model
A single **pinned tmux session** (`ddx-shared`, socket `/tmp/ddx-term.sock`) IS the
canonical shared state. Three parties attach to the *same* terminals; **none holds a PTY**.

## The three channels
| Channel | Component | How it attaches | Sees |
|---|---|---|---|
| **Human (web)** | `ddx-term-web` | broker WS `/term/<terminalId>` → xterm.js | one tab per terminal |
| **Human (native)** | iTerm2 / WezTerm | `tmux -CC attach -t ddx-shared` | tmux tabs/windows |
| **Agent** | `ddx-term-mcp` | `execFile(tmux …)` over MCP stdio | the same windows |

The broker (`ddx-term-broker`) is the **canonical state owner** — it attaches in
control-mode (`tmux -CC`), owns the `terminalId ↔ windowId` registry, and fans output
to the web over a per-terminal WebSocket.

## Data flow
```
Agent (Claude Code)
  └─ MCP stdio → ddx-term-mcp
                   └─ execFile(tmux …) ─┐
                                        ▼
Human (browser) ── WS /term/<id> ── ddx-term-broker ──(tmux -CC attach)── shared tmux session
                       ▲                    │                                     ▲
                       └── xterm.js ── ddx-term-web                               │
Human (native) ──────────────────── tmux -CC attach -t ddx-shared ───────────────┘
```
A command the agent types via `term_send` is visible **live** in the web UI and the
native attach — that shared-state property is the whole point of the system.

## Why no PTY (the webmux trap, FM#1)
If the MCP server (or anyone) held a private PTY, the human and the agent would no
longer be looking at the same terminal. So every party multiplexes through tmux:
- The MCP shells out (`tmux send-keys`, `capture-pane`) — `no-pty.spec.ts` enforces
  zero `node-pty` / `pty.spawn` in the source.
- The broker drives tmux in control mode and parses its `%output` stream.

## Read vs Snapshot (the two ways the agent observes)
- **`term_read`** — the SCROLLBACK DELTA. `capture-pane -p -S -N` + a per-terminalId
  read-cursor returning only *new* lines since the last read. Answers "what did my
  command output since I last looked." Capped by `DDX_TERM_MAX_READ_LINES`.
- **`term_snapshot`** — the VISIBLE VIEWPORT grid. `capture-pane -p` *without* `-S`
  (cols×lines on screen right now; `-e` keeps ANSI). Answers "what does the screen look
  like right now" (TUIs, prompts, spinners). Resets the read-cursor to tail.

## terminalId vs pid
- **`terminalId`** — the durable address (maps to a tmux window). Everything is
  addressed by it: `term_send`, `term_read`, `term_snapshot`.
- **`pid`** — a transient signal target. `term_signal(pid)` validates the pid is in the
  terminal's process tree before `kill`. NEVER conflate the two.

## Registry survives restarts
The broker's in-memory registry is rebuilt on boot by `reconcileRegistry()`: it lists
live tmux windows, adopts unknown ones (deriving terminalId from the window name), and
drops entries whose window is gone. The tmux session is deliberately NOT killed on
broker shutdown — that's what lets `term_list` + the web viewer reconnect after a restart.

## Key invariants
See `context/_invariants.md` for the enforced MUST-NEVER list. The load-bearing ones:
no PTY · terminalId≠pid · 120×30 pinned by broker · `send-keys -l` + separate Enter ·
`tmux -f /dev/null` · never `window-size manual` · all types from `@ddx/term-contract`.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
