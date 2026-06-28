---
title: "@ddx/term-contract"
description: The shared zod/v4 contract package — WS frames, MCP tool I/O, terminal/session descriptors, and its triple ESM/CJS/types build.
audience: developers
tags: [contract, zod, schemas, ws-frames, mcp-tools, shared-types]
updated: 2026-06-28
---

# `@ddx/term-contract`

**Location:** `packages/ddx-term-contract`
**Role:** the single source of truth for every cross-boundary shape in the bridge.
**Runtime logic:** none — pure types + zod only. No tmux, no Nest, no React, no `node-pty`.
**Published:** **No** — `private: true`, `UNLICENSED`. It is bundled into the MCP
server at publish time (see [release flow](../05-publishing/release-flow.md)), so it
never needs to exist on a registry.

## Why it exists

The broker (NestJS), the MCP server (stdio), and the web client (Next.js + xterm.js)
**all import from here**. Types are never duplicated downstream — a single change to a
schema propagates to all three consumers and is caught at compile time. This is a
project invariant.

## Source layout

`packages/ddx-term-contract/src/`:

| File | Exports |
|---|---|
| `index.ts` | Barrel — re-exports all of the below. |
| `terminal.ts` | `TerminalIdSchema`, `ProcessInfoSchema`, terminal/process descriptors. |
| `session.ts` | Session descriptors + policy enums. |
| `ws-frames.ts` | The control-mode → WebSocket frame **discriminated union**. |
| `mcp-tools.ts` | One zod **input** + one zod **output** schema per MCP verb, plus the error model. |

`index.ts` (`packages/ddx-term-contract/src/index.ts`) is the only public surface:

```ts
export * from './terminal';
export * from './session';
export * from './ws-frames';
export * from './mcp-tools';
```

## Key exports

- **`TERM_TOOL_NAMES`** — the canonical ordered list of the 10 verb names.
- **`TERM_TOOL_INPUT_SCHEMAS`** / **`TERM_TOOL_OUTPUT_SCHEMAS`** — input/output zod
  schemas keyed by verb name. The MCP server validates every request against the
  input schema (derived to JSON Schema via `z.toJSONSchema`) before dispatch.
- **`TermErrorSchema`** / **`TermErrorCodeSchema`** — the shared error model: a
  discriminated union on a closed `code` enum, each branch carrying a `message` and a
  fixed `retriable` boolean.

### The error model

`mcp-tools.ts` defines a closed set of error codes; only transient tmux failures are
retriable:

| Code | retriable |
|---|---|
| `SESSION_NOT_FOUND` | false |
| `TERMINAL_NOT_FOUND` | false |
| `TERMINAL_PROTECTED` | false |
| `MAX_TERMINALS` | false |
| `PID_NOT_IN_TERMINAL` | false |
| `COMMAND_DENIED` | false |
| `INVALID_REGEX` | false |
| `TMUX_ERROR` | **true** |

The canonical map lives at `TERM_ERROR_RETRIABLE` in
`packages/ddx-term-contract/src/mcp-tools.ts`.

## Build (triple output)

`@ddx/term-contract` builds with **pure `tsc`** across three configs — ESM, CJS, and
type declarations:

```sh
pnpm --filter @ddx/term-contract build       # esm + cjs + types (tsc ×3)
pnpm --filter @ddx/term-contract test         # vitest run
pnpm --filter @ddx/term-contract typecheck    # tsc --noEmit
```

`files: ["dist", "src"]` — both the compiled output and the source ship in the package
folder. Shipping `src` matters: the MCP bundler (tsup) is aliased to the contract's
`src/index.ts` so it compiles the contract fresh as ESM rather than re-bundling an
emitted `require("zod/v4")` (which breaks under ESM). See the
[release flow](../05-publishing/release-flow.md) for why.

## Tests

`vitest` — `mcp-tools.spec.ts` (verb-schema exhaustiveness) and `ws-frames.spec.ts`
(frame union coverage). No TODO/FIXME markers in source.

## See also

- [MCP tools](../03-mcp-reference/tools.md) — the verb I/O these schemas define.
- [MCP package](./mcp.md) — the consumer that bundles this contract.
- [Architecture](../00-overview/architecture.md) — where the WS frames flow.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
