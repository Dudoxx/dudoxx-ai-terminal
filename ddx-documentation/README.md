---
title: dudoxx-ai-terminal — Technical Documentation
description: Documentation index for the shared multi-terminal bridge — one tmux session, attached by a human (web/xterm.js) and an AI agent (MCP) simultaneously.
audience: developers
tags: [index, monorepo, tmux, mcp, terminal-bridge]
updated: 2026-06-28
---

# dudoxx-ai-terminal — Documentation

`dudoxx-ai-terminal` is a **shared multi-terminal bridge**. One pinned-size `tmux`
session is the canonical shared state; a NestJS **broker** owns the terminal
registry and fans output to a web UI per terminal over WebSocket; an **MCP**
server lets an AI agent (Claude Code / Claude Desktop) shell out to that same
session (it holds no PTY); a Next.js **web** app renders the terminals with
xterm.js. A **human**, an **AI agent**, and a **native tmux client** can all watch
and drive the exact same terminals at the same time.

This documentation set is for **technical users and coders** working on or
integrating with the monorepo. It is a static Markdown tree — no build step.

## Table of contents

### 00 — Overview
- [Architecture](./00-overview/architecture.md) — the shared-tmux-state model, the three channels (human / agent / native), the data-flow diagram.
- [Glossary](./00-overview/glossary.md) — `terminalId` vs `pid`, control-mode, snapshot vs read-delta, the broker/mcp/web/contract roles.

### 01 — Getting started
- [Installation](./01-getting-started/installation.md) — prerequisites (Node >= 20.9, pnpm 10.24, tmux), `pnpm install`, one-command bring-up.
- [Quickstart](./01-getting-started/quickstart.md) — `pnpm dev` → web at :13340, register the MCP server, attach natively via iTerm2 `tmux -CC`.

### 02 — Packages
- [`@ddx/term-contract`](./02-packages/contract.md) — the shared zod schemas, WS frames, MCP tool I/O, the triple (ESM/CJS/types) build.
- [`ddx-term-broker`](./02-packages/broker.md) — NestJS 11, port 13330, the registry, REST CRUD, raw `ws.Server` fan-out, `reconcileRegistry`.
- [`@dudoxx/ddx-term-mcp`](./02-packages/mcp.md) — the stdio MCP server, the thin tmux client, the NO-PTY invariant.
- [`ddx-term-web`](./02-packages/web.md) — Next.js 16, xterm.js, one WS per terminalId, snapshot restore.

### 03 — MCP reference
- [Tools](./03-mcp-reference/tools.md) — all 10 tools (`term_create` / `list` / `destroy` / `send` / `read` / `wait_for` / `signal` / `ps` / `panes` / `snapshot`) with input schemas, return shapes, and mechanics.
- [Configuration](./03-mcp-reference/configuration.md) — every `DDX_TERM_*` environment variable, default, and meaning.
- [Registration](./03-mcp-reference/registration.md) — `.mcp.json` absolute-path form, `claude mcp add --scope user` form, and the `npx` form (once published).

### 04 — Development
- [Build & test](./04-development/build-and-test.md) — the full turbo pipeline and per-package filter commands.
- [Invariants](./04-development/invariants.md) — the load-bearing rules: NO PTY, `terminalId` ≠ `pid`, 120×30 pinned, `send -l` literal, `tmux -f /dev/null`, never manual window-size.
- [Contributing](./04-development/contributing.md) — branch naming, commit style, attribution, changeset-per-change.

### 05 — Publishing
- [Release flow](./05-publishing/release-flow.md) — changesets, the tsup bundling story, `release.yml` CI, the `NPM_TOKEN` secret, version bumping.

## Repository at a glance

| Package | Role | Port / transport | Published? |
|---|---|---|---|
| `@ddx/term-contract` (`packages/ddx-term-contract`) | Shared zod types | library (ESM+CJS+types) | No (bundled into MCP) |
| `ddx-term-broker` | Human channel + canonical state | HTTP/WS **13330** | No |
| `@dudoxx/ddx-term-mcp` | Agent channel: MCP stdio server | stdio | **Yes** (`@dudoxx/` scope, MIT) |
| `ddx-term-web` | Next.js 16 xterm.js UI | HTTP **13340** | No |

> `ddx-cli-py` / `ddx-cli-ts` are interactive e2e-target fixtures, **not** workspace
> packages — never built or published from here.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
