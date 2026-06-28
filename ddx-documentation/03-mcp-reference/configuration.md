---
title: MCP Configuration
description: Every DDX_TERM_* environment variable for the ddx-term-mcp server — socket, session, default terminal, allowlist, read caps, terminal caps, and broker URL.
audience: developers
tags: [mcp, configuration, environment-variables, ddx-term]
updated: 2026-06-28
---

# MCP Configuration

The `ddx-term-mcp` server is configured entirely through `DDX_TERM_*` environment
variables, read by `loadConfig()` in `ddx-term-mcp/src/context.ts` (applying the
defaults below). Set them in your MCP client's `env` block — see
[registration](./registration.md).

## Core variables

| Variable | Default | Meaning |
|---|---|---|
| `DDX_TERM_SOCKET` | `/tmp/ddx-term.sock` | tmux `-S` socket path of the shared session. Must match the broker's socket. |
| `DDX_TERM_SESSION` | `ddx-shared` | Name of the tmux session hosting all terminals (windows). Must match the broker. |
| `DDX_TERM_DEFAULT` | `t01` | `terminalId` used when a per-terminal verb omits `terminalId`. |
| `DDX_TERM_ALLOWLIST` | _(unset)_ | Path to a command allow-list file. When set, enforces which commands may run (else `COMMAND_DENIED`). When unset, no allow-list restriction. |
| `DDX_TERM_MAX_READ_LINES` | `2000` | Upper bound on lines returned by `term_read` / `term_snapshot`. Results past it are `truncated`. |
| `DDX_TERM_MAX_TERMINALS` | `16` | Maximum number of terminals; exceeding it returns `MAX_TERMINALS`. |

> Integer vars are parsed leniently: a non-positive or non-numeric value falls back to
> the default (`loadConfig` uses an `intOr` guard).

## Broker-resolution variables

The MCP can optionally resolve terminalId ↔ window state via the broker's REST API
rather than tmux directly. Used by `resolver-factory.ts`.

| Variable | Default | Meaning |
|---|---|---|
| `DDX_TERM_BROKER_URL` | _(unset)_ | Broker REST base URL. When set, the resolver consults the broker registry; when unset, it resolves against tmux directly. |
| `DDX_TERM_BROKER_TIMEOUT_MS` | _(see source)_ | Timeout for broker resolution calls before falling back. |

## The socket/session contract

`DDX_TERM_SOCKET` and `DDX_TERM_SESSION` are the **coordination keys** between the MCP
and the broker. All three channels (broker, MCP, native `tmux -CC`) must agree on the
same socket and session name to share state. If the MCP points at a different socket
or session than the broker, the agent and the human will see **different** terminals.

## Minimal example

```json
{
  "env": {
    "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
    "DDX_TERM_SESSION": "ddx-shared",
    "DDX_TERM_DEFAULT": "t01"
  }
}
```

The three vars above are sufficient for the standard local setup; the read/terminal
caps and allowlist are optional hardening knobs.

## See also

- [Registration](./registration.md) — where to place this `env` block.
- [Tools](./tools.md) — which verbs are bounded by `MAX_READ_LINES` / `MAX_TERMINALS`.
- [MCP package](../02-packages/mcp.md) — `loadConfig()` and the resolver internals.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
