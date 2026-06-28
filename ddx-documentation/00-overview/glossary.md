---
title: Glossary
description: Core terms of the dudoxx-ai-terminal bridge — terminalId vs pid, control-mode, snapshot vs read-delta, and the broker / mcp / web / contract roles.
audience: developers
tags: [glossary, terminology, terminalId, pid, control-mode]
updated: 2026-06-28
---

# Glossary

## Identity & addressing

**terminalId** — The **stable address** of a terminal, e.g. `t01`. It maps 1:1 to a
tmux **window** in the shared session. It persists across the lifetime of the
terminal and is how every channel (web tab, MCP verb, broker registry) refers to a
terminal. A terminalId never changes for the life of the window.

**pid** — A **transient process id**. It is the target for *signalling* and
*observation* (kill a specific child, resolve the foreground process), but it is
**never** used to address a terminal. Conflating `terminalId` (identity) with `pid`
(transient signal target) is a forbidden invariant violation. `term_signal` validates
that a supplied `pid` belongs to the terminal's process tree before acting.

- **panePid** — the pid of the pane's root shell process.
- **fgPid** — the pid of the current foreground process in the pane (nullable when
  the shell is idle at the prompt).

**windowId** — The tmux-internal window id (e.g. `@4`). The broker owns the
`terminalId ↔ windowId` registry; clients never see windowId directly.

## tmux concepts

**control-mode (`tmux -CC`)** — A tmux mode where tmux emits a machine-readable
output protocol instead of drawing to a TTY. The broker attaches in control-mode to
receive structured output it can fan to WS subscribers. iTerm2 and WezTerm also speak
control-mode, which is why they can attach natively (`tmux -CC attach -t ddx-shared`).

**window** — A tmux window. In this project one window == one terminal == one
`terminalId`.

**pane** — A split within a window. `term_panes` lists a terminal's panes with their
dimensions and running command. Most terminals have a single pane.

**pinned geometry (120 × 30)** — The session is created at a fixed 120 columns × 30
rows by the broker, and clients are **not** allowed to renegotiate the size. This
keeps every observer's grid identical and avoids tmux resize storms on headless hosts.

## Output capture

**read delta** — `term_read` returns only the output produced **since the last read**
for that terminal (tracked by a per-terminal read-cursor). `since:"all"` overrides
this and returns the full available scrollback capture. Implemented via tmux
`capture-pane -p -S -N`, capped by `DDX_TERM_MAX_READ_LINES` (default 2000).

**snapshot** — `term_snapshot` returns the **visible viewport grid** — the cols×lines
the human sees on screen *right now* (tmux `capture-pane -p` WITHOUT `-S`). It resets
the read-cursor to the tail. Use a snapshot to "look at the screen"; use a read delta
to "consume new output since I last looked".

## Package roles (one line each)

- **contract** (`@ddx/term-contract`) — shared zod schemas; the single type source.
- **broker** (`ddx-term-broker`) — NestJS, owns canonical state, serves the human channel.
- **mcp** (`@dudoxx/ddx-term-mcp`) — stdio MCP server; the agent channel; no PTY.
- **web** (`ddx-term-web`) — Next.js + xterm.js UI; one WS per terminalId.

## See also

- [Architecture](./architecture.md) — how these terms fit together.
- [MCP tools](../03-mcp-reference/tools.md) — where `terminalId`, `pid`, snapshot, and delta appear in the API.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
