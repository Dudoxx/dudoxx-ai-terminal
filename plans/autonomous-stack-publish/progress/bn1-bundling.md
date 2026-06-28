# Progress: bn1-bundling

- **Status**: done
- **Agent**: ddx-term-mcp-specialist
- **Started**: 2026-06-28
- **Completed**: 2026-06-28

## Steps done
- [x] Confirmed tsup/esbuild cannot bundle NestJS (decorator/reflect-metadata incompatibility — 15 errors)
- [x] Switched to `pnpm deploy --legacy --prod` approach, deploying broker directly to `dist/broker/`
- [x] Hoisted compiled broker JS (`dist/broker/dist/*` → `dist/broker/`) so `main.js` is at expected path
- [x] Wrote `dist/package.json` (broker identity) — satisfies compiled main.js `require('../package.json')` relative path
- [x] Wrote `dist/broker/package.json` with `{"type":"commonjs"}` — overrides MCP package's `"type":"module"` scope
- [x] Copied Next.js standalone to `dist/web/.next/standalone/`
- [x] Copied `.next/static/` to nested `dist/web/.next/standalone/ddx-term-web/.next/static/` (required by Next server)
- [x] Placed `server.mjs` INSIDE `dist/web/.next/standalone/ddx-term-web/` (not at dist/web/ root) so `next` resolves from sibling `node_modules/next` and `next()` finds `.next/` via `__dirname`
- [x] Updated `server.mjs` to pass `dir = dirname(fileURLToPath(import.meta.url))` to `next()` (explicit app dir, cwd-independent)
- [x] Injected `ws` into `dist/web/node_modules/ws` (absent from nft trace)
- [x] Updated `paths.ts` — `WEB_ENTRY` now points to `dist/web/.next/standalone/ddx-term-web/server.mjs`
- [x] Fixed `prepublishOnly` order: `build:bundle` first (tsup `clean:true` wipes dist/), then `build:stack`
- [x] Added `maxBuffer: 64MB` to verify-pack.mjs `npm pack` call (3630+ file manifest exceeded 1MB default)
- [x] Smoke-booted `dist/broker/main.js` — NestJS starts, modules init, session reconciled
- [x] Smoke-booted `dist/web/.next/standalone/ddx-term-web/server.mjs` — `ddx-term-web ready on http://localhost:3461`
- [x] Ran `pnpm --filter @dudoxx/ddx-term-mcp typecheck` — clean
- [x] Ran `pnpm --filter @dudoxx/ddx-term-mcp test` — 10 files, 64 tests, all pass
- [x] Ran `verify-pack.mjs` — PASS: all 4 required paths present, 125 MB packed within 250 MB budget

## Files touched
- `ddx-term-mcp/package.json` — added `dist/broker`, `dist/web` to `files[]`, `build:stack` script, swapped `prepublishOnly` order
- `ddx-term-mcp/scripts/build-stack.mjs` — created (build script: pnpm deploy → hoist → web copy)
- `ddx-term-mcp/scripts/verify-pack.mjs` — created (pack manifest assertions + size budget)
- `ddx-term-mcp/src/supervisor/paths.ts` — updated `WEB_ENTRY` to point inside standalone app dir
- `ddx-term-web/server.mjs` — added explicit `dir` param to `next()` using `__dirname` equivalent

## Validation output
```
[verify-pack] Checking 8245 packed files …
[verify-pack] OK: dist/server.js present
[verify-pack] OK: dist/broker/main.js present
[verify-pack] OK: dist/web/.next/standalone/ddx-term-web/server.mjs present
[verify-pack] OK: dist/web/.next/standalone/ddx-term-web/.next/static present
[verify-pack] Total packed size: 125.0 MB (budget: 250.0 MB)
[verify-pack] OK: All 4 required paths present, size 125.0 MB within 250.0 MB budget
[verify-pack] PASS

Test Files: 10 passed (10)
Tests:      64 passed (64)
```

## Notes / deviations
- **DEVIATION (NEEDS_REVIEW):** broker is deployed via `pnpm deploy` + dist-copy rather than tsup-bundled.
  tsup-bundling NestJS with decorators/reflect-metadata is infeasible (esbuild does not support
  `experimentalDecorators`). The deployed node_modules (with pnpm virtual store symlinks intact)
  adds ~437 MB on disk but packs to ~112 MB in the tarball. Future alternatives: `pkg`/`ncc` bundlers
  that support CJS decorators, or a pre-built Docker image approach.
- **pnpm symlinks kept intact**: `rsync -aL` approach was abandoned — it dereferenced the entire .pnpm
  virtual store (267 MB, dedup lost) AND broke tslib resolution (transitive-only dep had no top-level
  alias). Deploying directly to `dist/broker/` keeps relative symlinks valid.
- broker port `EADDRINUSE 6481` and pty errors during smoke-boot are expected (another broker running
  in the dev environment; sandbox has no pty). NestJS fully initializes before these errors.
- `dist/package.json` (broker identity) is an extra artifact not in the original task spec — required
  because compiled `main.js` has a hardcoded `require('../package.json')` relative path.
