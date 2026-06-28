---
title: Installation
description: Prerequisites and one-command bring-up for the dudoxx-ai-terminal monorepo — Node >= 20.9, pnpm 10.24, tmux, pnpm install, pnpm build.
audience: developers
tags: [installation, prerequisites, pnpm, tmux, setup]
updated: 2026-06-28
---

# Installation

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | **>= 20.9.0** | Pinned in every `package.json` `engines.node`. The MCP bundle targets `node20`. |
| **pnpm** | **10.24.0** | Declared as `packageManager` in the root `package.json`. Use this exact line via Corepack. |
| **tmux** | 3.x (3.6a tested) | The shared session runtime. The broker shells out to it; the MCP and native clients attach to it. |

> The project is tested on tmux 3.6a. One invariant exists specifically to avoid a
> 3.6a crash on headless `new-window` — see [invariants](../04-development/invariants.md).

Enable the correct pnpm via Corepack (ships with Node):

```sh
corepack enable
corepack prepare pnpm@10.24.0 --activate
pnpm --version   # → 10.24.0
```

## Clone & install

```sh
git clone git@github.com:Dudoxx/dudoxx-ai-terminal.git
cd dudoxx-ai-terminal
pnpm install
```

`pnpm install` installs the workspace defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'       # @ddx/term-contract
  - 'ddx-term-broker'
  - 'ddx-term-mcp'
  - 'ddx-term-web'
  - 'e2e'
```

> `ddx-cli-py` / `ddx-cli-ts` are **not** workspace packages — they are interactive
> e2e-target fixtures, intentionally excluded from the globs and never built here.

## Build

```sh
pnpm build        # turbo run build (order: contract → broker + mcp + web)
```

The turbo DAG guarantees `@ddx/term-contract` builds **before** the broker, MCP, and
web, because all three import its compiled types. To build only the MCP server and
its contract dependency:

```sh
pnpm --filter @dudoxx/ddx-term-mcp... build
```

This produces `ddx-term-mcp/dist/server.js`, the binary the MCP client spawns.

## What runs where

| Component | Command | Port / transport |
|---|---|---|
| Broker | `pnpm dev` (part of turbo dev) | HTTP/WS **13330** |
| Web | `pnpm dev` (part of turbo dev) | HTTP **13340** |
| MCP server | launched by the MCP client over **stdio** | not a dev process |

The MCP server is **not** part of `pnpm dev`. It is spawned over stdio by the MCP
client (Claude Code / Claude Desktop) when registered — see
[quickstart](./quickstart.md) and [registration](../03-mcp-reference/registration.md).

## Next

- [Quickstart](./quickstart.md) — bring it up and connect all three channels.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
