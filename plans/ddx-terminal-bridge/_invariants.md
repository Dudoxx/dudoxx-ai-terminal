# _invariants.md — ddx-terminal-bridge (MUST / NEVER contract)

> Binding execution contract. Every specialist reads this FIRST (context_files[0]).
> Seeded from SPIKE.md + discuss.md 4 Failure Modes. Refine as planning crystallizes.

## MUST

- **MUST** create the tmux session with `tmux -f /dev/null new-session -d -s <session>` — NEVER inherit `~/.tmux.conf` (it aborts scripted ops). [SPIKE.md]
- **MUST** pin terminal size with `set-option -g default-size 120x30` at session creation. [SPIKE.md]
- **MUST** treat `terminalId` (stable, == tmux windowId binding) as the ONLY durable terminal handle. `pid` (panePid shell + fgPid child) is transient. [discuss.md FM#4]
- **MUST** validate that a target pid ∈ the terminal's process tree BEFORE sending any signal/kill. [discuss.md FM#4]
- **MUST** keep ALL shared zod types in `@ddx/term-contract` ONLY — never duplicate a schema in broker/mcp/web.
- **MUST** SEND text via `tmux send-keys -l <text>` followed by a SEPARATE `Enter` key event; control keys + TUI arrow-nav use tmux KEY NAMES (Up/Down/C-c), never literal `\n` or raw escape bytes. [SPIKE.md Spike 2]
- **MUST** default `term_read` to a SCROLLBACK DELTA (`capture-pane -p -S -N` + per-terminal read-cursor); `term_snapshot` returns the VISIBLE viewport grid (`capture-pane -p` WITHOUT `-S`). [In-Session]
- **MUST** have the broker own the canonical terminal registry (terminalId↔windowId); MCP queries broker REST `/terminals` OR persists its own slug↔window map alongside its read-cursor in standalone mode. [Gap]
- **MUST** call `term_wait_for` before answering interactive prompts / sending keystrokes that depend on program readiness. [discuss.md FM#3, SPIKE.md]
- **MUST** co-locate `*.spec.ts` with sources; kebab-case filenames; ports in 3400-3490 (or host 6xxx dev band).

## NEVER

- **NEVER** use `set-window-option -g window-size manual` — that + `new-window` on a DETACHED session KILLS the tmux 3.6a server. PRODUCTION-DAY-1 CRASH. [SPIKE.md]
- **NEVER** add a `node-pty` dependency to `ddx-term-mcp` (or have MCP own any PTY) — the webmux trap; breaks shared state. MCP shells out to tmux ONLY. [discuss.md FM#1]
- **NEVER** let a headless attach renegotiate the session smaller than the human's viewport (resize war). Broker pins size + owns canonical dims. [discuss.md FM#2]
- **NEVER** return full scrollback on every read (output flood / token blowout). Delta-by-default. [discuss.md FM#3]
- **NEVER** conflate terminalId and pid in any API, signal, or log. [discuss.md FM#4]
- **NEVER** introduce a new abstraction/pattern without marking the task `NEEDS_REVIEW`.
- **NEVER** use `any`; zero `any` types (typescript-strict).

---
Attribution: Dudoxx UG / Acceleate Consulting — Walid Boudabbous <walid@acceleate.com>
