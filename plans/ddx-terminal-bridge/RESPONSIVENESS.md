# RESPONSIVENESS — ddx-terminal-bridge

> Companion to `ARCHITECTURE.md`. Defines the latency budget, the mechanisms that meet it, and the
> measurement method. Responsiveness is a first-class AC (AC #1), not an afterthought.

## 1. Latency budget (localhost, p95)

| Path | Target p95 | Hard ceiling |
|---|---|---|
| Human keystroke → glyph on screen (echo) | < 50 ms (with predictive echo, v2) / < 150 ms (v1, server echo) | 200 ms |
| Human command → first output byte rendered | < 150 ms | 300 ms |
| Agent `term_send` → human sees it | < 150 ms | 300 ms |
| Agent `term_read` (delta) round-trip | < 80 ms | 200 ms |
| Agent `term_snapshot` (visible grid) round-trip | < 80 ms | 200 ms |
| `term_create` / `term_destroy` (new tmux window) | < 120 ms | 300 ms |
| `term_list` / `term_ps` (N terminals + PID resolve) | < 100 ms | 250 ms |
| Switch terminal tab → live + scrollback (web) | < 200 ms | 400 ms |
| `term_wait_for` detection granularity | ≤ 100 ms (initial poll) | 500 ms |
| Reconnect → live + scrollback restored | < 1 s | 3 s |

Targets are per-terminal and hold with up to `DDX_TERM_MAX_TERMINALS` (16) concurrent terminals.

Targets are localhost/LAN. WAN (v2 via Apache cascade) relaxes by RTT.

## 2. Mechanisms (how each target is met)

### 2.1 WebSocket, not polling, for the human path
Broker→web is a persistent WS. tmux control-mode `%output` frames are pushed the instant they occur,
so progress bars, spinners, and streaming logs render smoothly (the classic xterm.js+WS property).

### 2.2 Control-mode line-reads, not full-screen redraws
`tmux -CC` emits incremental `%output %N <bytes>` deltas. The broker forwards bytes as they arrive
rather than diffing whole screens — minimal per-keystroke overhead and correct TUI behavior.

### 2.3 Delta reads + read-cursor for the agent path (token AND latency)
`term_read` returns only new bytes since the agent's last cursor (MCP-SPEC §3.2). Smaller payloads =
faster JSON-RPC round trips AND lower token cost. Full snapshots are explicit and capped.

### 2.4 `term_wait_for` instead of sleep-poll loops
Agents that poll for a marker with backoff (100ms→500ms) detect completion ~immediately instead of
sleeping a fixed worst-case interval. This is the dominant agent-side latency win and the biggest
reliability lever (RMUX/cmux both expose this).

### 2.5 Predictive local echo (v2, sshx/Mosh pattern)
Echo typed characters locally before the server confirms, then reconcile. Masks RTT on the human
path; deferred to v2 because it needs careful reconciliation, but the WS contract is designed so it's
additive (no rework).

### 2.6 webgl renderer + fit addon
xterm.js webgl addon offloads glyph rendering to the GPU → smooth scroll under heavy output; fit
addon keeps the grid sized to the pinned session without reflow thrash.

### 2.7 Resize pinning avoids renegotiation stalls
Because the session size is pinned (ARCHITECTURE §6), attaching the agent or a second browser doesn't
trigger a full-screen tmux redraw storm — attaches are cheap. It also makes the agent's
`term_snapshot` grid byte-identical to the human's viewport (no per-client size drift).

### 2.8 Per-terminal WS routing (multi-terminal scale)
The broker forwards each terminal's control-mode `%output` only to subscribers of `/term/:terminalId`.
A busy build in terminal `a` does not push frames to clients viewing terminal `b` — N concurrent
terminals don't cross-pollute latency. Tab-switching in the web UI is a WS resubscribe + one
`term_snapshot` to paint the current frame, not a full reconnect.

### 2.9 Snapshot is one `capture-pane`, not a stream replay
`term_snapshot` answers "what's on screen now" with a single `capture-pane -p` (no `-S`) — O(visible
grid), independent of scrollback depth. The agent gets the current TUI/prompt frame in one cheap call
instead of replaying the output stream. Scrollback delta (`term_read`) is the separate, cursor-bounded
path so neither mode pays the other's cost.

## 3. Backpressure & flood control

- **Output flood (e.g. `yes`, `cat bigfile`):** broker coalesces `%output` frames within a small time
  window (e.g. 16ms / one animation frame) before WS send, capping frame rate to the renderer.
- **Agent over-read:** `DDX_TERM_MAX_READ_LINES` caps every `term_read`; delta-by-default prevents
  re-reading the whole buffer (FM#3).
- **Slow client:** WS send queue has a high-water mark; on overflow the broker drops to a periodic
  full-snapshot resync for that client rather than unbounded buffering.

## 4. Measurement method (how AC #1 is verified)

- **Harness:** an e2e test (Feature 9.x) timestamps a keystroke send and the corresponding WS frame
  receipt; computes p50/p95 over N=500 keystrokes on localhost.
- **Agent path:** time `term_send`→(poll)→first delta containing the echoed command, over N=200.
- **Report:** the e2e emits a small latency report; CI fails if p95 exceeds the hard ceilings in §1.
- **Manual:** `RESPONSIVENESS.md` §1 table doubles as the acceptance checklist for `/verify`.

## 5. Responsiveness anti-patterns (MUST NOT)

- ❌ Polling the broker over HTTP for output (kills the <150ms target) — use WS push.
- ❌ Full `capture-pane` on every agent turn (token + latency blowout) — delta reads.
- ❌ Fixed `sleep N` in agent flows — `term_wait_for`.
- ❌ Re-rendering the whole xterm buffer per frame — write incremental bytes.
- ❌ Letting a second attach renegotiate session size mid-stream — pin it.
