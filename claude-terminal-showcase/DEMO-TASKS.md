# ddx-term MCP — Live Demo Tasks

> Paste this whole file (or the **Prompt** section) into a Claude Code session that has the
> **ddx-term** MCP connected (`/mcp` shows `ddx-term · ✔ connected · 10 tools`).
> Keep the web terminal open in your browser so you watch Claude's keystrokes land live.

## Before you start (stack must be up)

| Service | URL | Check |
|---|---|---|
| Broker (NestJS) | http://localhost:6481/api/v1/terminals | returns `[]` or a JSON array |
| Web (Next.js) | **http://localhost:3460/en/terminal** | the terminal UI loads with a tab bar |

Both are already running (started this session). If either is down, restart from the repo root:
- Broker: `DDX_TERM_SOCKET=/tmp/ddx-term.sock DDX_TERM_SESSION=ddx-shared pnpm -F ddx-term-broker start`
- Web: `pnpm -F ddx-term-web dev`

**Open http://localhost:3460/en/terminal now and leave it visible.** The MCP and the web both
attach to the same `ddx-shared` tmux session — so when Claude runs `term_send`, you see it typed
in the browser in real time. That is the whole point of the project.

---

## Prompt (paste into Claude Code)

I have the ddx-term web view open at **http://localhost:3460/en/terminal**. Use the **ddx-term**
MCP tools to run a guided demo of the shared terminal. I'm watching the browser — narrate each
step and tell me which terminal tab to look at. Exercise **every** tool in this order, pausing
briefly between steps so I can watch:

1. **term_list** — list the terminals currently in the shared session.
2. **term_create** — create a terminal named `demo-main`. Tell me to click its tab in the web view.
3. **term_send** — in `demo-main`, run `echo "hello from Claude — watch this land in your browser"`,
   then `pwd`, then `ls -la`. Pause so I can confirm I see them appear in the browser tab.
4. **term_read** — read the delta from `demo-main` since I last looked; confirm it matches the browser.
5. **term_snapshot** — capture the visible grid of `demo-main`; report its width × height.
6. **term_create** a second terminal `demo-watch`, then **term_send** a streaming command:
   `for i in $(seq 1 5); do echo "tick $i"; sleep 1; done`. Tell me to watch the `demo-watch` tab.
7. **term_wait_for** — block on `demo-watch` for the pattern `tick 5` (timeout 15s); tell me whether
   it matched or timed out.
8. **term_ps** — show the live `panePid` + `fgPid` for `demo-watch`; point out these are transient
   PIDs, NOT the durable `terminalId`.
9. **term_panes** — report the pane geometry for `demo-main`.
10. **term_signal** — in `demo-main`, `term_send` a `sleep 30`, then send Ctrl-C via term_signal to
    interrupt it; show me it stopped. Then demonstrate the safety guard: call term_signal on a
    foreign PID like `99999` and show it is rejected with `PID_NOT_IN_TERMINAL`.
11. **term_destroy** — destroy `demo-watch`, then **term_list** again to show it is gone.

Throughout, remind me which tab to watch so I see your keystrokes in real time. If any tool errors,
show me the exact error and stop.

---

## What each step proves

| Step | Tool(s) | What it demonstrates |
|---|---|---|
| 1, 11 | term_list | enumeration + that destroy actually frees the terminal |
| 2, 11 | term_create / term_destroy | lifecycle reciprocal pair; stable `terminalId` allocation |
| 3 | term_send | literal `send-keys -l` + separate Enter — agent typing visible in your browser |
| 4 | term_read | scrollback **delta** (token-frugal — not the whole buffer) |
| 5 | term_snapshot | the **visible viewport** grid (vs the delta in step 4) |
| 6, 7 | term_wait_for | blocking until output appears — the reliable alternative to sleep-guessing |
| 8 | term_ps | `panePid`/`fgPid` are live snapshots, distinct from `terminalId` (FM#4) |
| 9 | term_panes | pane geometry |
| 10 | term_signal | Ctrl-C interrupt **+** the PID-containment safety check (foreign PID rejected) |

## Acceptance checklist (tick as you watch)

- [ ] Web view at :3460/en/terminal loads with a tab bar
- [ ] `demo-main` keystrokes from step 3 appear **in the browser** as Claude sends them
- [ ] term_read returns only new lines (delta), not the full buffer
- [ ] `tick 1..5` streams in the `demo-watch` tab; term_wait_for reports `tick 5` matched
- [ ] term_ps shows numeric PIDs ≠ the `terminalId` strings
- [ ] Ctrl-C stops the `sleep 30`; foreign PID `99999` is rejected with `PID_NOT_IN_TERMINAL`
- [ ] After term_destroy, term_list no longer shows `demo-watch`

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
