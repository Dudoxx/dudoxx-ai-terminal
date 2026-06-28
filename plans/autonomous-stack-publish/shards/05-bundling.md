# Shard 05 — bundling (ddx-term-mcp tsup + package.json files[])

| Field | Value |
|---|---|
| Layer | build/packaging |
| Agent | Kai (`typescript-strict`) |
| Skills | `typescript-strict` |
| Parallel? | No — group D, depends on supervisor (04) |
| Task id | `bn1-bundling` |

## Why
Locked decision #1: the MCP tarball must inline broker (`dist/broker/main.js` runnable under plain node) + web (`dist/web/` Next standalone). The supervisor (shard 04) spawns `dist/broker/main.js` and `dist/web/server.mjs` — those paths MUST exist in the published package. The contract is already inlined via tsup `noExternal`.

## Scope
1. **Broker compile → `dist/broker/`** — broker builds with `nest build` to its own `dist/main.js`. Add a `build:stack` orchestration script in `ddx-term-mcp/package.json` that: (a) builds broker (`pnpm -F ddx-term-broker build`), (b) copies broker's compiled `dist/` → `ddx-term-mcp/dist/broker/` (incl. its runtime `node_modules`? NO — broker deps must be resolvable). **Decision (NEEDS_REVIEW if it fails)**: the simplest correct approach is to bundle broker with tsup like the MCP server itself (single `dist/broker/main.js` with NestJS deps bundled via `noExternal`), mirroring how the contract is already inlined. NestJS bundling has known reflect-metadata/decorator pitfalls — if tsup-bundling the broker fails, fall back to copying broker `dist/` + a pruned `node_modules` and mark `NEEDS_REVIEW`. Prefer the tsup-bundle path first (keeps tarball lean, FM#3).
2. **Web standalone → `dist/web/`** — copy `ddx-term-web/.next/standalone/*` → `dist/web/`, then copy `ddx-term-web/.next/static` → `dist/web/.next/static`, `server.mjs` → `dist/web/server.mjs`, `messages/` → `dist/web/messages/`, and ensure `ws` is present in `dist/web/node_modules/ws` (shard 03 flagged it may be missing from the trace). Ship ONLY these — NOT the full web `node_modules` (FM#3 bloat).
3. **package.json `files[]`** — add `"dist/broker"` and `"dist/web"` to the `files` array (currently only `dist/server.js` + assets + docs).
4. **prepublishOnly chain** — extend so `prepublishOnly` runs `build:stack` (broker + web) before `build:bundle` (MCP server). Keep `build:bundle` as the MCP-server tsup step.
5. **Pack manifest test** — add `scripts/verify-pack.mjs` (or a vitest) that runs `npm pack --dry-run --json` and asserts: `dist/server.js`, `dist/broker/main.js`, `dist/web/server.mjs`, `dist/web/.next/static` are all in the manifest; AND a SIZE BUDGET (e.g. total < 40 MB — tune to actual; FM#3). Fail the build if a required path is missing or the budget is exceeded.

## Boundaries
- Do NOT publish broker/web as their own packages — they ship ONLY as inlined assets. Keep them `private:true` + in changeset `ignore[]` (already true — `.changeset/config.json` ignores all three).
- Do NOT ship full web `node_modules` — only `.next/standalone` traced tree + static + server.mjs + messages + ws.
- Keep zod + @modelcontextprotocol/sdk external (existing tsup config) — they install from npm.

## Pattern basis
- `tsup.config.ts` `noExternal: ['@ddx/term-contract']` — the inline-a-workspace-dep pattern to reuse for the broker if tsup-bundling it.
- `package.json` `files[]` lines 11-18 + `prepublishOnly` line 46 — the existing publish wiring to extend.

## Pitfalls
- NestJS + tsup: decorators/reflect-metadata can break under aggressive bundling — test `node dist/broker/main.js` boots before declaring done; fall back to dist-copy + pruned node_modules + NEEDS_REVIEW if so.
- `.next/static` lives OUTSIDE `.next/standalone` — must be copied explicitly or web assets 404.
- `ws` may be missing from the standalone trace — verify `dist/web/node_modules/ws` exists.

## Verification
`pnpm --filter @dudoxx/ddx-term-mcp run build:stack && pnpm --filter @dudoxx/ddx-term-mcp run build:bundle && node scripts/verify-pack.mjs`. Smoke: `node dist/broker/main.js` boots broker on 6481; `node dist/web/server.mjs` boots web on 3460.
