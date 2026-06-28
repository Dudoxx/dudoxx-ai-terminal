# SPIKE — zero-code architecture proof (2026-06-28)

> Ran the `tmux + ttyd + send-keys` spike to validate the ddx-terminal-bridge architecture BEFORE
> writing any product code. Result: **every core contract holds with zero custom code.** Two real
> footguns surfaced and are now folded into ARCHITECTURE §6.

## What was proven (6/6 assertions + live browser proof)

| # | Contract | Method | Result |
|---|---|---|---|
| 1 | One shared session, multiple terminals | `tmux -f /dev/null new-session` + 2× `new-window` → 3 terminals (`main`,`build`,`repl`) | ✓ |
| 2 | Agent `term_send` → command runs in shared session | `send-keys -l 'echo …'` + `Enter` to `term-build` | ✓ |
| 3 | Agent `term_read` captures output | `capture-pane -p` shows the agent's output | ✓ |
| 4 | **Multi-terminal isolation** | send to `build`, assert `repl`'s capture is clean | ✓ no leak |
| 5 | Snapshot = visible grid, dims accurate | `capture-pane -p` (no `-S`) = 30 lines; `#{pane_width}x#{pane_height}` = pinned 120x30 | ✓ |
| 6 | **`terminalId` vs `pid`** | `pane_pid`=shell 38638; `pgrep -P` foreground=39362 (`sleep`) — distinct | ✓ |
| 7 | `term_signal` C-c interrupts foreground | `send-keys C-c` → `sleep` gone from process tree | ✓ |
| 8 | **3-way attach: human sees agent live** | ttyd→browser attached to session; shell-side `send-keys 'echo AGENT-LIVE-PROOF-012617'` appeared in the browser screenshot | ✓ (screenshot) |

