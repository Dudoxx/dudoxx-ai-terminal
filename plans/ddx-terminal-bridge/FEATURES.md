# FEATURES — ddx-terminal-bridge (full enumerated list)

> Companion to `discuss.md` + `ARCHITECTURE.md`. Every feature is tagged **[v1]** (must-have this
> build) or **[v2]** (deferred, but the architecture must not preclude it), and mapped to the
> package that owns it. Plan agent: each [v1] feature should map to at least one shard + AC.

Legend — Owner: **B**=ddx-term-broker, **M**=ddx-term-mcp, **W**=ddx-term-web, **C**=@ddx/term-contract.

## 1. Shared session core (the reason this exists)

| # | Feature | v | Owner |
|---|---|---|---|
| 1.1 | One persistent tmux session (`ddx-shared`) on a dedicated socket as single source of truth | v1 | B |
| 1.2 | Session survives all client disconnects (tmux-native) | v1 | B |
| 1.3 | 3-way simultaneous attach: web + MCP + (optional) native CLI on the SAME session | v1 | B/M |
| 1.4 | State persistence across interactions: cwd, env vars, open REPLs, running processes | v1 | B/M |
| 1.5 | Session lifecycle API: create / attach / describe / destroy | v1 | B |
| **1.6** | **MULTIPLE terminals (one tmux window each), each with a stable `terminalId`** | **v1** | **B/M** |
| **1.7** | **Per-terminal process introspection: `panePid` (shell) + `fgPid` (foreground child)** | **v1** | **B/M** |
| **1.8** | **Terminal registry: durable `terminalId`↔windowId map + process snapshots (broker-owned)** | **v1** | **B** |
| **1.9** | **Terminal CRUD: `term_create` / `term_list` / `term_destroy` (REST mirror on broker)** | **v1** | **B/M** |
| **1.10** | **`terminalId` ≠ `pid` separation enforced (address by terminalId, signal by pid)** | **v1** | **C/M** |
| 1.11 | Per-terminal GC policy (idle timeout, `DDX_TERM_MAX_TERMINALS` guardrail) | v1 | B |
| 1.12 | Multiple named SESSIONS (separate workspaces, not just terminals) | v2 | B |

## 2. Human render — web

| # | Feature | v | Owner |
|---|---|---|---|
| 2.1 | xterm.js terminal in a Next.js 16 page, Dudoxx-branded (OKLCH tokens) | v1 | W |
| 2.2 | webgl renderer addon + fit addon (perf + auto-size within pinned grid) | v1 | W |
| 2.3 | Faithful TUI rendering (vim/htop/less) via control-mode frames, not screen-scrape | v1 | B/W |
| 2.4 | Full scrollback on connect/reconnect | v1 | B/W |
| 2.5 | Keystroke input → shared session (incl. ctrl-keys, IME, paste) | v1 | W/B |
| 2.6 | Copy/select, search-in-scrollback (xterm search addon) | v1 | W |
| **2.7** | **Terminal TABS — pick/switch among the N terminals by `terminalId`; per-tab status (cmd/pid)** | **v1** | **W** |
| **2.8** | **WS path per terminal (`/term/:terminalId`); each xterm instance subscribes to one terminal** | **v1** | **B/W** |
| **2.9** | **Visible-viewport snapshot fetch (`GET /terminals/:id/snapshot`, cols×lines grid +ANSI)** | **v1** | **B/W** |
| 2.10 | Real tmux pane/window rendering (splits) within a terminal from `%layout-change` | v2 | B/W |
| 2.8 | Live cursors / presence indicators (who else is attached) — sshx-style | v2 | W |
| 2.9 | Predictive local echo (Mosh/sshx-style) to mask latency | v2 | W |

## 3. Human render — native window

| # | Feature | v | Owner |
|---|---|---|---|
| 3.1 | iTerm2/WezTerm `tmux -CC attach -t ddx-shared` works against the same session (zero build) | v1 | B (doc) |
| 3.2 | Documented native-attach recipe in package CLAUDE.md | v1 | B (doc) |
| 3.3 | Electron/Tauri dedicated window embedding xterm.js (reuses broker WS) | v2 | W |

## 4. Agent channel — MCP (the user-chosen approach) — full spec in MCP-SPEC.md

