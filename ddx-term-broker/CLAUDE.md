# ddx-term-broker — CLAUDE.md (DOX local contract)

## Purpose
The human channel + canonical state owner for ddx-terminal-bridge. A NestJS 11
service that attaches to the shared tmux session in **control mode** (`tmux -CC`),
owns the canonical terminal registry (`terminalId ↔ windowId`), exposes terminal
REST CRUD, and fans tmux output to browser clients over a **per-terminalId**
WebSocket. Default port **13330** (`DDX_TERM_BROKER_PORT`), host `127.0.0.1`
(`DDX_TERM_BROKER_HOST`).

## Ownership
- `src/main.ts` — boot (Helmet, Swagger, LoggingInterceptor, HttpExceptionFilter,
  BootSummaryService).
- `src/modules/session` — owns/creates the shared tmux session + registry + PID
  resolution.
- `src/modules/terminal` — REST CRUD (`GET /api/v1/terminals`,
  `…/:id/snapshot`, …) — the human-side mirror of the MCP `term_*` verbs.
- `src/modules/control-mode` — `tmux -CC attach` spawn loop + line parser.
- `src/modules/gateway` — owns a raw `ws.Server({ noServer: true })` attached to the
  Nest HTTP `upgrade` event via `TermGateway.attachTo()` (called from `main.ts` after
  `listen()`). NOT `@WebSocketGateway` / `WsAdapter`: `@nestjs/platform-ws` routes
  upgrades by EXACT pathname match, so it can never deliver `/term/<terminalId>` —
  it destroys the socket ("socket hang up") before `handleConnection`. Client connects
  to `/term/<terminalId>`, receives only that terminal's frames.

## Local Contracts (tmux footguns — load-bearing)
- **MUST** create/attach the session with `tmux -f /dev/null …` — NEVER inherit
  `~/.tmux.conf` (it aborts scripted ops). Control-mode attach uses
  `tmux -f /dev/null -S $SOCK -CC attach-session …` (SPIKE footgun #2).
- **MUST** pin terminal size with `set-option -g default-size 120x30` at session
  creation; the broker owns canonical dims.
- **NEVER** use `set-window-option -g window-size manual` — that + `new-window` on
  a DETACHED session KILLS the tmux 3.6a server (production day-1 crash).
- **NEVER** let a headless attach renegotiate the session smaller than the human's
  viewport (resize war) — the broker pins size and owns the canonical dimensions.
- **Control-mode attach retry is BOUNDED** — `control-mode.attach.ts` caps consecutive
  attach failures at `RECONNECT_MAX_ATTEMPTS=60` with exponential backoff (2s→30s),
  resetting the counter on the first healthy data frame. A persistently-failing
  `pty.spawn` (e.g. a missing native `pty.node` in a bad deploy) would otherwise retry
  every 2s FOREVER, leaking one pty per cycle until macOS `ptmx_max`(511) is exhausted.
  On give-up it logs + sets `stopped=true` (no timer re-fires). NEVER reintroduce an
  uncapped/fixed-delay reconnect loop. The delivered MCP bundle carries the native
  `pty.node` (`dist/broker/node_modules/node-pty/prebuilds/darwin-arm64/`) — verify it
  survives `build:stack` after any node-pty version bump.
- **Every pty master MUST be `.kill()`d before its reference is dropped** —
  `disposeProc()` is the single deterministic release path, called (a) at the top of
  `spawn()` before allocating a new pty, (b) in `onExit` for the exited pty, and (c) in
  `stop()`. node-pty does NOT free the `/dev/ptmx` master on process exit; setting
  `this.proc = null` alone leaks the fd until a GC finalizer that effectively never runs
  in a long-lived low-GC process. The `RECONNECT_MAX_ATTEMPTS=60` cap does NOT cover this:
  it counts only *attach failures*, so a healthy `success→exit→reconnect` churn resets the
  counter every cycle and reconnects forever — each un-reaped exit then leaks one master.
  This was a real production defect (a stale broker accumulated 510 masters over 11 days,
  exhausting the host pty pool and killing `zpty`/shell autosuggest machine-wide). Regression
  guard: `control-mode.attach.spec.ts` asserts `liveMasters <= 1` across a 100-cycle churn.
  NEVER null `this.proc` without routing through `disposeProc()`.
- Per-terminalId WS fan-out only: a busy build in terminal A NEVER pushes frames
  to subscribers of terminal B (RESPONSIVENESS §2.8). Output is coalesced per
  terminal for flood control.
- **Registry survives broker restarts** — the in-memory registry is rebuilt on
  boot by `SessionService.reconcileRegistry()` (runs in `onModuleInit` after
  `syncPaneMap`): it lists live tmux windows, ADOPTS any window the registry
  doesn't know (deriving the terminalId from the window name), and DROPS entries
  whose window is gone. The tmux session is deliberately NOT killed on shutdown,
  so this is what lets `term_list` + the web viewer reconnect after a restart.
  Any new registry-mutating path must stay reconcile-safe (idempotent over a
  reused session).
- **`destroyTerminal` is idempotent** — registry eviction happens in a `finally`,
  and a `kill-window` that fails because the window is already gone is treated as
  success. REST `DELETE /:id` on an already-gone terminal returns 204 (no-op), not
  404/500. Never reintroduce a destroy path that throws before evicting the
  registry (that orphan breaks the tab-close UI).
- All shared types from `@ddx/term-contract` — never redefine a frame/descriptor.
- Address by `terminalId`; signal/observe by `pid`; validate a pid ∈ the
  terminal's process tree before any signal. Zero `any`.
- **Auth: none by design (v1).** The REST + WS endpoints carry NO `@UseGuards` /
  JWT / RBAC — auth/SSO/multi-tenant is an explicit v2 NON-goal (plan Boundaries).
  Safe because the broker binds `127.0.0.1` only (`DDX_TERM_BROKER_HOST`) — a
  localhost-only dev tool. **If ever exposed beyond localhost, an auth guard +
  WS-origin check become mandatory FIRST** (it executes shell commands). Documented
  here so this is a recorded decision, not a re-flaggable gap.

## Verification
`pnpm --filter ddx-term-broker tsc:check` · `pnpm --filter ddx-term-broker lint:check`
· `pnpm --filter ddx-term-broker test`. Boot smoke: `pnpm --filter ddx-term-broker
start:dev` → banner `DDX Term Broker … listening on http://127.0.0.1:13330`,
Swagger at `/docs`.

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
