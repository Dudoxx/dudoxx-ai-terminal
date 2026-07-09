# @dudoxx/ddx-term-mcp

## 0.2.1

### Patch Changes

- Fix a PTY-leak in the bundled broker's control-mode attach loop. On a persistent
  `tmux -CC attach` spawn failure (e.g. a missing native `pty.node` in a bad deploy),
  the broker retried every 2s forever, leaking one pty per cycle until macOS
  `ptmx_max` (511) was exhausted and no process could allocate a pty. The reconnect
  loop is now bounded (RECONNECT_MAX_ATTEMPTS=60) with exponential backoff (2s→30s),
  resetting on the first healthy data frame and stopping cleanly on give-up. The
  published bundle also carries the native `pty.node` prebuild so the broker starts
  first-try. Verified end-to-end via a live browser-loop test: keystroke echo,
  multi-terminal rendering, and human/agent shared-state parity all pass.

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
