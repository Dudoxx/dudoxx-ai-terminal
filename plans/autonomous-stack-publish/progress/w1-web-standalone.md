# w1-web-standalone — Progress

**Task**: Enable Next standalone output + verify custom server.mjs compatibility
**Status**: completed
**Agent**: Neo (ddx-term-web-specialist)
**Date**: 2026-06-28

---

## Change Made

`ddx-term-web/next.config.ts` — added `output: 'standalone'` to the `nextConfig` object
(inside the `withNextIntl` wrap, before the `rewrites()` block).  See line 19.

---

## Build Result

`pnpm --filter ddx-term-web typecheck && pnpm --filter ddx-term-web build` — **both exit 0**.

`.next/standalone/` is emitted.  Layout under standalone root:
```
.next/standalone/
  ddx-term-web/           ← Next entry (server.js lives here)
    .next/
      app-path-routes-manifest.json
      BUILD_ID
      build-manifest.json
      package.json
      prerender-manifest.json
      required-server-files.json
      routes-manifest.json
      server/
  node_modules/           ← dep-traced, minimal
```

### Lint note (pre-existing breakage — not introduced by this task)

`pnpm --filter ddx-term-web lint` calls `next lint`, which was **removed in Next.js 16**
(no longer a sub-command: `next --help` shows build/dev/start/info only).  ESLint is also
not installed (`node_modules/.bin/eslint` absent; no `.eslintrc*` config).  This breakage
pre-dates this task — the lint script should be updated to `eslint src/` or removed.
Typecheck passes cleanly; no TS errors were introduced.

---

## ws Presence — ABSENT (load-bearing for bn1)

`ws` is used **only** in `server.mjs` (`import { WebSocket, WebSocketServer } from 'ws'`).
Next's `@vercel/nft` dep-tracer follows the Next server entry point, NOT `server.mjs`, so
`ws` is **absent** from `.next/standalone/node_modules/`.

**bn1 must explicitly copy `ws` (and its transitive deps) into the standalone bundle.**

Simplest approach: after assembling the tarball, run
```sh
cd .next/standalone && npm install --no-package-lock ws@^8
```
or copy `ws/` + `bufferutil/` + `utf-8-validate/` directly from the workspace
`node_modules/` before packing.

---

## ENV-VAR Confirmation

| Env var | Location | Default | Notes |
|---|---|---|---|
| `DDX_TERM_BROKER_WS` | `server.mjs:29` | `ws://127.0.0.1:6481` | WS proxy target; set by supervisor |
| `BROKER_BASE_URL` | `next.config.ts:30` | `http://localhost:6481` | Next rewrite destination; set by supervisor |

Both names are **confirmed unchanged**.  Supervisor must set BOTH (they serve different code
paths: `server.mjs` vs Next's server-side rewrite engine).

---

## Standalone Runnable Set (for bn1)

| Item | Notes |
|---|---|
| `.next/standalone/` | Self-contained traced bundle (copy verbatim) |
| `.next/static/` | Static assets — NOT inside standalone; must be copied to `.next/standalone/ddx-term-web/.next/static/` or assets 404 |
| `server.mjs` | Real entrypoint (WS-upgrade proxy); must be adjacent to `.next/standalone/` |
| `messages/` | next-intl locale JSONs (en/de/fr) — must be reachable at runtime; copy to standalone root |
| `public/` | Does NOT exist in this project — nothing to copy |
| `ws` (+ deps) | Must be injected into `.next/standalone/node_modules/ws/` by bn1 (absent from trace) |

Run command (from deploy root):
```sh
PORT=3460 DDX_TERM_BROKER_WS=ws://127.0.0.1:6481 BROKER_BASE_URL=http://127.0.0.1:6481 \
  node server.mjs
```

---

## Deviations

- `lint` script is broken pre-existing (next lint removed in Next.js 16) — not fixed here
  (out of scope; bn1/ci1 shards should address or suppress).
- `public/` directory does not exist — nothing to include in runnable set.
