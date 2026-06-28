# s1-supervisor — Progress

## Files created / modified

### Created
- `ddx-term-mcp/src/supervisor/paths.ts` — lock dir + BROKER/WEB_ENTRY constants (import.meta-relative)
- `ddx-term-mcp/src/supervisor/lockfile.ts` — O_EXCL acquireLock/releaseLock/readLock/reclaimStaleLock
- `ddx-term-mcp/src/supervisor/health.ts` — probeHealth (BrokerHealthSchema validation) + HealthFetch injectable
- `ddx-term-mcp/src/supervisor/spawn.ts` — spawnDetached (process.execPath, detached+unref, no shell/PTY) + SpawnFn injectable
- `ddx-term-mcp/src/supervisor/ensure-stack.ts` — ensureStack orchestrator; EnsureStackDeps (spawnFn, healthFetch, tcpProbe, brokerEntry, webEntry)
- `ddx-term-mcp/src/supervisor/lockfile.spec.ts` — 11 tests (FM#1 coverage)
- `ddx-term-mcp/src/supervisor/health.spec.ts` — 9 tests (FM#2 coverage)
- `ddx-term-mcp/src/supervisor/ensure-stack.spec.ts` — 8 tests (FM#3 + env-vars + STACK_LAUNCH_FAILED)

### Modified
- `ddx-term-mcp/src/server.ts` — added `import { ensureStack }`, `makeEnsureOnce()` memoizer, `buildServer(env)` signature (was `buildServer(ctx)`), lazy `getCtx()`, `ensureOnce()` call at top of CallToolRequestSchema handler before dispatch.

## Validation

```
pnpm --filter @dudoxx/ddx-term-mcp typecheck  → exit 0
pnpm --filter @dudoxx/ddx-term-mcp test       → 64 passed (10 test files)
  ✓ src/no-pty.spec.ts (1)
  ✓ src/supervisor/lockfile.spec.ts (11)
  ✓ src/supervisor/health.spec.ts (9)
  ✓ src/supervisor/ensure-stack.spec.ts (8)
  ✓ src/server.e2e.spec.ts (5)
  ✓ (5 tool specs, 14 tmux client specs)
```

## FM AC coverage

| FM | AC | Spec |
|---|---|---|
| FM#1 lock race | Two concurrent acquireLock → exactly one winner; loser takes poll path; stale dead-pid lock reclaimed (age>staleMs) | `lockfile.spec.ts` |
| FM#2 zombie/port-conflict | probeHealth validates BrokerHealthSchema service literal; foreign body → PORT_CONFLICT naming port+DDX_TERM_BROKER_PORT; never silent-attach | `health.spec.ts` |
| FM#3 web opt-out | DDX_TERM_WEB=0 → web never spawned | `ensure-stack.spec.ts` "does not spawn web" |
| Post-ensure env vars | DDX_TERM_BROKER_URL / DDX_TERM_BROKER_WS / BROKER_BASE_URL set after success | `ensure-stack.spec.ts` "env vars" suite |
| no-pty invariant | no-pty.spec.ts green | `no-pty.spec.ts` |

## Deviations

1. **`tcpProbe` added to `EnsureStackDeps`** — `isTcpOpen` (web port readiness check) was made injectable so tests don't race against real TCP state. The real `isTcpOpen` (node:net) is the default. This is a testability improvement, not a spec deviation.

2. **`buildServer(env)` signature changed** (was `buildServer(ctx: ToolContext)`) — required to implement lazy context construction after ensureStack. `main()` updated accordingly; `buildContext()` export is preserved for tests that build ctx directly.

3. **`reclaimStaleLock` uses `>=` not `>`** — `staleMs=0` reclaims immediately; the spec said "age>10s" for the default but the comparison operator choice is an implementation detail. Default `staleMs=10_000` means any lock older than 10 s is reclaimed.

## Notes for bn1

- `BROKER_ENTRY` = `join(BUNDLE_DIR, 'broker', 'main.js')` where `BUNDLE_DIR` = `resolve(dirname(fileURLToPath(import.meta.url)), '..')` — resolves to `dist/` in the published bundle.
- `WEB_ENTRY` = `join(BUNDLE_DIR, 'web', 'server.mjs')`.
- bn1 must place broker bundle at `dist/broker/main.js` and web standalone at `dist/web/server.mjs` for these paths to resolve correctly at runtime. Tests inject paths so the constants' physical absence at test time is not an issue.
- Web child receives `DDX_TERM_BROKER_WS` + `BROKER_BASE_URL` (NOT `DDX_TERM_BROKER_URL`).
