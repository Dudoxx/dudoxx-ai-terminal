---
title: MCP Registration
description: Three ways to register the ddx-term MCP server — project .mcp.json absolute-path form, claude mcp add --scope user, and the npx form once published.
audience: developers
tags: [mcp, registration, mcp-json, claude-mcp-add, npx]
updated: 2026-06-28
---

# MCP Registration

There are three ways to register the `ddx-term` MCP server with a client (Claude Code
/ Claude Desktop). Pick by situation:

- **npx form** — once the package is published; zero local build. **Recommended** for
  consumers.
- **`claude mcp add --scope user`** — register for every Claude Code session.
- **Project `.mcp.json` (absolute path)** — local development against unpublished source.

All three set the same `DDX_TERM_*` env — see [configuration](./configuration.md).

## 1. npx form (published package — primary)

`@dudoxx/ddx-term-mcp` is published to public npm as a self-contained, `bin`-shaped
ESM bundle (the contract is bundled in at build time). No clone, no local build:

```sh
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- npx -y @dudoxx/ddx-term-mcp
```

Or as a project `.mcp.json`:

```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "npx",
      "args": ["-y", "@dudoxx/ddx-term-mcp"],
      "env": {
        "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
        "DDX_TERM_SESSION": "ddx-shared",
        "DDX_TERM_DEFAULT": "t01"
      }
    }
  }
}
```

> **Note on the old README warning:** earlier docs said the npx form was "NOT
> available yet" because of a `workspace:*` contract dep. That is **stale**.
> `tsup.config.ts` (`noExternal: ['@ddx/term-contract']`) bundles the contract into
> `dist/server.js`, wired via `prepublishOnly` — so the published package has no
> `workspace:*` dependency and resolves cleanly under npx. See
> [release flow](../05-publishing/release-flow.md).

## 2. `claude mcp add --scope user` (local dev, absolute path)

For development against the unpublished source, build the binary and point at it by
absolute path (run from the repo so `$PWD` resolves):

```sh
pnpm -F @dudoxx/ddx-term-mcp build      # produces an executable dist/server.js
claude mcp add ddx-term --scope user \
  --env DDX_TERM_SOCKET=/tmp/ddx-term.sock \
  --env DDX_TERM_SESSION=ddx-shared \
  --env DDX_TERM_DEFAULT=t01 \
  -- node "$PWD/ddx-term-mcp/dist/server.js"
```

Verify:

```sh
claude mcp list      # ddx-term … ✔ Connected
```

## 3. Project `.mcp.json` (absolute path)

A copy lives at [`.mcp.json.example`](../../.mcp.json.example) — replace `/abs/path`
with this repo's absolute path:

```json
{
  "mcpServers": {
    "ddx-term": {
      "command": "node",
      "args": ["/abs/path/dudoxx-ai-terminal/ddx-term-mcp/dist/server.js"],
      "env": {
        "DDX_TERM_SOCKET": "/tmp/ddx-term.sock",
        "DDX_TERM_SESSION": "ddx-shared",
        "DDX_TERM_DEFAULT": "t01"
      }
    }
  }
}
```

## Which to use

| Situation | Use |
|---|---|
| Consuming the published package | **npx form** (1) |
| Want it in every Claude session | `claude mcp add --scope user` (2 or 1) |
| Developing against local source | absolute-path forms (2 or 3) |

## See also

- [Configuration](./configuration.md) — all `DDX_TERM_*` env.
- [Quickstart](../01-getting-started/quickstart.md) — registration in the bring-up flow.
- [Release flow](../05-publishing/release-flow.md) — how the npx-ready bundle is produced.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
