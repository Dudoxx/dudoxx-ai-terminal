# @dudoxx/ddx-term-mcp

## 0.2.0

### Minor Changes

- **Default ports moved to the 133XX band** (broker `13330`, web `13340`) to avoid
  colliding with common dev servers (3000/5173/8080). **Breaking** for anyone who
  hardcoded the old `6481`/`3460` — override via `DDX_TERM_BROKER_PORT` /
  `DDX_TERM_WEB_PORT`.
- **Layered `.env` override support** — the MCP loads a project-local `.env` and a
  global `~/.ddx-term/.env` before resolving ports (`override: false`, so an explicit
  client `env:` value always wins). Broker + web load the same files for the
  standalone `pnpm dev` path.
- **Supervisor auto-spawn** — on the first `term_*` verb the MCP spawns the broker +
  web as a machine-wide singleton (lock-protected; `PORT_CONFLICT` on a foreign
  process; `DDX_TERM_WEB=0` for headless), then attaches.
- **MIT licensed** — the package now ships a LICENSE file; the repo is open-source.
- Tooling: ESLint 9 flat config across the monorepo; `dotenv` bundled into
  `dist/server.js`.

## 0.1.3

### Patch Changes

- Stamp the MCP server's self-reported version from package.json at build time
  (tsup `define` → `__PKG_VERSION__`). Fixes serverInfo.version reporting a stale
  hardcoded 0.1.0 regardless of the published version.

## 0.1.2

### Patch Changes

- Use raw.githubusercontent.com URLs for the Dudoxx logos in README/INSTALLATION.
  npm's README renderer strips both relative paths and data: URIs, so logos must be
  absolute https from a trusted host. Repo is now public so raw URLs resolve.

## 0.1.1

### Patch Changes

- Embed Dudoxx logos as base64 data URIs in README + INSTALLATION so they render on
  the npm package page (relative asset paths do not resolve in npm's README renderer).
