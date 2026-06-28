---
title: "@dudoxx/ddx-term-mcp"
description: The stdio MCP server — a thin tmux client (no PTY) exposing 10 verbs to an AI agent, bundled self-contained for public npm.
audience: developers
tags: [mcp, stdio, tmux, no-pty, agent-channel, dudoxx]
updated: 2026-06-28
---

# `@dudoxx/ddx-term-mcp`

**Location:** `ddx-term-mcp`
**Role:** the **agent channel** — an MCP stdio server (JSON-RPC 2.0) that lets an AI
agent shell into the shared tmux session.
**License:** **MIT** — this is the **publishable** package (`@dudoxx/` public scope).
**Transport:** stdio (`node dist/server.js`); `bin: ddx-term-mcp → dist/server.js`.
**Version:** 0.1.3. **Module type:** ESM (`"type": "module"`).

## The NO-PTY invariant

The MCP server is a **thin tmux client — it never owns a PTY**. It has no `node-pty`
dependency; it shells out to tmux via `execFile(tmux …)` against the same session the
broker and the human are attached to. That shared-state property is the entire point:
a command the agent types is visible live in the web UI.

This invariant is **mechanically enforced** by `ddx-term-mcp/src/no-pty.spec.ts`,
which fails the build if `node-pty` ever appears in the dependency graph. See
[invariants](../04-development/invariants.md).

## Source layout

`ddx-term-mcp/src/`:

| File | Role |
|---|---|
| `server.ts` | Entry point. Builds the MCP context + server, registers `ListTools` + `CallTool`. |
| `context.ts` | `loadConfig()` — reads `DDX_TERM_*` env with defaults; the `ToolContext`. |
| `tools/registry.ts` | The verb table: name → handler + description, and `dispatch()`. |
| `tools/term-*.tool.ts` | One handler file per verb (10 total). |
| `allow-list.ts` | Command allow-list enforcement (`DDX_TERM_ALLOWLIST`). |
| `capture-util.ts` | tmux `capture-pane` helpers (read delta / snapshot). |
| `read-cursor.ts` | Per-terminal read-cursor for `term_read` deltas. |
| `registry-resolver.ts` / `resolver-factory.ts` | Resolve terminalId ↔ window, optionally via the broker (`DDX_TERM_BROKER_URL`). |
| `tmux/` | The `execFile(tmux …)` client. |

## Request lifecycle

1. The MCP client sends a `CallTool` request.
2. `server.ts` validates the input against the verb's schema from
   `@ddx/term-contract` (`TERM_TOOL_INPUT_SCHEMAS`, derived to JSON Schema via
   `z.toJSONSchema`) — **before** dispatch, so the handler receives a narrowed type.
3. `registry.ts:dispatch()` routes to the verb's handler.
4. The handler shells out via `execFile(tmux …)` and returns the verb's output
   object, JSON-serialized by the server. Errors return the shared `TermError`
   shape with MCP `isError: true`.

## The 10 verbs

Registered in `registry.ts` (`TERM_TOOL_DESCRIPTIONS` + `dispatch`):
`term_create`, `term_list`, `term_destroy`, `term_send`, `term_read`,
`term_wait_for`, `term_signal`, `term_ps`, `term_panes`, `term_snapshot`.

Full input schemas, return shapes, and mechanics: [MCP tools](../03-mcp-reference/tools.md).

## Configuration

All behaviour is env-driven via `loadConfig()` in `context.ts`. The key defaults:
socket `/tmp/ddx-term.sock`, session `ddx-shared`, default terminal `t01`, max read
lines 2000, max terminals 16. Full table: [configuration](../03-mcp-reference/configuration.md).

## Build & test

```sh
pnpm --filter @dudoxx/ddx-term-mcp build         # tsc (dev use)
pnpm --filter @dudoxx/ddx-term-mcp build:bundle  # tsup (publish bundle — inlines the contract)
pnpm --filter @dudoxx/ddx-term-mcp test          # vitest run
pnpm --filter @dudoxx/ddx-term-mcp typecheck     # tsc --noEmit
pnpm --filter @dudoxx/ddx-term-mcp dev           # tsx src/server.ts (needs an MCP client)
```

Tests: `no-pty.spec.ts` (the invariant guard), `server.e2e.spec.ts`, and per-tool
specs for `term-read`, `term-send`, `term-signal`, `term-destroy`. No source TODOs.

## Publishing

The package is **publish-ready to public npm**. `tsup` (via `prepublishOnly`) bundles
`@ddx/term-contract` from source into a single self-contained `dist/server.js`,
keeping `zod` and `@modelcontextprotocol/sdk` external. The historical "npx not
available" note (workspace:* dep) is **stale** — the bundle resolves the dep at build
time. Full story: [release flow](../05-publishing/release-flow.md) and
[registration](../03-mcp-reference/registration.md).

## See also

- [Tools](../03-mcp-reference/tools.md) · [Configuration](../03-mcp-reference/configuration.md) · [Registration](../03-mcp-reference/registration.md)
- [Contract package](./contract.md) — the schemas this server validates against.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
