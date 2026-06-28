---
title: MCP Tools Reference
description: All 10 ddx-term MCP tools — input schema fields, return shapes, and tmux mechanics for term_create/list/destroy/send/read/wait_for/signal/ps/panes/snapshot.
audience: developers
tags: [mcp, tools, reference, api, schemas, tmux]
updated: 2026-06-28
---

# MCP Tools Reference

The `ddx-term` MCP server exposes **10 tools**. Input/output schemas are defined in
`packages/ddx-term-contract/src/mcp-tools.ts` and registered in
`ddx-term-mcp/src/tools/registry.ts`. The server validates each request against the
verb's zod input schema (JSON Schema via `z.toJSONSchema`) before dispatch.

## Addressing conventions

- **Per-terminal verbs** take an **optional** `terminalId`; when omitted the server
  defaults it to `$DDX_TERM_DEFAULT` (`t01`).
- **`term_destroy`** takes a **required** `terminalId` — it addresses one terminal.
- Verbs **address** by `terminalId` (identity) and **signal/observe** by `pid`
  (transient). Never conflate them. See the [glossary](../00-overview/glossary.md).

## Error model

Any tool may return the shared `TermError` (MCP `isError: true`): a discriminated
union on a closed `code` enum, each branch with a `message` and a fixed `retriable`
flag. Only `TMUX_ERROR` is retriable. Codes: `SESSION_NOT_FOUND`,
`TERMINAL_NOT_FOUND`, `TERMINAL_PROTECTED`, `MAX_TERMINALS`, `PID_NOT_IN_TERMINAL`,
`COMMAND_DENIED`, `INVALID_REGEX`, `TMUX_ERROR`.

---

## Lifecycle verbs

### `term_create`
Allocate a new terminal (tmux window). **Idempotent** on an existing slug.

| Input | Type | Notes |
|---|---|---|
| `name` | `string` (≥1), optional | Slug → `term-<name>`; omitted → auto `tNN`. |
| `cwd` | `string`, optional | Working directory for the new window (`-c`). |

**Returns:** `{ terminalId, windowId, panePid, cwd, created }` — `created:false` when
an existing slug was returned idempotently.

### `term_list`
List all terminals with live process snapshots. **Input:** `{}` (none).

**Returns:** `{ terminals: TermListEntry[] }` where each entry is
`{ terminalId, windowId, title, panePid, fgPid (nullable), command, cwd, active }`.

### `term_destroy`
Close a terminal and the processes in it. **The default terminal is protected**
(returns `TERMINAL_PROTECTED`).

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId` | **Required** — addresses the terminal to close. |

**Returns:** `{ ok: true, terminalId }`.

---

## I/O verbs

### `term_send`
Type literal text into a terminal.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |
| `text` | `string` | **Required.** Typed verbatim via `send-keys -l` (literal). |
| `enter` | `boolean`, default `false` | Sends a **separate** Enter key event after the text. |

**Mechanics:** uses tmux `send-keys -l` for the literal text, then a **separate**
`send-keys Enter` when `enter:true`. It NEVER embeds `\n` in the text — newline-in-text
and the Enter key are distinct, and conflating them breaks shells and TUIs.

**Returns:** `{ ok: true, terminalId }`.

### `term_read`
Return new output since the last read (**delta**) by default.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |
| `since` | `'last' \| 'all'`, default `'last'` | `'last'` = delta since this terminal's read-cursor; `'all'` = full capture. |
| `lines` | `int > 0`, optional | Cap on returned lines (bounded by `DDX_TERM_MAX_READ_LINES`, default 2000). |

**Mechanics:** scrollback delta via `capture-pane -p -S -N` plus a per-terminal
read-cursor. **Returns:** `{ terminalId, text, fromLine, toLine, truncated }`.

### `term_snapshot`
Capture the **visible viewport grid** — what is on screen right now. Resets the
read-cursor to the tail.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |
| `lines` | `int > 0`, optional | Cap on captured lines (bounded by `DDX_TERM_MAX_READ_LINES`). |

**Mechanics:** `capture-pane -p` **WITHOUT** `-S` (visible viewport only); `-e` to
include ANSI escapes. **Returns:** `{ terminalId, cols, lines, grid, withAnsi }` —
`grid` is the cols×lines viewport, lines joined by `\n`.

> **read delta vs snapshot:** `term_read` *consumes* new output since you last looked
> and advances a cursor; `term_snapshot` *looks at the whole screen now* and resets the
> cursor. Use snapshot to inspect a TUI's current frame; use read to stream command output.

### `term_wait_for`
Block until a regex matches the visible pane or timeout — replaces fixed sleeps.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |
| `pattern` | `string` | **Required.** Regex source matched against the captured pane. Invalid regex → `INVALID_REGEX`. |
| `timeoutMs` | `int > 0`, default `30000` | Timeout before giving up. |

**Mechanics:** polls `capture-pane -p` until the regex matches or the timeout elapses.
**Returns:** `{ terminalId, matched, reason: 'pattern'\|'timeout', line?, elapsedMs }`.

---

## Process & signal verbs

### `term_signal`
Send a control key to the foreground, **or** kill a specific child pid.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |
| `signal` | `string` | **Required.** tmux key-name / signal token: `C-c`, `C-d`, `C-z`, `C-\\`, … |
| `pid` | `int ≥ 0`, optional | Target a specific child. **Validated ∈ the terminal's process tree first** (else `PID_NOT_IN_TERMINAL`). |

**Mechanics:** no `pid` → sends the tmux key-name to the foreground; with `pid` →
`kill`s that process **after** confirming it belongs to the terminal's tree.
**Returns:** `{ ok: true, terminalId, targetedPid? }`.

### `term_ps`
Resolve the terminal's live process tree (for pid targeting).

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |

**Returns:** `{ terminalId, panePid, fgPid (nullable), processes: ProcessInfo[] }`.

### `term_panes`
List the panes (splits) within a terminal with their dimensions and command.

| Input | Type | Notes |
|---|---|---|
| `terminalId` | `TerminalId`, optional | Defaults to `$DDX_TERM_DEFAULT`. |

**Returns:** `{ terminalId, panes: { id, width, height, command }[] }` — `id` is the
tmux pane id (e.g. `%3`).

---

## Verb summary

| Tool | Category | terminalId | One-line purpose |
|---|---|---|---|
| `term_create` | lifecycle | n/a | Allocate a terminal; idempotent on slug. |
| `term_list` | lifecycle | n/a | All terminals + live process snapshots. |
| `term_destroy` | lifecycle | **required** | Close a terminal; default is protected. |
| `term_send` | I/O | optional | Type literal text; `enter:true` = separate Enter. |
| `term_read` | I/O | optional | New output since last read (delta). |
| `term_snapshot` | I/O | optional | Visible viewport grid right now. |
| `term_wait_for` | I/O | optional | Block until regex matches / timeout. |
| `term_signal` | process | optional | Control key to fg, or kill validated pid. |
| `term_ps` | process | optional | Live process tree for pid targeting. |
| `term_panes` | process | optional | Panes (splits) + dimensions. |

> The README phrases this as "9 verbs + 2 helpers"; the registry has exactly **10**
> named tools. The non-destructive observers (`term_ps`, `term_snapshot`) read as the
> two helpers.

## See also

- [Configuration](./configuration.md) — `DDX_TERM_*` env that bounds these verbs.
- [Contract package](../02-packages/contract.md) — the schemas these tools use.
- [Glossary](../00-overview/glossary.md) — terminalId vs pid, snapshot vs delta.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
