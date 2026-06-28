# ARCHITECTURE — ddx-terminal-bridge

> Companion to `discuss.md`. Defines the layered architecture, the tmux-control-mode keystone, the
> package topology (Dudoxx `ddx-*` conventions), and the data flows. Plan agent: mirror this in shards.

## 1. The one-sentence architecture

**One persistent tmux session is the single source of truth, hosting MANY addressable terminals (one
per tmux window). The human renders any terminal via control-mode → WebSocket → xterm.js. The agent
drives any terminal via an MCP server that shells out to tmux, addressing terminals by a stable
`terminalId` and inspecting the live process by `pid`. Nobody owns a private PTY.**

## 1a. Two identifiers — `terminalId` vs `pid` (the multi-terminal model)

These are DISTINCT and must never be conflated (the classic bug):

| ID | What it is | tmux source | Lifetime | Used for |
|---|---|---|---|---|
| **`terminalId`** | a stable handle for one terminal = one tmux **window** | our slug ↔ `@<window-id>` map | durable — survives every command run in it | addressing: which terminal a verb/WS targets |
| **`pid`** | the OS PID of the **foreground process** in that terminal's active pane | `#{pane_pid}` (+ child via `pgrep -P`) | transient — changes every command | signalling a specific process, monitoring, kill |

- A `terminalId` is allocated by the broker on `term_create` (slug like `term-build`, `term-repl`,
  or auto `t01`,`t02`). It maps 1:1 to a tmux window in the shared session. The map lives in
  `SessionService` (and `@ddx/term-contract` `TerminalDescriptor`).
- The `pid` is read on demand (`#{pane_pid}` is the shell's PID; the *foreground* child is resolved
  via `pgrep -P <pane_pid>` / `ps`). It is reported by `term_ps`/`term_panes`, NOT stored as identity.
- **Rule:** verbs ADDRESS by `terminalId`; they SIGNAL/observe processes by `pid`. `term_signal`
  takes an optional `pid` to target a specific child; default signals the terminal's foreground.

A "terminal" in this system = a tmux window in the shared session. Multiple terminals share the
session (one tmux server, one socket, shared resize policy, mutual visibility) but are each
independently addressable, renderable, and signalable.

## 2. Three layers

```
┌───────────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — RENDER / TRANSPORT                                                │
│   ddx-term-web (Next.js 16 + xterm.js + webgl/fit addons)                   │
│   ddx-term-broker exposes: WS /term/:sessionId  (control-mode frames)       │
│   native option: iTerm2/WezTerm `tmux -CC attach` (zero build)              │
├───────────────────────────────────────────────────────────────────────────┤
│ LAYER 2 — SESSION / MULTIPLEX  ← the shared-state core                      │
│   tmux session "ddx-shared" on a dedicated socket /tmp/ddx-term.sock        │
│   ddx-term-broker  : `tmux -CC attach`, parses %output/%layout, fan-out WS  │
│   ddx-term-mcp     : `tmux send-keys|capture-pane|new-window|list-panes`    │
├───────────────────────────────────────────────────────────────────────────┤
│ LAYER 1 — PTY                                                               │
│   tmux owns the ONE real PTY ⇆ shell (zsh/bash). We never touch node-pty    │
│   on the agent side; the broker only spawns tmux, not raw shells.           │
└───────────────────────────────────────────────────────────────────────────┘
     ▲ keyboard (WS)          ▲ control-mode frames        ▲ MCP JSON-RPC (stdio)
   HUMAN (browser)          RENDERER (broker→web)         AGENT (Claude Code)
```

## 3. Why tmux control mode (`-CC`) is the keystone — not raw attach, not a custom broker

- **Custom broker (webmux trap):** spawning one PTY per consumer and syncing them means a CLI user
  can't co-attach. REJECTED by `discuss.md` Boundary #1 + Failure Mode #1.
- **Raw tmux attach + screen-scrape:** works but the web view is a flat character grid — pane/window
  structure is lost, TUI redraws are fragile. Insufficient for AC #7.
