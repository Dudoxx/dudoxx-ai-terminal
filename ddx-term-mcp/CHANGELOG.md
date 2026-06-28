# @dudoxx/ddx-term-mcp

## 0.1.2

### Patch Changes

- Use raw.githubusercontent.com URLs for the Dudoxx logos in README/INSTALLATION.
  npm's README renderer strips both relative paths and data: URIs, so logos must be
  absolute https from a trusted host. Repo is now public so raw URLs resolve.

## 0.1.1

### Patch Changes

- Embed Dudoxx logos as base64 data URIs in README + INSTALLATION so they render on
  the npm package page (relative asset paths do not resolve in npm's README renderer).
