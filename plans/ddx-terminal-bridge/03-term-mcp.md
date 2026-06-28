# Shard 03 — ddx-term-mcp (Group B)

**Task ids:** `B1` (TmuxClient + read-cursor + terminal-map), `B2` (9 verbs + server.ts + allow-list + specs)
**Agent:** general-purpose · **Skills:** typescript-strict · **Parallel?** Yes — runs alongside the broker (Group B)

## Why this shard
The agent channel (user-locked: "opt for mcp approach"). A stdio JSON-RPC MCP server that is a THIN
client over the shared tmux session — it shells out to `tmux` only and **owns no PTY** (`_invariants.md`
MUST-NEVER; the webmux trap / discuss.md FM#1). This is the real agent deliverable and is testable
standalone against a throwaway tmux on a temp socket (ARCHITECTURE §9 step 3). MCP-SPEC.md is the binding
verb spec; SPIKE.md §"Exact commands proven" gives the known-good tmux strings each verb wraps.

## Mirror (Pattern Basis)
`dudoxx-ai-hms/ddx-fhir-r4-mcp/` — stdio MCP shape: `src/server.ts` (registers tools) + thin client
(`fhir-client.ts` → here `tmux/tmux.client.ts`). `@modelcontextprotocol/sdk` dep, `type: module`,
`bin` entry, `dev = tsx src/server.ts`, `build = tsc`. **Difference:** the contract uses zod/v4 so the
MCP package depends on `@ddx/term-contract` for all tool schemas (HMS fhir-mcp inlined zod/v3 — do NOT
copy that; import schemas from the contract instead).

## The two-identifier discipline (B1)
- `tmux.client.ts` = thin `execFile('tmux', [...])` wrapper. Every call uses `-S $DDX_TERM_SOCKET` and
  targets `$DDX_TERM_SESSION:<windowId>`. Methods map 1:1 to SPIKE's proven strings.
- `terminal-map.ts` = standalone-mode slug↔windowId map; `read-cursor.ts` = per-`terminalId` last-read
  offset → DELTA reads. In broker-attached mode the map is resolved via broker REST `GET /terminals`
  (the registry-ownership gap — see shard 06). B1 implements BOTH a local map and a broker-query path.

## The 9 verbs + 2 helpers (B2) — exact mechanics from MCP-SPEC §3, §3a
- **Send:** `send-keys -l <text>` then a SEPARATE `send-keys Enter` (never `\n` literal). Control keys +
  TUI arrows (`Up/Down/C-c`) go via `term_signal` KEY NAMES — never literal (SPIKE Spike 2 / invariant).
- **Snapshot vs read:** `term_snapshot` = `capture-pane -p` WITHOUT `-S` (visible grid) + dims from
  `#{pane_width}x#{pane_height}`, optional `-e` ANSI. `term_read` = `capture-pane -p -S -N` + cursor delta.
- **term_signal(pid):** validate `pid ∈ terminal process tree` (resolve via `#{pane_pid}` + `pgrep -P`)
  BEFORE `kill` → else `PID_NOT_IN_TERMINAL`. This is the terminalId≠pid proof (FM#4).
- **term_wait_for:** poll `capture-pane -p` 100ms→500ms backoff until regex or timeout.
- Allow-list hook gated by `DDX_TERM_ALLOWLIST` (Feature 8.2) — we own the command gate post-MCP.

## Boundaries
- NO `node-pty` / `pty.spawn` / raw-shell `child_process` (only `tmux`/`ps`/`pgrep`/`kill`). A grep test
  asserts zero `node-pty` (FM#1 enforcement).
- Do NOT target a session other than `$DDX_TERM_SESSION` (invariant 2).

## Verification
Per-verb `*.tool.spec.ts` assert exact tmux argv (mock `execFile`). E2E on a real temp-socket tmux:
multi-terminal isolation, terminalId≠pid signal-reject, delta-read. See tasks.json `B1`,`B2`.
