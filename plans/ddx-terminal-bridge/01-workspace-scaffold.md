# Shard 01 — Workspace scaffold (Group A)

**Task id:** `A1` · **Agent:** general-purpose · **Skills:** typescript-strict · **Parallel?** No (blocks all)

## Why this shard
`dudoxx-ai-terminal` is its own pnpm workspace (NOT a module inside `dudoxx-ai-hms` — HMS services are
independent, this repo is a fresh monorepo). Per ARCHITECTURE §4 the topology is: workspace root +
`packages/ddx-term-contract` + three `ddx-term-*` app packages. This shard lays the root rails so the
three later groups can `pnpm -F` build/test independently and `turbo` can pipeline them.

## Architectural decisions (Decision Rubric)
- **Workspace manager = pnpm + turbo** — In-Session requirement ("pnpm workspace root ← dudoxx-ai-terminal
  IS its own workspace ... create pnpm-workspace.yaml + root package.json + turbo"). Rung 0.
- **Package glob** — `packages/*` + the three app dirs (`ddx-term-broker`, `ddx-term-mcp`, `ddx-term-web`)
  listed explicitly, mirroring how HMS keeps `packages/*` plus named app roots.
- **docker-compose.dev** — broker + web only (MCP is stdio, launched by the agent client, not a service).
  Mirrors `create-nestjs` `docker-compose.dev.yml`.
- The two existing fixture dirs (`ddx-cli-py`, `ddx-cli-ts`) stay OUT of the workspace globs (they are
  e2e interactive-target fixtures, not workspace packages) — but are NOT deleted.

## Boundaries
- Do NOT create package internals here (that is Groups A2/B/C). Only root files + empty package dirs are
  out of scope — leave package scaffolding to their owners.
- Do NOT add `node-pty` anywhere in the root (invariant; the MCP trap).

## Verification
`pnpm install` resolves with zero errors; `pnpm -r exec true` enumerates the workspace; `turbo run build
--dry` lists the pipeline. See tasks.json `A1.validation`.
