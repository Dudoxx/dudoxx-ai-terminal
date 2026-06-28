# dudoxx-ai-terminal — CLAUDE.md (root DOX contract)

> Binding work contract for this repo. Per-package CLAUDE.md files (closer-wins for
> local detail) live in each workspace package and are the authority for that package.
> This root doc carries repo-wide rules only. See the cascade index at the bottom.

## Purpose
**Shared multi-terminal bridge** — one pinned `tmux` session is the canonical shared
state; a **human** (web/xterm.js) and an **AI agent** (MCP) attach to the *same*
terminals simultaneously. Four workspace packages + two CLI e2e fixtures.

| Package | Role | Port / transport | CLAUDE.md |
|---|---|---|---|
| `@ddx/term-contract` | zod schemas: WS frames, MCP tool I/O, descriptors | library (ESM+CJS+types) | `packages/ddx-term-contract/CLAUDE.md` |
| `ddx-term-broker` | human channel + canonical state (NestJS 11) | HTTP/WS **6481** | `ddx-term-broker/CLAUDE.md` |
| `@dudoxx/ddx-term-mcp` | agent channel: MCP stdio, thin tmux client (no PTY) | stdio | `ddx-term-mcp/CLAUDE.md` |
| `ddx-term-web` | xterm.js UI, one tab per terminalId (Next.js 16) | HTTP **3460** | `ddx-term-web/CLAUDE.md` |

`ddx-cli-py` / `ddx-cli-ts` are interactive e2e-target fixtures — NOT workspace
packages, never built or published from here.

## Repo-wide invariants (the cascade floor — see `context/_invariants.md`)
- **The MCP server NEVER holds a PTY** — it shells out to `tmux` only (`no-pty.spec.ts`
  guards this). A private PTY breaks shared state.
- **`terminalId` = stable address; `pid` = transient signal target.** Never conflate.
- **All cross-boundary types come from `@ddx/term-contract`** — never redefine a frame
  or descriptor in broker/mcp/web.
- **Broker pins session size (120×30)** and owns canonical dims — no client renegotiation.
- **Zero `any`** across all TypeScript.

## Stack
- Monorepo: pnpm `10.24.0` + turbo `2.5` + changesets. Node `>=20.9`.
- TS `5.7` strict everywhere; `@ddx/term-contract` builds before broker/mcp/web (turbo DAG).
- Only `@dudoxx/ddx-term-mcp` is published (public npm). Others are private by design.

## Verification (root)
```sh
pnpm typecheck      # turbo run typecheck across all packages
pnpm lint
pnpm test           # unit + e2e (e2e spins throwaway tmux on a temp socket)
pnpm build          # contract → broker + mcp + web
```
Never run `pnpm dev` / `start` in an agent session (long-running foreground — Cardinal #4).

## Documentation
- `ddx-documentation/` — full technical docs tree (architecture, packages, MCP reference,
  development, publishing) for coders. Start at `ddx-documentation/README.md`.
- `CLAUDE_ARCHITECTURE.md`, `CLAUDE_PACKAGES.md`, `CLAUDE_PUBLISHING.md` — referencable
  deep-dives loaded on demand (see below).
- `INSTALLATION.md` · `SETUP.md` · `DEPENDENCIES.md` · `CHANGELOG.md` — root operational docs.

## Referencable docs (load on demand)
@import-on-demand: CLAUDE_ARCHITECTURE.md, CLAUDE_PACKAGES.md, CLAUDE_PUBLISHING.md

## Child CLAUDE.md index (closer-wins for local detail)
- `packages/ddx-term-contract/CLAUDE.md` — shared schema contract
- `ddx-term-broker/CLAUDE.md` — tmux control-mode footguns, registry reconcile, raw ws.Server
- `ddx-term-mcp/CLAUDE.md` — the NO-PTY invariant, send/capture mechanics, env
- `ddx-term-web/CLAUDE.md` — per-terminal WS, snapshot restore, Dudoxx frontend rules

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
