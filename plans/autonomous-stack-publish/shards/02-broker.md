# Shard 02 — broker (ddx-term-broker, NestJS 11)

| Field | Value |
|---|---|
| Layer | NestJS service |
| Agent | Kai (nestjs-backend) |
| Skills | `nestjs-backend`, `typescript-strict` |
| Parallel? | Yes — group B, parallel with shard 03 (web). Both depend on shard 01 |
| Task id | `b1-broker-health-identity` |

## Why
The supervisor's health probe (shard 04) must read a broker IDENTITY field to defeat a foreign/zombie process on port 6481 (FM#2). The broker already has `GET /api/v1/session/health` returning an inline `{healthy, sessionId, socketPath}`. This shard makes that endpoint return the contract's `BrokerHealthSchema` shape — adding `service:'ddx-term-broker'` + `version`. Almost everything else the goal needs (127.0.0.1 default bind, `start:prod=node dist/main.js`, env-driven port) ALREADY EXISTS — verify, don't rebuild.

## Scope
1. Update `SessionController.health()` to return the contract `BrokerHealth` shape: import `BrokerHealth` from `@ddx/term-contract`, add `service: 'ddx-term-broker'` (literal) + `version` (from `package.json` — `main.ts` already imports `version as APP_VERSION`; expose it to the controller via a small `@nestjs/config`-free constant import, mirroring `main.ts` line 19 `import { version } from '../package.json'`). Delete the now-redundant inline `HealthResponse` interface.
2. **Verify (no code change expected)**: default host is `127.0.0.1` (`main.ts` line 41 `DDX_TERM_BROKER_HOST ?? '127.0.0.1'` — confirmed); `start:prod` is `node dist/main.js` (confirmed in package.json). Confirm `dist/main.js` runs under plain `node` (NestJS compiled output is plain JS — it does). Note: broker has NO auth by design (localhost-only) — do NOT add guards (recorded decision in `ddx-term-broker/CLAUDE.md`).

## Boundaries
- Do NOT add auth/guards (v1 localhost-only invariant — see broker CLAUDE.md).
- Do NOT touch the tmux control-mode or gateway code.
- Business logic stays in `SessionService`; controller only shapes the response (NestJS checklist).
- Health response shape comes from `@ddx/term-contract` — never redefine.

## Pattern basis
- `main.ts` line 19 `import { version as APP_VERSION } from '../package.json'` — reuse the identical import in the controller (or pass via service).
- Existing `SessionController.health()` body (lines 34-42) — extend, keep `isHealthy()` call.

## Verification
`pnpm --filter ddx-term-broker tsc:check && pnpm --filter ddx-term-broker lint:check && pnpm --filter ddx-term-broker test`. Boot smoke (manual, not in agent session): `start:prod` → `curl -s http://127.0.0.1:6481/api/v1/session/health` returns JSON with `"service":"ddx-term-broker"` + `"version"`.
