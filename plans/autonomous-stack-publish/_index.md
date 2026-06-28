# Plan: autonomous-stack-publish

Make `@dudoxx/ddx-term-mcp` a self-bootstrapping single npm package + autonomous publish flow.

## Context
`@dudoxx/ddx-term-mcp` is the only published package of this monorepo. Today a user installs it but must run broker(6481)+web(3460) separately. This plan inlines broker+web into the MCP tarball and adds a lazy supervisor so the first `term_*` call ensures the whole stack is live (machine-wide singleton), then proceeds broker-attached via the EXISTING `resolver-factory.ts`. CI (`release.yml`) is extended, not replaced.

**Authority order**: In-Session locked decisions (Tier-0) > repo invariants (`context/_invariants.md`, package CLAUDE.md) > repo precedent.

## Goal
`claude mcp add` (npx) on user OR project scope; on first `term_*` call validate broker+web are running on the machine and launch them (exactly one instance per machine) if not, then run broker-attached. Plus autonomous full-stack publish.

## Locked Decisions (do not re-litigate)
1. Bundle broker (tsup → `dist/broker/main.js`, plain-node) + web (Next `standalone` → `dist/web/`) INTO the MCP tarball. Broker+web stay `private:true` + in changeset `ignore[]` — ship only as inlined assets.
2. Detached machine-wide daemon + O_EXCL lockfile (`~/.ddx-term/{broker,web}.lock`) with PID + stale-timeout reclaim + health-identity probe. First MCP starts the stack; others reuse it.
3. Ports: broker 6481 (`DDX_TERM_BROKER_PORT`), web 3460 (`DDX_TERM_WEB_PORT`), socket `/tmp/ddx-term.sock` (`DDX_TERM_SOCKET`), 127.0.0.1 only. MCP sets `DDX_TERM_BROKER_URL` (+ `DDX_TERM_BROKER_WS`/`BROKER_BASE_URL` for the web child) after liveness.

## Acceptance Criteria (incl. 3 failure modes)
- **AC-FM1 Lock race / thundering herd** — O_EXCL lockfile + PID + stale-timeout (>10s dead-PID reclaim); lock-loser polls health instead of spawning. (`s1-supervisor` / lockfile.spec.ts)
- **AC-FM2 Zombie / port conflict** — health probe validates a broker-IDENTITY field (`service:'ddx-term-broker'` via `BrokerHealthSchema`), not bare TCP; foreign process on port → `PORT_CONFLICT` naming port + override env, never silent-attach. (`c2`,`c3`,`b1`,`s1` / health.spec.ts)
- **AC-FM3 Tarball bloat + needless web spawn** — web spawn lazy + opt-out (`DDX_TERM_WEB=0`); `npm pack` size budget + pack-manifest assertion; ship only `.next/standalone` + `.next/static` + server.mjs. (`w1`,`bn1`,`ci1` / verify-pack.mjs)
- AC-core — first `term_*` ensures the stack and runs via `BrokerRestResolver`; `no-pty.spec.ts` stays green; the 10 verb I/O contracts unchanged.

## Boundaries / Non-goals
No remote/multi-machine discovery (127.0.0.1 only) · no TLS/auth on spawned broker (loopback trust) · no Docker (pure node child processes) · no change to verb I/O or the NO-PTY invariant (spawn `node`, never a shell/pty) · broker/web never become their own npm packages.

## Implementation Order
| Shard | Layer | Agent | Skills | Parallel? |
|---|---|---|---|---|
| 01-contract | shared types (zod) | Vera | typescript-strict | Group A (3 tasks parallel) |
| 02-broker | NestJS 11 | Kai | nestjs-backend, typescript-strict | Group B (parallel with 03) |
| 03-web | Next.js 16 | Neo | frontend-stack, typescript-strict | Group B (parallel with 02) |
| 04-mcp-supervisor | node infra | Kai | typescript-strict, agentic-patterns | Group C (after B) |
| 05-bundling | build/packaging | Kai | typescript-strict | Group D (after C) |
| 06-publish-ci | CI/CD | Kai | — | Group E (after D) |
| 07-docs | docs | Atlas | — | Group F (after E) |

## Reciprocal Pairs
- `c2-health-schema` (contract identity field) ↔ `b1-broker-health-identity` (broker returns it) ↔ `s1-supervisor` health.ts (consumes it). All three must agree on the `service` literal.
- `w1-web-standalone` (emits standalone) ↔ `bn1-bundling` (copies it; handles `ws`/`.next/static` gaps `w1` flags).

## All Files
- Contract: `packages/ddx-term-contract/src/ports.ts` (new), `src/session.ts`, `src/mcp-tools.ts`, `src/index.ts`
- Broker: `ddx-term-broker/src/modules/session/session.controller.ts`
- Web: `ddx-term-web/next.config.ts`
- Supervisor (new): `ddx-term-mcp/src/supervisor/{paths,lockfile,health,spawn,ensure-stack}.ts` + 3 specs; `ddx-term-mcp/src/server.ts`
- Bundling: `ddx-term-mcp/package.json`, `tsup.config.ts`, `scripts/verify-pack.mjs` (new)
- CI: `.github/workflows/release.yml`
- Docs: `ddx-term-mcp/{README,INSTALLATION}.md`, root `README.md`, `CLAUDE_PUBLISHING.md`, `.mcp.json.example` (new), 4× CLAUDE.md (DOX)

## Pattern Basis
| Decision | Basis (file) |
|---|---|
| All shared shapes in contract (ports, health, errors) | root CLAUDE.md invariant + `packages/ddx-term-contract/CLAUDE.md` |
| `ports.ts`/`BrokerHealthSchema` shape | `packages/ddx-term-contract/src/session.ts` (SessionDescriptorSchema) |
| New error codes lockstep (enum+map+union) | `packages/ddx-term-contract/src/mcp-tools.ts` lines 32-71 |
| Health endpoint exists, extend it | `ddx-term-broker/src/modules/session/session.controller.ts` (GET session/health) |
| Probe fetch-timeout (AbortController) | `ddx-term-mcp/src/resolver-factory.ts` lines 28-49 |
| Attached-path selection (no factory change) | `resolver-factory.ts` `buildResolver` lines 55-61 (branches on DDX_TERM_BROKER_URL) |
| Inline a workspace dep via tsup noExternal | `ddx-term-mcp/tsup.config.ts` (`@ddx/term-contract`) |
| Publish wiring to extend | `ddx-term-mcp/package.json` files[]/prepublishOnly + `.github/workflows/release.yml` |
| broker/web private + ignored | `.changeset/config.json` ignore[] (already excludes both) |
| Web custom-server env vars | `ddx-term-web/server.mjs` (DDX_TERM_BROKER_WS) + `next.config.ts` (BROKER_BASE_URL) |
| Spawn node not pty | `ddx-term-mcp/CLAUDE.md` no-PTY invariant + `no-pty.spec.ts` |

## Research Sources
Direct file reads (2026-06-28): resolver-factory.ts, server.ts, tsup.config.ts, package.json (mcp/web/broker), next.config.ts, server.mjs, broker main.ts, session.controller.ts, contract index.ts/session.ts/mcp-tools.ts, release.yml, .changeset/config.json + all 4 package CLAUDE.md files.

## Verification
Per shard validation commands (see each shard + tasks.json). Stack-level: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (turbo, root); then `node ddx-term-mcp/scripts/verify-pack.mjs`. Critical gates: `no-pty.spec.ts` green, three FM specs green, pack manifest + size budget pass.
