# MCP-SPEC — ddx-term-mcp (the agent channel)

> Companion to `ARCHITECTURE.md`. Full specification of the MCP server that is the **chosen agent
> channel**. Mirrors the stdio MCP shape of `dudoxx-ai-hms/ddx-fhir-r4-mcp`. **Hard invariant: this
> server holds NO PTY — it shells out to `tmux` against the shared session only.**

## 1. Transport & registration

- **Transport:** stdio JSON-RPC 2.0 (MCP standard). No HTTP listener in v1.
- **Why MCP (locked):** the MCP-vs-CLI benchmark — ~23% faster, ~35k vs ~1.3-2M Haiku tokens/run
  (bypasses per-call malicious-command screening), fewer round trips. Statefulness comes from tmux,
  not the protocol; the protocol buys speed + token efficiency. Tool *design* dominates — hence thin,
  clean verbs below (the benchmark's winning property).
- **Registration** (`.mcp.json` in a Claude Code project, or Claude Desktop config):

```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "node",
      "args": ["/abs/path/ddx-term-mcp/dist/server.js"],
      "env": { "DDX_TERM_SOCKET": "/tmp/ddx-term.sock", "DDX_TERM_SESSION": "ddx-shared", "DDX_TERM_DEFAULT": "t01" }
    }
  }
}
```

## 2. Server config (env)

| Env | Default | Purpose |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket path (the shared session's socket) |
| `DDX_TERM_SESSION` | `ddx-shared` | session hosting all terminals (windows) |
| `DDX_TERM_DEFAULT` | `t01` | terminalId used when a verb omits `terminalId` (the agent's default) |
| `DDX_TERM_ALLOWLIST` | _(unset)_ | optional path to a command allow/deny policy (Feature 8.2) |
| `DDX_TERM_MAX_READ_LINES` | `2000` | hard cap on a single `term_read`/`term_snapshot` |
| `DDX_TERM_MAX_TERMINALS` | `16` | guardrail on concurrent terminals |

All tmux calls = `tmux -S $DDX_TERM_SOCKET <cmd> -t $DDX_TERM_SESSION:<windowId>`. The server resolves
`terminalId`→`windowId` via the broker's registry (or, if running standalone, its own slug↔window map
persisted in `read-cursor.ts`'s sibling `terminal-map.ts`). **No `node-pty`.**

## 2a. The two identifiers (mirror ARCHITECTURE §1a)

- **`terminalId`** — STABLE handle for one terminal (= one tmux window). What every verb ADDRESSES.
  Slug (`term-build`) or auto (`t01`). Durable across all commands run in that terminal.
- **`pid`** — TRANSIENT OS PID of a process in the terminal. What `term_signal`/`term_ps` OPERATE ON.
  `panePid` = the shell; `fgPid` = the foreground child (`pgrep -P panePid`). Never an identity.

**Rule:** address by `terminalId`; signal/observe by `pid`. Conflating them is forbidden (invariant 5).

## 3. Tool surface (9 verbs: 3 lifecycle + 6 per-terminal)

All input/output schemas live in `@ddx/term-contract/src/mcp-tools.ts` (zod/v4), imported by the
server and any client. Every per-terminal verb takes `terminalId` (defaulting to `$DDX_TERM_DEFAULT`).

### Lifecycle

#### 3.1 `term_create`
```
term_create(name?: string, cwd?: string)
```
- **Maps to:** `tmux new-window -t <session> -n <name> -c <cwd> -P -F '#{window_id} #{pane_pid}'`.
- **Behavior:** allocates a NEW terminal (tmux window) and returns its stable `terminalId`. `name`
  becomes the slug (`term-<name>`); omitted → auto `tNN`. Idempotent on an existing slug (returns it).
- **Returns:** `{ terminalId, windowId, panePid, cwd, created: boolean }`.
- **Errors:** `SESSION_NOT_FOUND`, `MAX_TERMINALS`, `TMUX_ERROR`.

#### 3.2 `term_list`
```
term_list()
```
- **Maps to:** `tmux list-windows -t <session> -F '#{window_id} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path}'`.
- **Behavior:** enumerates ALL terminals with live process snapshots. The agent's directory of what
  exists (and the human's too, via the broker REST mirror `GET /terminals`).
- **Returns:** `{ terminals: [{ terminalId, windowId, title, panePid, fgPid, command, cwd, active }] }`.
- **Errors:** `SESSION_NOT_FOUND`, `TMUX_ERROR`.

#### 3.3 `term_destroy`
```
term_destroy(terminalId: string)
```
- **Maps to:** `tmux kill-window -t <session>:<windowId>` (+ drop from registry + clear read-cursor).
- **Behavior:** closes a terminal and the processes in it. The default terminal (`$DDX_TERM_DEFAULT`)
  and window 0 (the human's) are protected unless `force` is added in a later rev.
- **Returns:** `{ ok: true, terminalId }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `TERMINAL_PROTECTED`, `TMUX_ERROR`.

### Per-terminal

#### 3.4 `term_send`
```
term_send(terminalId?: string, text: string, enter?: boolean = false)
```
- **Maps to:** `tmux send-keys -t <session>:<windowId> -l <text>` (+ `Enter` if `enter`).
- **Behavior:** injects literal keystrokes into THAT terminal's PTY. The human rendering that
  `terminalId` sees it live (AC #2). `-l` literal; control keys go via `term_signal`.
- **Returns:** `{ ok: true, terminalId }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `COMMAND_DENIED` (allow-list), `TMUX_ERROR`.

#### 3.5 `term_read`
```
term_read(terminalId?: string, since?: 'last' | 'all' = 'last', lines?: number)
```
- **Maps to:** `tmux capture-pane -p -t <session>:<windowId>` (+ `-S -<n>` for history).
- **Behavior:** DEFAULT returns the DELTA since this terminal's last read-cursor (FM#3 / Feature 4.8).
  `since:'all'` returns full visible pane (capped by `DDX_TERM_MAX_READ_LINES`). Cursor is per
  `terminalId` in `read-cursor.ts`.
- **Returns:** `{ terminalId, text, fromLine, toLine, truncated }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `TMUX_ERROR`.

#### 3.6 `term_wait_for`
```
term_wait_for(terminalId?: string, pattern: string, timeoutMs: number = 30000)
```
- **Maps to:** poll `capture-pane -p -t <session>:<windowId>` on a backing-off interval until
  `pattern` (regex) matches OR timeout.
- **Behavior:** the single biggest reliability lever — replaces fixed `sleep`. Interval 100ms→500ms.
- **Returns:** `{ terminalId, matched, reason: 'pattern'|'timeout', line?, elapsedMs }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `INVALID_REGEX`, `TMUX_ERROR`.

#### 3.7 `term_signal`
```
term_signal(terminalId?: string, signal: 'C-c'|'C-d'|'C-z'|'C-\\'|string, pid?: number)
```
- **Maps to:** default → `tmux send-keys -t <session>:<windowId> <signal>` (key-name, NOT literal);
  when `pid` is given → `kill -<sig> <pid>` against that specific process (resolved + validated to
  belong to the terminal's process tree first).
- **Behavior:** interrupt/EOF/suspend the foreground, OR signal a specific child `pid` from `term_ps`.
  This is where the **pid** identifier earns its place: you signal a process, not a terminal.
- **Returns:** `{ ok: true, terminalId, targetedPid?: number }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `PID_NOT_IN_TERMINAL`, `TMUX_ERROR`.

#### 3.8 `term_ps`
```
term_ps(terminalId?: string)
```
- **Maps to:** `tmux display-message -p -t <session>:<windowId> '#{pane_pid}'` then
  `pgrep -P <panePid>` + `ps -o pid,ppid,stat,command -p <pids>`.
- **Behavior:** resolves the live process tree for a terminal — the **pid**-side introspection. Lets
  the agent know exactly what is running (and its PID) before signalling/killing.
- **Returns:** `{ terminalId, panePid, fgPid, processes: [{ pid, ppid, stat, command }] }`.
- **Errors:** `TERMINAL_NOT_FOUND`, `TMUX_ERROR`.

#### 3.9 `term_panes` (helper)
```
term_panes(terminalId?: string)
```
- Lists panes (splits) WITHIN a terminal + dimensions: `{ terminalId, panes: [{ id, width, height, command }] }`.

#### 3.10 `term_snapshot` (helper)
```
term_snapshot(terminalId?: string, lines?: number)
```
- Full pane capture (capped) to bootstrap agent context. Resets that terminal's read-cursor to tail.

#### (v2) `term_tail`
- Server-push streaming deltas per `terminalId` via MCP notifications (v1 uses poll + `term_wait_for`).

## 3a. Sending commands & capturing output (the exact mechanics)

This is the heart of the agent channel — how a command goes in and how the rendered screen comes out.
Two capture modes matter: the **visible viewport snapshot** (the cols×lines grid the human sees right
now — for TUIs, prompts, progress) and the **scrollback delta** (new lines since last read — for
command output). They use different `capture-pane` flags.

### Sending a command (`term_send`)
```
term_send('term-build', 'npm test', enter=true)
  → tmux send-keys -t ddx-shared:@7 -l 'npm test'   # -l = LITERAL: text typed verbatim, no key-name parsing
  → tmux send-keys -t ddx-shared:@7 Enter           # separate call: Enter is a KEY NAME, never literal
```
- `-l` (literal) is mandatory for the command text so `$VAR`, `;`, `|`, and words like `Enter`/`C-c`
  inside the command are typed, not interpreted (invariant 4). The newline is sent as the `Enter`
  key in a second `send-keys`, never as `\n` in the literal text.
- Control keys (Ctrl-C, Ctrl-D) are KEY NAMES → `term_signal`, not `term_send`.
- The command lands in that terminal's real PTY, so the human watching `/term/term-build` sees the
  keystrokes + output live (the shared-state property).

### Capturing the VISIBLE viewport snapshot (cols×lines grid the human sees)
`term_snapshot(terminalId)` / the broker's `GET /terminals/:id/snapshot`:
```
# dimensions of the rendered grid
tmux display-message -p -t ddx-shared:@7 '#{pane_width}x#{pane_height}'   # e.g. 200x50 (cols x lines)

# the visible viewport ONLY — exactly what is on screen now (TUI state, prompt, spinner frame)
tmux capture-pane -p -t ddx-shared:@7                 # default = visible region, no history
#   -p   print to stdout
#   (no -S)  → only the visible cols×lines grid, not scrollback
#   add -e   → include ANSI colour/style escapes (so the snapshot renders identically in xterm.js)
#   add -J   → join wrapped lines (off by default so the grid stays width-accurate)
```
- **This is the "snapshot of the rendered visible area" you asked for.** `capture-pane` WITHOUT `-S`
  returns precisely the on-screen grid: `pane_height` rows × `pane_width` cols, padded/clipped to the
  current dimensions. For a TUI (vim/htop) or a live prompt this is the faithful current frame.
- `-e` preserves colour escapes → the agent (or a re-render) sees the styled frame, not stripped text.
- Returned shape: `{ terminalId, cols, lines, grid: string (lines joined by \n), withAnsi: boolean }`.

### Capturing the SCROLLBACK delta (new output since last read)
`term_read(terminalId, since='last')`:
```
tmux capture-pane -p -t ddx-shared:@7 -S -<N>         # -S -N = include N lines of history above the viewport
#   server keeps a per-terminal read-cursor (last toLine); returns only lines after it
```
- Use this for command OUTPUT (test results, build logs) — it returns the DELTA, capped by
  `DDX_TERM_MAX_READ_LINES` (FM#3 token guard). `since='all'` returns the full visible+history capture.
- Snapshot (viewport) answers "what's on screen"; read (scrollback delta) answers "what's new".

### Decision rule (which to call)
| Goal | Verb | tmux flags |
|---|---|---|
| "what does the screen look like right now" (TUI, prompt, spinner) | `term_snapshot` | `capture-pane -p` (+`-e`), no `-S` |
| "what did my command output since I last looked" | `term_read` (since=last) | `capture-pane -p -S -N` + cursor delta |
| "give me everything incl. history" | `term_read` (since=all) | `capture-pane -p -S -<max>` |
| "block until output contains X" | `term_wait_for` | polls `capture-pane -p` until regex |
| "what are the grid dimensions" | `term_snapshot`/`term_panes` | `display-message '#{pane_width}x#{pane_height}'` |

### Resize note (the snapshot is dimension-accurate)
Because the session size is PINNED (ARCHITECTURE §6), `pane_width`×`pane_height` are stable, so a
viewport snapshot from the agent matches what the human sees byte-for-byte. If a terminal were allowed
to renegotiate, the agent's snapshot grid could differ from the human's — which is exactly why we pin.

## 4. Error model

All errors return MCP `isError: true` with `{ code, message, retriable }`:

| code | retriable | meaning |
|---|---|---|
| `SESSION_NOT_FOUND` | no | the shared session doesn't exist — broker must create it first |
| `TERMINAL_NOT_FOUND` | no | unknown `terminalId` — call `term_list`/`term_create` |
| `TERMINAL_PROTECTED` | no | refused to destroy the default/human terminal |
| `MAX_TERMINALS` | no | `DDX_TERM_MAX_TERMINALS` reached — destroy one first |
| `PID_NOT_IN_TERMINAL` | no | `term_signal(pid)` targeted a pid outside the terminal's process tree |
| `COMMAND_DENIED` | no | allow-list rejected the command (Feature 8.2) |
| `INVALID_REGEX` | no | `term_wait_for` pattern didn't compile |
| `TMUX_ERROR` | yes | tmux exec failed (transient) — surface stderr |

## 5. Invariants (→ ddx-term-mcp/_invariants.md)

1. **MUST NEVER** create a PTY (`node-pty`, `pty.spawn`, `child_process` of a raw shell). The package
   has NO `node-pty` dependency. Reason: a private PTY breaks shared state (the webmux trap / FM#1).
2. **MUST NEVER** target a session other than `$DDX_TERM_SESSION`, or a `terminalId` not in the
   registry. Reason: accidental cross-session/cross-terminal leakage.
3. **MUST NEVER** return unbounded scrollback — every read is capped by `DDX_TERM_MAX_READ_LINES`.
   Reason: token blowout (FM#3).
4. **MUST NEVER** interpret `term_send` text as tmux key-names (always `-l` literal); key-names go
   through `term_signal`. Reason: `$`, `;`, key-like substrings would corrupt commands.
5. **MUST NEVER** conflate `terminalId` and `pid`: verbs ADDRESS by `terminalId` (durable), and only
   SIGNAL/observe by `pid` (transient). `term_signal(pid)` MUST validate the pid belongs to the
   terminal's process tree before `kill`. Reason: signalling the wrong process is destructive (FM#1/safety).
6. **MUST NEVER** exceed `DDX_TERM_MAX_TERMINALS` concurrent terminals. Reason: tmux-window sprawl +
   resource leak; force the agent to `term_destroy` finished terminals.

## 6. Tests (co-located `*.tool.spec.ts`, TmuxClient mocked)

- Each verb: asserts exact `tmux` argv it shells out to (mock `execFile`), and output parsing —
  including that `term_send` uses `-l` for text and a SEPARATE `Enter` key call (never `\n` literal).
- Lifecycle: `term_create` returns a stable `terminalId`; `term_list` enumerates N terminals with
  distinct windowIds; `term_destroy` refuses the protected default (`TERMINAL_PROTECTED`).
- ID separation: `term_ps` returns `{panePid, fgPid, processes[]}`; `term_signal(pid)` rejects a pid
  outside the terminal's tree (`PID_NOT_IN_TERMINAL`) — proves `terminalId`≠`pid` (invariant 5).
- Snapshot vs read: `term_snapshot` calls `capture-pane -p` WITHOUT `-S` (visible grid only) and
  reports `cols×lines` from `#{pane_width}x#{pane_height}`; `term_read` uses `-S -N` + cursor delta.
- `term_read` delta: two reads of a 1000-line buffer → second returns only the delta (FM#3).
- `term_wait_for`: matches before timeout; times out cleanly; rejects bad regex.
- Invariant test: grep the package for `node-pty`/`pty.spawn` → must be zero (FM#1 enforcement).
- E2E (real throwaway tmux on a temp socket): `term_create('a')` + `term_create('b')` →
  `term_send('a','echo hi',enter)` then `term_read('a')` returns `hi` while `term_read('b')` is empty
  (per-terminal isolation); a second client's `capture-pane` on window `a` shows the same (3-way parity).
