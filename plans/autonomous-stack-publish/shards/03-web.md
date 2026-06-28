# Shard 03 — web (ddx-term-web, Next.js 16)

| Field | Value |
|---|---|
| Layer | Next.js 16 standalone build |
| Agent | Neo (frontend-stack) |
| Skills | `frontend-stack`, `typescript-strict` |
| Parallel? | Yes — group B, parallel with shard 02 (broker). Both depend on shard 01 |
| Task id | `w1-web-standalone` |

## Why
To inline the web UI into the MCP tarball (locked decision #1), Next must emit a self-contained `.next/standalone` tree runnable under `node`. The web already uses a CUSTOM server (`server.mjs`) for WS-upgrade proxying — that complicates standalone (Next's standalone scaffolds its OWN `server.js`; a custom server must be shipped alongside and the standalone node_modules must include `ws` + `next`). FM#3: keep the tarball lean — ship ONLY `.next/standalone` + `.next/static`, nothing else.

## Scope
1. Enable `output: 'standalone'` in `next.config.ts` (add to the `nextConfig` object). This makes `next build` emit `.next/standalone/` with a traced minimal `node_modules`.
2. **Custom-server compatibility**: `server.mjs` is the real entrypoint (handles `/term/*` WS upgrade). Under standalone, Next traces deps for ITS generated server.js, NOT `server.mjs`. Ensure `ws` + `next` are resolvable from the standalone tree: add `server.mjs` and its imports to the files copied into `dist/web/` (handled by shard 05 bundling), and confirm `server.mjs` reads broker URL from env. **Env var audit (load-bearing)**: `server.mjs` reads `DDX_TERM_BROKER_WS` (default `ws://127.0.0.1:6481`) for the WS proxy; `next.config.ts` rewrites read `BROKER_BASE_URL` (default `http://localhost:6481`). The supervisor (shard 04) MUST set BOTH `DDX_TERM_BROKER_WS` and `BROKER_BASE_URL` (not `DDX_TERM_BROKER_URL` — that is the MCP-side var only). Document this triple-var reality in the shard-05 spawn env.
3. Produce/verify the minimal standalone tree: after `next build`, the runnable set is `.next/standalone/` (incl. traced `node_modules`, `package.json`, `.next/server`) + `.next/static/` (copied into `.next/standalone/.next/static`) + `public/` if present + `server.mjs` + `messages/`. Confirm `node server.mjs` works from the standalone dir with `NODE_ENV=production`.

## Boundaries
- Do NOT switch off the custom server — WS-upgrade proxying is mandatory (single-origin, no exposed broker port).
- Do NOT add new UI; this is a build-config + verification shard.
- Respect Dudoxx frontend rules (semantic tokens, i18n lockstep) — but no UI strings change here.

## Pattern basis
- `server.mjs` lines 24-29 — env-driven port + broker WS base already correct; no code change needed there beyond confirming.
- Next 16 `output: 'standalone'` is the documented standalone-tree mechanism (frontend-stack skill).

## Pitfalls
- Next standalone's traced `node_modules` may MISS `ws` because it is only used by `server.mjs` (not traced from Next's server.js). Verify `ws` is present in `.next/standalone/node_modules/ws`; if missing, the bundling shard must copy it explicitly.
- `.next/static` is NOT inside `.next/standalone` by default — it must be copied to `.next/standalone/.next/static` or assets 404. This copy is the bundling shard's job; this shard documents the requirement.

## Verification
`pnpm --filter ddx-term-web typecheck && pnpm --filter ddx-term-web lint && pnpm --filter ddx-term-web build`. Manual smoke: from the built standalone dir, `DDX_TERM_BROKER_WS=ws://127.0.0.1:6481 BROKER_BASE_URL=http://127.0.0.1:6481 PORT=3460 node server.mjs` → http://localhost:3460 loads.
