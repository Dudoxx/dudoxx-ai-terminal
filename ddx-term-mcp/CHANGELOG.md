# @dudoxx/ddx-term-mcp

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
