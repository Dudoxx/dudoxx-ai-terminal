# Shard 04 — mcp-supervisor (NEW src/supervisor/)

| Field | Value |
|---|---|
| Layer | node infra (inside the MCP package) |
| Agent | Kai (node infra; `typescript-strict`) |
| Skills | `typescript-strict`, `agentic-patterns` (lazy-preflight pattern) |
| Parallel? | No — group C, depends on contract (01) + broker (02) + web (03) |
| Task id | `s1-supervisor` |

## Why
This is the autonomous-bootstrap brain. On the FIRST `term_*` call, the MCP must guarantee broker(6481)+web(3460) are live on the machine, launching them exactly once (machine-wide singleton via lockfile), then set the broker URL env so the EXISTING `resolver-factory.ts` takes the `BrokerRestResolver` (attached) path. This is a lazy pre-flight: the MCP must NOT do heavy work at stdio connect (server.ts `main()` connects immediately — keep it fast). The pre-flight runs before the first verb dispatch.

## THE three failure modes (each → an acceptance criterion)
1. **Lock race / thundering herd** — two MCP instances pre-flight simultaneously. Mitigation: `acquireLock()` opens the lockfile with `fs.openSync(path, 'wx')` (O_EXCL — atomic create-or-fail). Winner writes `{pid, startedAt}` and spawns. Loser (EEXIST) reads the lock, and instead of spawning, POLLS `probeHealth()` until the broker answers (bounded, e.g. 15s). `reclaimStaleLock()`: if the lockfile's pid is dead (`process.kill(pid,0)` throws ESRCH) OR `startedAt` is older than the stale timeout (>10s) with no healthy probe, delete the lock and retry acquire.
2. **Zombie broker / port conflict** — `probeHealth()` does NOT trust a bare TCP-open. It GETs `http://127.0.0.1:<brokerPort>/api/v1/session/health` and validates the parsed body against the contract `BrokerHealthSchema` — specifically `service === 'ddx-term-broker'`. If the port is open but the identity field is wrong/absent → it is a FOREIGN process → raise `PORT_CONFLICT` naming the port + the override env (`DDX_TERM_BROKER_PORT`), NEVER silent-attach. A stale lock with a dead pid is reclaimed (FM#1 path).
3. **Tarball bloat + needless web spawn** — web spawn is LAZY + opt-out: skip web entirely when `DDX_TERM_WEB=0`. (The pack-size budget assertion lives in shards 05/06.)

## Scope — NEW files under `ddx-term-mcp/src/supervisor/`
- `paths.ts` — stable lock/dir paths: `~/.ddx-term/` (resolve `os.homedir()`), `broker.lock`, `web.lock`. Create dir with `fs.mkdirSync(dir,{recursive:true})`.
- `lockfile.ts` — `acquireLock(path): LockHandle | 'busy'` (O_EXCL via `openSync(path,'wx')`), `releaseLock`, `reclaimStaleLock(path, staleMs)` (dead-pid + age check), `readLock(path)`.
- `health.ts` — `probeHealth(brokerPort): Promise<boolean>` (fetch the health path with a short AbortController timeout — mirror `resolver-factory.ts` BROKER_FETCH_TIMEOUT_MS pattern — parse with `BrokerHealthSchema.safeParse`, return `data.service === 'ddx-term-broker' && data.healthy`). Plus `probeForeign(brokerPort)` distinguishing "open but not us" → PORT_CONFLICT.
- `spawn.ts` — `spawnDetached(kind: 'broker'|'web', env): void` using `child_process.spawn(process.execPath, [entryScript], { detached: true, stdio: 'ignore', env })` then `child.unref()`. **NO shell, NO node-pty** — spawn `node` (process.execPath) directly on the bundled entry (`dist/broker/main.js` / `dist/web/server.mjs`, resolved relative to the MCP dist dir). Broker entry runs under plain node; web entry is `server.mjs` with `NODE_ENV=production`.
- `ensure-stack.ts` — `ensureStack(env): Promise<void>` orchestrator: (1) `probeHealth(brokerPort)` — if healthy, set env + return; (2) else `acquireLock(broker.lock)`; (3) winner → `spawnDetached('broker')`, then poll `probeHealth` until ready or timeout→`STACK_LAUNCH_FAILED`; (4) loser/busy → `reclaimStaleLock` then poll `probeHealth`; (5) if `DDX_TERM_WEB !== '0'` repeat the lock+spawn+poll for web (web readiness = TCP-open on webPort, web has no identity endpoint — a simple connect probe is fine); (6) finally set `process.env.DDX_TERM_BROKER_URL = http://127.0.0.1:<brokerPort>` AND `DDX_TERM_BROKER_WS` + `BROKER_BASE_URL` for any child still to spawn. Foreign process on broker port → throw `TermError('PORT_CONFLICT', …)`.

## Wiring into server.ts
- `ensureStack` must run ONCE before the first verb dispatch. Add a memoized guard in `server.ts` `CallToolRequestSchema` handler: `await ensureOnce(process.env)` at the top of the handler (before `dispatch`), where `ensureOnce` runs `ensureStack` exactly once (cache the promise). Do NOT run it in `main()` connect — keep connect fast. After `ensureStack` sets `DDX_TERM_BROKER_URL`, the context's resolver must be (re)built so it picks the attached path: simplest correct option — build the `ToolContext` lazily on first call (move `buildContext(process.env)` from `main()` into the same memoized first-call path), so `buildResolver` reads the now-set `DDX_TERM_BROKER_URL`. Keep `buildContext`/`buildServer` exports stable for tests.

## Boundaries
- NO PTY: spawn `process.execPath` (node) directly via `child_process.spawn` — never a shell, never node-pty. `no-pty.spec.ts` greps source and MUST stay green (it forbids node-pty/pty.spawn/raw shell; spawning `node` is allowed).
- Machine-local only (127.0.0.1); no remote discovery; no TLS/auth on spawned services.
- Do NOT change the 10 verb I/O contracts.
- All shared shapes (`BrokerHealthSchema`, ports, error codes) from `@ddx/term-contract`.

## Pattern basis
- `resolver-factory.ts` lines 28-49 — the AbortController fetch-timeout pattern for `probeHealth`.
- `resolver-factory.ts` `buildResolver` (lines 55-61) — already branches on `DDX_TERM_BROKER_URL`; the supervisor's only job is to make that var true. No change to the factory.
- `errors.ts` `TermError` — raise PORT_CONFLICT / STACK_LAUNCH_FAILED through it.

## Tests (vitest, co-located)
- `lockfile.spec.ts` — two concurrent acquires: exactly one wins; loser gets 'busy'; stale (dead-pid) lock is reclaimed.
- `health.spec.ts` — probe returns true only when body parses as BrokerHealth with service literal; a TCP-open foreign body (no/wrong service) → PORT_CONFLICT classification.
- `ensure-stack.spec.ts` — with a fake healthy probe, ensureStack sets DDX_TERM_BROKER_URL and does NOT spawn; with DDX_TERM_WEB=0, web is never spawned. Inject spawn/probe deps for testability (no real processes).
- Keep `no-pty.spec.ts` green — verify supervisor source has no node-pty/pty.spawn/shell spawn.

## Verification
`pnpm --filter @dudoxx/ddx-term-mcp typecheck && pnpm --filter @dudoxx/ddx-term-mcp test` (incl. no-pty.spec + the new supervisor specs).
