---
title: Build & Test
description: The full turbo pipeline and per-package filter commands — pnpm dev/build/test/typecheck/lint, vitest/jest, and the e2e throwaway-tmux suite.
audience: developers
tags: [build, test, turbo, pnpm, vitest, jest, e2e]
updated: 2026-06-28
---

# Build & Test

## Turbo pipeline (root)

Run from the repo root. The DAG lives in `turbo.json`.

| Command | What it does |
|---|---|
| `pnpm dev` | `turbo run dev` — broker (13330) + web (13340), persistent, no cache. **MCP excluded** (stdio-launched). |
| `pnpm build` | `turbo run build` — `dependsOn: ["^build"]`, so contract → broker + mcp + web. |
| `pnpm test` | `turbo run test` — `dependsOn: ["build"]`. |
| `pnpm typecheck` | `turbo run typecheck` — `dependsOn: ["^build"]`. |
| `pnpm lint` | `turbo run lint`. |
| `pnpm release` | `pnpm -F @dudoxx/ddx-term-mcp build:bundle && changeset publish`. |

The `^build` dependency is load-bearing: `@ddx/term-contract` MUST build before the
broker, MCP, and web, which all import its compiled types. `build` outputs are
`dist/**` and `.next/**` (excluding `.next/cache/**`).

## Per-package commands

### `@ddx/term-contract`
```sh
pnpm --filter @ddx/term-contract build       # esm + cjs + types (tsc ×3)
pnpm --filter @ddx/term-contract test         # vitest run
pnpm --filter @ddx/term-contract typecheck    # tsc --noEmit
```

### `ddx-term-broker`
```sh
pnpm --filter ddx-term-broker build           # nest build
pnpm --filter ddx-term-broker start:dev       # nest start --watch (hot reload)
pnpm --filter ddx-term-broker test            # jest --passWithNoTests
pnpm --filter ddx-term-broker tsc:check       # tsc --noEmit
```

### `@dudoxx/ddx-term-mcp`
```sh
pnpm --filter @dudoxx/ddx-term-mcp build         # tsc (dev use, not for publish)
pnpm --filter @dudoxx/ddx-term-mcp build:bundle  # tsup (publish bundle, inlines contract)
pnpm --filter @dudoxx/ddx-term-mcp test          # vitest run
pnpm --filter @dudoxx/ddx-term-mcp typecheck     # tsc --noEmit
pnpm --filter @dudoxx/ddx-term-mcp dev           # tsx src/server.ts (needs an MCP client)
```

### `ddx-term-web`
```sh
pnpm --filter ddx-term-web dev          # NODE_ENV=development node server.mjs (port 13340)
pnpm --filter ddx-term-web build        # next build
pnpm --filter ddx-term-web typecheck    # tsc --noEmit
pnpm --filter ddx-term-web lint         # next lint
pnpm --filter ddx-term-web test         # vitest run
```

## Test runners by package

| Package | Runner | Notable specs |
|---|---|---|
| `@ddx/term-contract` | vitest | `mcp-tools.spec.ts`, `ws-frames.spec.ts` |
| `ddx-term-broker` | jest | `terminal.service.spec.ts`, `term.gateway.spec.ts`, `session.service.spec.ts`, `control-mode.parser.spec.ts` |
| `@dudoxx/ddx-term-mcp` | vitest | `no-pty.spec.ts` (invariant guard), `server.e2e.spec.ts`, `term-{read,send,signal,destroy}.tool.spec.ts` |
| `ddx-term-web` | vitest | `xterm-client.spec.ts` (stubs) |
| `e2e` | (workspace pkg `@dudoxx/ddx-term-e2e`) | spins a throwaway tmux on a temp socket |

## End-to-end

`pnpm test` runs unit + e2e. The e2e suite spins a **throwaway tmux session on a
temp socket**, so it never touches your live `/tmp/ddx-term.sock` / `ddx-shared`
session. The `e2e` package is a workspace member but is ignored by the publish pipeline.

## Verify the whole tree

```sh
pnpm typecheck
pnpm lint
pnpm test
```

## See also

- [Invariants](./invariants.md) — the rules the tests guard.
- [Release flow](../05-publishing/release-flow.md) — `build:bundle` and the publish gate.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