- **Control mode (`tmux -CC attach`):** tmux emits a line-based, machine-parseable protocol
  (`%output %N <data>`, `%layout-change`, `%window-add`, `%window-close`, `%session-changed`, …)
  instead of raw escape sequences. This is exactly what **iTerm2's native tmux integration** consumes.
  The broker parses these frames and forwards structured pane updates to xterm.js → the web view
  renders *real tmux panes/windows*, and a native iTerm2 client can attach to the same session for
  free. **This is the decision that makes the system structurally faithful AND multi-renderer.**

## 3a. Terminal registry (broker-owned — the multi-terminal core)

The broker's `SessionService` owns the durable `terminalId`↔tmux-window map plus per-terminal
process snapshots:

```
SessionService.terminals: Map<terminalId, TerminalDescriptor>
  TerminalDescriptor = {
    terminalId: string        // 'term-build' | 't01'    — STABLE identity (durable)
    windowId:   string        // tmux '@7'                — internal handle
    title:      string        // human label
    panePid:    number        // #{pane_pid} (the shell)  — SNAPSHOT, re-read on demand
    fgPid:      number|null    // foreground child PID     — SNAPSHOT, re-read on demand
    cwd:        string         // #{pane_current_path}
    command:    string         // #{pane_current_command}
    createdAt:  number
  }
```
`panePid`/`fgPid`/`command`/`cwd` are SNAPSHOTS — refreshed by `term_ps`/`term_panes`, never trusted
as identity. `terminalId`↔`windowId` is the only durable binding. Each terminal = one tmux window in
the shared session: they share the session/socket/resize-policy and are mutually visible, but each is
independently addressable (`terminalId`), renderable (its own WS sub-stream), and signalable (`pid`).

## 4. Package topology (monorepo, Dudoxx `ddx-*` conventions)

```
dudoxx-ai-terminal/                      # this repo (pnpm workspace)
├── pnpm-workspace.yaml
├── package.json                         # workspace root, turbo pipeline
├── packages/
│   └── ddx-term-contract/               # @ddx/term-contract — shared types (mirror @ddx/sse-contract)
│       ├── src/
│       │   ├── ws-frames.ts             # control-mode→WS frame discriminated union (terminalId-tagged)
│       │   ├── mcp-tools.ts             # MCP tool input/output zod schemas (all take terminalId)
│       │   ├── session.ts               # SessionDescriptor, resize policy enum, InputArbitration enum
│       │   ├── terminal.ts              # TerminalDescriptor, TerminalId, PidRef, ProcessInfo
│       │   └── index.ts
│       └── package.json
├── ddx-term-broker/                     # NestJS 11 — tmux control-mode attach + WS fan-out
│   ├── nest-cli.json
│   ├── src/
│   │   ├── main.ts                      # Helmet, Swagger /docs, ZodValidationPipe (create-nestjs boot)
│   │   ├── app.module.ts
│   │   ├── modules/
│   │   │   ├── session/                 # session lifecycle (create/attach/destroy "ddx-shared")
│   │   │   │   ├── session.module.ts
│   │   │   │   ├── session.service.ts   # owns tmux socket, canonical dimensions, resize pinning,
│   │   │   │   │                        #   the terminalId↔window map + process snapshots
│   │   │   │   ├── session.controller.ts
│   │   │   │   └── session.service.spec.ts
│   │   │   ├── terminal/                # per-terminal CRUD over tmux windows (multi-terminal core)
│   │   │   │   ├── terminal.service.ts  # create/list/destroy terminals; resolve panePid/fgPid via ps/pgrep
│   │   │   │   ├── terminal.controller.ts  # REST: GET/POST/DELETE /terminals[/:terminalId]
│   │   │   │   └── terminal.service.spec.ts # terminalId↔window + PID-resolution tests
│   │   │   ├── control-mode/            # the `-CC` parser (THE critical, well-tested unit)
│   │   │   │   ├── control-mode.parser.ts        # %output/%layout-change/... → typed frames
│   │   │   │   ├── control-mode.attach.ts        # spawns `tmux -CC attach`, line-reads stdout
│   │   │   │   └── control-mode.parser.spec.ts   # golden-fixture frame tests
│   │   │   └── gateway/                 # WS fan-out (one tmux stream → N browser clients)
│   │   │       ├── term.gateway.ts      # @WebSocketGateway; broadcasts frames, ingests keystrokes
│   │   │       └── term.gateway.spec.ts
│   │   └── platform/common/             # filters, interceptors, logger, boot (create-nestjs)
│   ├── CLAUDE.md                        # DOX: this package's contract
│   └── package.json
├── ddx-term-mcp/                        # stdio MCP server — agent channel (mirror ddx-fhir-r4-mcp)
│   ├── src/
│   │   ├── server.ts                    # JSON-RPC over stdio; registers the 9 tools
│   │   ├── tmux/
│   │   │   ├── tmux.client.ts           # thin exec wrapper: send-keys/capture-pane/list-windows/
│   │   │   │                            #   new-window/kill-window/display-message(#{pane_pid})
│   │   │   └── tmux.client.spec.ts
│   │   ├── tools/                       # lifecycle + per-terminal verbs (all take terminalId)
│   │   │   ├── term-create.tool.ts      ├── term-list.tool.ts       ├── term-destroy.tool.ts
│   │   │   ├── term-send.tool.ts        ├── term-read.tool.ts       ├── term-wait-for.tool.ts
│   │   │   ├── term-signal.tool.ts      ├── term-panes.tool.ts      ├── term-ps.tool.ts
│   │   │   └── *.tool.spec.ts           # one spec per verb
│   │   └── read-cursor.ts               # last-read offset PER terminalId → DELTA reads (token guard)
│   ├── CLAUDE.md                        # DOX: "MUST NEVER hold a PTY; tmux only"
│   └── package.json                     # NOTE: no node-pty dependency, by invariant
└── ddx-term-web/                        # Next.js 16 — xterm.js render + Dudoxx branding
    ├── src/app/[locale]/terminal/page.tsx
    ├── src/lib/term/xterm-client.ts     # connects WS, applies frames, sends keystrokes, fit/webgl
    ├── src/lib/term/xterm-client.spec.ts
    ├── CLAUDE.md
    └── package.json
```

