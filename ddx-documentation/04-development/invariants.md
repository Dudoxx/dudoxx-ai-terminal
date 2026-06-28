---
title: Invariants
description: The load-bearing rules of the bridge — NO PTY, terminalId≠pid, 120×30 pinned, send -l literal, tmux -f /dev/null, never manual window-size.
audience: developers
tags: [invariants, rules, no-pty, tmux, contract, must-never]
updated: 2026-06-28
---

# Invariants

These are the non-negotiable rules the system depends on. Several are mechanically
enforced by tests; the rest are documented contracts that a change must not break.
Canonical source: `plans/ddx-terminal-bridge/_invariants.md` and the per-package
CLAUDE.md cascade.

## 1. NO PTY in the MCP server

The MCP server is a **thin tmux client — it never owns a PTY**. It has **no
`node-pty` dependency**; it shells out via `execFile(tmux …)`. The PTY lives on the
**broker** side (its control-mode attach), which is correct.

- **Enforced by:** `ddx-term-mcp/src/no-pty.spec.ts` — the build fails if `node-pty`
  enters the MCP dependency graph.
- **Why:** the shared-state property only holds if every party writes through the same
  tmux session. An MCP-side PTY would be a private, unshared terminal.

## 2. `terminalId` ≠ `pid`

`terminalId` is the **stable address** (a tmux window); `pid` is a **transient signal
target**. Verbs **address** by terminalId and **signal/observe** by pid. Conflating
them is forbidden. `term_signal` validates a supplied `pid` against the terminal's
process tree before acting (`PID_NOT_IN_TERMINAL` otherwise). See the
[glossary](../00-overview/glossary.md).

## 3. Session pinned at 120 × 30

The broker creates the session at a fixed **120 columns × 30 rows**, and **no client
may renegotiate** the size. Every observer (web, agent, native) sees an identical grid.
This avoids resize storms and keeps captures deterministic.

## 4. `send-keys -l` literal + separate Enter

`term_send` types text with tmux `send-keys -l` (**literal**) and sends Enter as a
**separate** `send-keys Enter` event when `enter:true`. **Never embed `\n`** in the
text — the literal text and the Enter key are distinct events, and conflating them
breaks shells and TUIs.

## 5. Broker creates the session with `tmux -f /dev/null`

The shared session MUST be created with `tmux -f /dev/null` so it does **not** inherit
the developer's `~/.tmux.conf`. A user config could rebind keys, change the prefix, or
alter status formatting and silently break control-mode parsing and the pinned geometry.

## 6. Never `set-window-option -g window-size manual`

Setting `window-size manual` **crashes tmux 3.6a** on a headless `new-window`. The
broker must never issue it. Window sizing is governed by the pinned 120×30 geometry
(invariant 3), not manual per-window sizing.

## 7. Shared zod types live ONLY in `@ddx/term-contract`

Every cross-boundary shape (WS frames, MCP tool I/O, terminal/session descriptors) is
defined once in `@ddx/term-contract` and imported by the broker, MCP, and web. Types
are **never duplicated downstream** — a redefinition in a consumer is a contract
violation. The web client comment makes this explicit: frame types are imported only
from the contract, never redefined.

## 8. The session is never killed on broker restart

On restart the broker runs `reconcileRegistry()` to re-adopt live tmux windows. It
must **not** kill or recreate the session — the tmux session is the durable state and
the broker is a stateless view onto it. See [broker](../02-packages/broker.md).

## Enforcement summary

| # | Invariant | Enforced by |
|---|---|---|
| 1 | NO PTY in MCP | `no-pty.spec.ts` (test) |
| 2 | terminalId ≠ pid | `term_signal` pid-validation + contract docs |
| 3 | 120×30 pinned | broker session creation |
| 4 | `send -l` + separate Enter | `term-send.tool.ts` + spec |
| 5 | `tmux -f /dev/null` | broker session creation |
| 6 | no manual window-size | broker (documented prohibition) |
| 7 | types only in contract | compile-time + CLAUDE.md contract |
| 8 | session survives restart | `reconcileRegistry()` + `session.service.spec.ts` |

## See also

- [Architecture](../00-overview/architecture.md) — the model these rules protect.
- [Contributing](./contributing.md) — how to keep them intact in a change.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