| # | Feature | v | Owner |
|---|---|---|---|
| 4.1 | stdio JSON-RPC MCP server, registrable in `.mcp.json` | v1 | M |
| 4.2 | `term_create(name?, cwd?)` — allocate a new terminal, return stable `terminalId` | v1 | M |
| 4.3 | `term_list()` — enumerate all terminals + live process snapshots | v1 | M |
| 4.4 | `term_destroy(terminalId)` — close a terminal + its processes | v1 | M |
| 4.5 | `term_send(terminalId?, text, enter?)` — inject keystrokes (`-l` literal + Enter key) | v1 | M |
| 4.6 | `term_read(terminalId?, since?, lines?)` — DELTA scrollback read by default (token guard) | v1 | M |
| 4.7 | `term_wait_for(terminalId?, pattern, timeout)` — block until marker/timeout (no sleep loops) | v1 | M |
| 4.8 | `term_signal(terminalId?, signal, pid?)` — C-c/C-d/C-z foreground, or `kill` a specific `pid` | v1 | M |
| 4.9 | `term_ps(terminalId?)` — resolve live process tree (panePid/fgPid/processes[]) | v1 | M |
| 4.10 | `term_panes(terminalId?)` — list panes (splits) + dimensions within a terminal | v1 | M |
| 4.11 | `term_snapshot(terminalId?, lines?)` — VISIBLE viewport grid capture (cols×lines, +ANSI) | v1 | M |
| 4.12 | Read-cursor PER terminalId → marker-delimited deltas (Failure Mode #3 guard) | v1 | M |
| 4.13 | Command allow-list / deny-list hook (we own the gate post-MCP) | v1 | M |
| 4.14 | `-l` literal send + separate `Enter` key (no `\n` in literal; control keys via signal) | v1 | M |
| 4.15 | Streaming `term_tail(terminalId)` (server-push deltas to a notification) | v2 | M |

## 5. Concurrency & arbitration

| # | Feature | v | Owner |
|---|---|---|---|
| 5.1 | Resize arbitration — pinned session size; headless attach never shrinks human view | v1 | B |
| 5.2 | Input arbitration policy: AGENT_OWN_WINDOW (default) / FREE_FOR_ALL / HUMAN_LOCK | v1 | C/B |
| 5.3 | Canonical-dimension ownership by broker | v1 | B |
| 5.4 | Per-client focus / keyboard-grab (click-to-focus) | v2 | W/B |

## 6. Contract & types

| # | Feature | v | Owner |
|---|---|---|---|
| 6.1 | `@ddx/term-contract` — WS frame discriminated union (terminalId-tagged) + zod schemas | v1 | C |
| 6.2 | MCP tool input/output zod schemas (single source of truth, shared with M) — all take terminalId | v1 | C |
| 6.3 | `TerminalDescriptor` / `TerminalId` / `PidRef` / `ProcessInfo` types | v1 | C |
| 6.4 | SessionDescriptor / ResizePolicy / InputArbitration enums | v1 | C |
| 6.5 | Versioned contract (semver, mirror `@ddx/sse-contract` discipline) | v1 | C |

## 7. Observability & ops

| # | Feature | v | Owner |
|---|---|---|---|
| 7.1 | Structured pino logging (create-nestjs BootSummaryService pattern) | v1 | B/M |
| 7.2 | Swagger `/docs` for the broker REST surface | v1 | B |
| 7.3 | Health endpoint (session present, socket alive) | v1 | B |
| 7.4 | Per-session metrics (bytes in/out, attached clients, p95 latency) | v2 | B |
| 7.5 | Session recording / asciinema export | v2 | B |

## 8. Security (v1 acknowledges; v2 hardens)

| # | Feature | v | Owner |
|---|---|---|---|
| 8.1 | Localhost/single-host trust boundary (documented) | v1 | all |
| 8.2 | Command allow/deny gate in MCP (the bypassed-screening replacement) | v1 | M |
| 8.3 | Read-only "watch" session mode (capture-pane only, no send-keys) | v2 | M/B |
| 8.4 | Auth on WS + MCP surfaces (token) | v2 | B/M |
| 8.5 | Container-per-session isolation (Noxterm pattern) | v2 | B |
| 8.6 | E2E encryption (Argon2 + AES, sshx pattern) | v2 | B/W |
| 8.7 | HIPAA controls IF wired to PHI-adjacent shells (hard gate, not optional) | v2 | all |

## 9. Testing (Dudoxx convention: co-located `*.spec.ts`)

| # | Feature | v | Owner |
|---|---|---|---|
| 9.1 | Unit: control-mode parser golden-fixture tests | v1 | B |
| 9.2 | Unit: WS fan-out (one stream → N clients, per-terminalId routing, keystroke ingest) | v1 | B |
| 9.3 | Unit: each of the 9 MCP verbs (TmuxClient mocked, exact argv asserted) | v1 | M |
| 9.4 | Unit: read-cursor delta logic PER terminalId (Failure Mode #3) | v1 | M |
| 9.5 | Unit: `terminalId`↔windowId map + PID resolution (panePid/fgPid) | v1 | B |
| 9.6 | Unit: snapshot uses `capture-pane` w/o `-S` (visible grid); read uses `-S -N` (scrollback) | v1 | M |
| 9.7 | E2E: 3-way attach parity — agent `term_send` → human `capture-pane` shows it (Failure Mode #1) | v1 | M/B |
| 9.8 | E2E: multi-terminal isolation — send to `a` does not appear in `b`'s read (Feature 1.6) | v1 | M |
| 9.9 | E2E: `term_signal(pid)` rejects pid outside terminal tree (`terminalId`≠`pid`, FM#4) | v1 | M |
| 9.10 | E2E: resize invariant — agent attach does not change window width (Failure Mode #2) | v1 | B |
| 9.11 | E2E: statefulness — `cd` then `pwd` across separate calls preserves cwd (AC #4) | v1 | M |

## 10. Developer experience

| # | Feature | v | Owner |
|---|---|---|---|
| 10.1 | One-command dev bring-up (`pnpm dev` via turbo: broker + web; MCP via stdio) | v1 | root |
| 10.2 | `.mcp.json` snippet + README for registering ddx-term-mcp in Claude Code/Desktop | v1 | M |
| 10.3 | Per-package CLAUDE.md (DOX) | v1 | all |
| 10.4 | Day-zero runnable (create-nestjs/create-nextjs day-zero discipline) | v1 | all |
| 10.5 | docker-compose.dev.yml (broker + web) | v1 | root |

## Feature → AC traceability (every v1 feature reaches an AC in discuss.md)

- 1.1–1.4 → AC 2,3,4,5 · 1.6–1.10 → AC 12,13,14 (multi-terminal + dual-ID) · 2.x → AC 1,7 ·
  2.7–2.9 → AC 12,15 · 4.5 → AC 2 · 4.6 → AC 3 · 4.7 → AC 6 · 4.8/4.9 → AC 14 · 4.11 → AC 15 ·
  4.12 → FM#3 · 5.1 → AC 8 · 5.2 → AC 9 · 9.x → AC 10 · 4.1/10.2 → AC 11.
