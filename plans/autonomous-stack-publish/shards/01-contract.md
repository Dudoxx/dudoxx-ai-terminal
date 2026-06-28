# Shard 01 — contract (@ddx/term-contract)

| Field | Value |
|---|---|
| Layer | shared types (zod) |
| Agent | Vera (typescript-strict) |
| Skills | `typescript-strict` |
| Parallel? | No — root of the DAG; everything depends on it |
| Task ids | `c1-ports-consts`, `c2-health-schema`, `c3-error-codes` |

## Why this shard first
Per repo invariant (root CLAUDE.md + `packages/ddx-term-contract/CLAUDE.md`): **all cross-boundary types live HERE and ONLY here**. The supervisor (MCP), broker health endpoint, and web server.mjs must agree on (a) canonical ports + env var names, (b) the health-response shape carrying a broker IDENTITY field, (c) the new error codes the supervisor raises. Defining these anywhere else duplicates a schema = invariant violation. Builds first via turbo `^build` DAG.

## Scope
1. **Ports/endpoints constants module** (`src/ports.ts`, re-exported from `index.ts`). A single source for: broker port 6481 (`DDX_TERM_BROKER_PORT`), web port 3460 (`DDX_TERM_WEB_PORT`), tmux socket `/tmp/ddx-term.sock` (`DDX_TERM_SOCKET`), loopback host `127.0.0.1`. Provide a resolver helper `resolvePorts(env)` returning typed numbers with env override + the canonical defaults as `as const`. Also export the health path constant `BROKER_HEALTH_PATH = '/api/v1/session/health'` so the supervisor and broker never drift on the route string.
2. **Health-identity schema** — extend the broker health response shape. Today `SessionController.health()` returns an inline `HealthResponse {healthy, sessionId, socketPath}` (NOT from the contract). Add `BrokerHealthSchema` to `src/session.ts` adding two IDENTITY fields: `service: z.literal('ddx-term-broker')` and `version: z.string().min(1)`, plus the existing `healthy`, `sessionId`, `socketPath`. The literal `service` field is the anti-zombie discriminator (FM#2): a foreign process on 6481 cannot fake `service:'ddx-term-broker'`.
3. **New error codes** — add `PORT_CONFLICT` and `STACK_LAUNCH_FAILED` to `TermErrorCodeSchema` (`src/mcp-tools.ts`), to `TERM_ERROR_RETRIABLE` (both `false` — a port conflict / launch failure is not auto-retriable), and to the `TermErrorSchema` discriminated union. These are raised by the supervisor (shard 04).

## Boundaries
- Pure types + zod ONLY. No runtime tmux/Nest/React/node code, no node-pty.
- Do NOT change the 10 `term_*` verb I/O schemas.
- Keep the dual-build (esm+cjs+types) green; `index.ts` barrel re-exports the new `ports.ts`.

## Pattern basis
- Mirror `src/session.ts` `SessionDescriptorSchema` shape (z.object + inferred type + a `DEFAULT_*` const) for `ports.ts` and `BrokerHealthSchema`.
- Mirror the existing enum-extension shape in `mcp-tools.ts` lines 32-71 for the two new codes (enum + retriable map row + discriminated-union branch — all three in lockstep).

## Verification
`pnpm --filter @ddx/term-contract build && pnpm --filter @ddx/term-contract test && pnpm --filter @ddx/term-contract typecheck`