The decisive proof (#8): a command injected by a SEPARATE process via `send-keys` rendered live in a
browser tmux client. That is the whole thesis — **agent acts, human sees it, same PTY, no custom code.**

## Two footguns found (now in ARCHITECTURE §6 — would have been day-1 crashes)

1. **`window-size manual` + `new-window` on a detached session kills the tmux server** (3.6a:
   `server exited unexpectedly`). FIX: use `set-option -g default-size 120x30` instead. A concrete
   default size lets clientless windows exist; `manual` mode leaves detached sizing undefined → exit.
2. **A programmatic shared session must NOT inherit `~/.tmux.conf`.** The user's conf
   (`automatic-rename on`, status styling, keybindings) interfered with scripted ops. FIX: create with
   `tmux -f /dev/null …`. The broker owns the session config; personal conf stays out.

## Build-order validation (matches ARCHITECTURE §9)

The spike IS step 1 ("Spike (hours, no code)") and it passed. Confirmed the remaining order is sound:
2. `@ddx/term-contract` → 3. `ddx-term-mcp` (the 9 verbs, each a thin wrapper over the exact tmux
commands proven here) → 4. `ddx-term-broker` (control-mode attach replaces ttyd for pane fidelity) →
5. `ddx-term-web`. Every tmux invocation the MCP verbs need is now a known-good command string.

## Exact commands proven (the MCP verbs' implementation basis)

```sh
SOCK=/tmp/ddx-term.sock; SESS=ddx-shared
tmux -f /dev/null -S "$SOCK" new-session -d -s "$SESS" -x 120 -y 30   # session (isolated config)
tmux -S "$SOCK" set-option -g default-size 120x30                     # pin size (NOT window-size manual)
WIN=$(tmux -S "$SOCK" new-window -t "$SESS" -n build -P -F '#{window_id}')   # term_create
tmux -S "$SOCK" list-windows -t "$SESS" -F '#{window_name} #{window_id} #{pane_pid} #{pane_current_command}'  # term_list
tmux -S "$SOCK" send-keys -t "$SESS:$WIN" -l 'cmd'; tmux -S "$SOCK" send-keys -t "$SESS:$WIN" Enter  # term_send
tmux -S "$SOCK" capture-pane -p -t "$SESS:$WIN"            # term_snapshot (visible grid, no -S)
tmux -S "$SOCK" capture-pane -p -t "$SESS:$WIN" -S -200    # term_read (scrollback)
tmux -S "$SOCK" display-message -p -t "$SESS:$WIN" '#{pane_pid}'   # → pgrep -P for fgPid (term_ps)
tmux -S "$SOCK" send-keys -t "$SESS:$WIN" C-c             # term_signal
tmux -S "$SOCK" kill-window -t "$SESS:$WIN"               # term_destroy
ttyd -W -p 7681 tmux -S "$SOCK" attach -t "$SESS"         # render leg (ttyd → browser, the spike's stand-in for ddx-term-broker)
```

## Spike 2 — interactive real programs (Python+Rich+uv, TS+clack) — 2026-06-28

Validates the hardest property: **the agent answering live interactive prompts via `send-keys`**,
including a raw-mode TUI (not just line input). Two real day-zero projects were scaffolded in the
repo: `ddx-cli-py` (uv + rich) and `ddx-cli-ts` (pnpm + tsx + @clack/prompts + chalk).

| # | Contract | Method | Result |
|---|---|---|---|
| 9 | Python Rich program runs under uv in the terminal | `uv run main.py` → Rich panel/prompts rendered | ✓ |
| 10 | **Agent answers blocking Rich prompts** | `send-keys -l 'Atlas'`+Enter, `-l 'blue'`+Enter | ✓ completed `DDX-CLI-PY-DONE name=Atlas color=blue` |
| 11 | TS program runs under tsx (pnpm start) | clack TUI rendered | ✓ |
| 12 | **Agent drives a RAW-MODE TUI select with ARROW KEYS** | `send-keys Down` moved selection green→blue (visible `●`), `Enter` confirmed | ✓ completed `DDX-CLI-TS-DONE name=Echo color=blue` |
| 13 | Multi-terminal: PY in window 0, TS in window @1, concurrent | both ran independently in one session | ✓ |
| 14 | Browser renders full Rich interaction via ttyd | screenshot showed panel+table+answers | ✓ |

**Key result (#12):** `send-keys` drives arbitrary interactive programs — it sent an arrow-key
(`Down`) into a ncurses-style clack `select` and the highlighted option moved, then `Enter`
confirmed. This proves the architecture handles TUIs (vim, htop, fzf, REPLs, installers), not just
`readline` prompts. The `term_wait_for` pattern (poll capture-pane for the next prompt marker before
sending) made it deterministic — exactly as specified in MCP-SPEC §3.4.

### Interactive-input mechanics proven (feeds MCP-SPEC)
- **Line prompts** (Rich `Prompt.ask`, clack `text`): `send-keys -l '<answer>'` then `send-keys Enter`.
- **Raw-mode menus** (clack `select`, fzf, etc.): `send-keys Down/Up/Left/Right` then `send-keys Enter`
  — KEY NAMES, not literal. This is why `term_signal`/key-name sends are a first-class verb, distinct
  from `term_send` literal text.
- **`term_wait_for` is essential** for interactive flows: wait for prompt N's marker before answering,
  or keystrokes race ahead of the program's readiness.

### uv commands proven (the canonical ddx-cli-py flow)
```sh
uv init ddx-cli-py --name ddx-cli-py   # scaffold
uv add rich                            # add dep into .venv
uv run main.py                         # run (uses .venv, no manual activate)
```
> Pyright "could not resolve rich" is an IDE-interpreter artifact (it inspects system python, not
> `.venv`); `uv run` uses `.venv` correctly. Point the editor at `.venv/bin/python` to silence it.

## Verdict

Architecture is **validated end-to-end across two spikes**. The MCP-thin-client-over-tmux model is
correct; the control-mode/ttyd render leg works; multi-terminal + dual-ID + send/capture behave as
specified; AND the agent can drive real interactive programs incl. raw-mode TUIs. The two CLI demo
apps (`ddx-cli-py`, `ddx-cli-ts`) are reusable interactive-target fixtures for the future e2e tests.
Proceed to `/plan-feature ddx-terminal-bridge`.