### Naming conventions applied (from `module-layout.md`)
- Service folders/files: `kebab-case` (`control-mode`, `term.gateway.ts`).
- Classes: `PascalCase` + role suffix (`SessionService`, `TermGateway`, `ControlModeParser`).
- Tests: `*.spec.ts` co-located with source (NestJS `TestingModule`; MCP tools via direct unit test).
- `modules/` = domain (session, terminal, gateway), `platform/` = cross-cutting wiring — never mix.

## 5. Data flows (terminal-scoped)

WS path is per-terminal: `WS /term/:terminalId`. The broker resolves `terminalId`→`windowId` and
forwards only that window's control-mode `%output` frames (tagged with `terminalId`) to subscribers.

### Flow A — human types in a terminal (browser)
```
xterm.js(terminalId) onData(key) → WS /term/:terminalId {type:'input', data} → TermGateway
  → SessionService.resolve(terminalId)→windowId
  → `tmux send-keys -t ddx-shared:<windowId> -l <key>` (control-mode socket)
  → that window's PTY → shell → output → control-mode `%output %<paneOfWindow>` → ControlModeAttach
  → ControlModeParser → typed frame {terminalId,…} → TermGateway broadcast to /term/:terminalId subs
```

### Flow B — agent drives a terminal (MCP)
```
agent → term_create('build')        → broker new-window → {terminalId:'term-build', windowId:'@7'}
agent → term_send('term-build', 'npm test', enter)  → `send-keys -t ddx-shared:@7 'npm test' Enter`
  → @7's PTY → output flows through Flow A's control-mode path → human's /term/term-build view shows it
agent → term_wait_for('term-build', 'PASS|FAIL', 60000) → poll `capture-pane -t ddx-shared:@7`
agent → term_ps('term-build')       → {panePid, fgPid, command} via #{pane_pid} + pgrep -P
agent → term_signal('term-build', 'C-c', pid?) → interrupt the foreground (or a specific child pid)
agent → term_read('term-build')     → DELTA since this terminal's read-cursor (token guard)
```

**Critical property (unchanged, now per-terminal):** Flow B's `send-keys` lands in the IDENTICAL PTY
the human renders for that `terminalId`. The human watching `/term/term-build` SEES the agent's
command + output live. Multiple terminals run concurrently and independently; each is its own tmux
window in the one shared session — so cross-terminal state (the shared shell server, scrollback host,
resize policy) is shared, but commands, PIDs, and viewports are per-terminal.

## 6. Resize arbitration (Failure Mode #2)

tmux negotiates window size to the smallest attached client. Mitigation, owned by `SessionService`:
- Create the session with a pinned size AND an isolated config: `tmux -f /dev/null new-session -d
  -s ddx-shared -x 120 -y 30`. **`-f /dev/null` is mandatory** — a programmatic shared session must
  NOT inherit the user's `~/.tmux.conf` (its keybindings/hooks/`automatic-rename` fight scripted ops;
  spike 2026-06-28 saw the user's conf abort the server on scripted window ops).
- Pin size with **`set-option -g default-size 120x30`**, NOT `set-window-option -g window-size manual`.
  ⚠️ **Spike-proven footgun (tmux 3.6a):** `window-size manual` + `new-window` on a *detached*
  (clientless) session **kills the server** (`server exited unexpectedly`). `default-size` gives
  detached windows a concrete size without that failure. This is a production-day-1 crash if missed.
  (`aggressive-resize off` is still fine as a complementary per-client setting once clients attach.)
- The broker is the canonical-dimension owner; the web client fits *within* the pinned grid (xterm
  fit addon clamps to session size, scrolls if smaller).

## 7. Input arbitration (Failure Mode + AC #9)

Default policy (`InputArbitration.AGENT_OWN_WINDOW`): the agent operates in `tmux new-window` (window
1+), the human owns window 0. They share the session/scrollback/state but don't fight over one prompt.
Alternative policies declared in `@ddx/term-contract` (`FREE_FOR_ALL`, `HUMAN_LOCK`) for later.

## 8. Security boundary (v1 = single-host trust; v2 hardening noted)

- v1: localhost/single-host only; the agent has a real shell — this is acknowledged, not solved.
- The MCP server is the command gate (Claude Code's malicious-command screening is bypassed when
  commands flow through MCP — *we* own that gate now → optional allow-list hook in `ddx-term-mcp`).
- v2 lines (deferred): container-per-session isolation (Noxterm pattern), E2E encryption (sshx:
  Argon2+AES), auth on the WS + MCP surfaces, read-only "watch" sessions.
- **HMS note:** this sits under `dudoxx-ai-hms-sandbox`. If it ever touches PHI-adjacent shells, the
  v2 security section becomes a hard HIPAA requirement — flagged in `_invariants.md`.

## 9. Build order (de-risked)

1. **Spike (hours, no code):** `tmux new -A -s ddx-shared`; agent uses `send-keys`/`capture-pane`;
   `ttyd tmux attach -t ddx-shared` for the web view. Proves 3-way attach end-to-end.
2. `@ddx/term-contract` — frames + tool schemas (unblocks all three packages).
3. `ddx-term-mcp` — the 9 verbs (the real agent deliverable; testable standalone vs the spike session).
4. `ddx-term-broker` — control-mode attach + parser + WS gateway (replaces ttyd, adds pane fidelity).
5. `ddx-term-web` — xterm.js client + Dudoxx branding.
6. Collaboration UX (v2): predictive echo, presence — port sshx ideas.

## 10. Tech selection summary

| Concern | Choice | Why |
|---|---|---|
| Multiplexer | **tmux** (control mode `-CC`) | proven 3-way attach; machine-parseable; iTerm2-compatible |
| Agent channel | **MCP (stdio JSON-RPC)** | user-mandated; 23% faster + token-cheap vs CLI (benchmark) |
| Render | **xterm.js** + webgl/fit | de-facto web terminal; don't build a renderer |
| Web framework | **Next.js 16** | Dudoxx standard (`create-nextjs`, ddx-web) |
| Backend framework | **NestJS 11** | Dudoxx standard (`create-nestjs`, ddx-api) |
| Contract | **zod/v4 in `@ddx/term-contract`** | mirror `@ddx/sse-contract`; one source of frame+tool truth |
| Transport | **WebSocket** (broker→web) | bidirectional, low-latency, progress-bar-friendly |
```
