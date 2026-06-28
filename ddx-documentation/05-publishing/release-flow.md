---
title: Release Flow
description: Publishing @dudoxx/ddx-term-mcp — the changesets pipeline, the tsup bundling story, release.yml CI, the NPM_TOKEN secret, and version bumping.
audience: developers
tags: [publishing, changesets, tsup, ci, npm, release]
updated: 2026-06-28
---

# Release Flow

Only **`@dudoxx/ddx-term-mcp`** is published. The broker, web, contract, and e2e
packages are in `.changeset/config.json` `ignore[]` and never reach a registry.

## The tsup bundling story (why npx works)

The MCP server has a dev dependency on `@ddx/term-contract` as `workspace:*`. A naive
`npm publish` would leave that unresolvable `workspace:*` on the registry. The project
solves this at build time:

`ddx-term-mcp/tsup.config.ts`:
- `noExternal: ['@ddx/term-contract']` — **bundles the contract into `dist/server.js`**.
- An esbuild **alias** points `@ddx/term-contract` at its TS **source**
  (`../packages/ddx-term-contract/src/index.ts`), so tsup compiles it fresh as ESM
  (bundling the contract's emitted dist pulled in `require("zod/v4")` calls that fail
  under ESM — "Dynamic require" error).
- `external: ['zod', '@modelcontextprotocol/sdk']` — these install from npm as normal
  runtime deps.
- Single ESM bundle, `target: node20`, the `#!/usr/bin/env node` shebang preserved from
  `src/server.ts` (no `banner` — a banner would emit a duplicate shebang → SyntaxError).
- `define.__PKG_VERSION__` injects the package version at build time so the server's
  self-reported version never drifts from `package.json`.

`prepublishOnly: "pnpm run build:bundle"` wires this so the bundle is always produced
before publish. The result: a **self-contained** `dist/server.js` with no
`workspace:*` dep — `npx -y @dudoxx/ddx-term-mcp` resolves cleanly.

> This is why the old README "npx NOT available yet" note is **stale**. The package is
> publish-ready; document the npx path as primary (see [registration](../03-mcp-reference/registration.md)).

## Publish metadata (`ddx-term-mcp/package.json`)

| Field | Value |
|---|---|
| `name` | `@dudoxx/ddx-term-mcp` |
| `license` | `MIT` |
| `publishConfig.access` | `public` |
| `bin` | `{ "ddx-term-mcp": "dist/server.js" }` |
| `files` | `dist/server.js`, `assets/*.png`, `README.md`, `INSTALLATION.md`, `LICENSE` |
| `prepublishOnly` | `pnpm run build:bundle` |
| `engines.node` | `>=20.9.0` |

## The changesets pipeline

```
changeset → version PR → publish
```

1. **Add a changeset** in your feature PR:
   ```sh
   pnpm changeset      # records bump (patch/minor/major) + summary
   ```
2. **Version PR (CI):** on merge to `main`, `release.yml` runs `changeset version`,
   which bumps `package.json` and writes the CHANGELOG, then opens/updates a
   **"Version Packages"** PR.
3. **Publish (CI):** merging the Version Packages PR triggers `changeset publish` →
   `npm publish` of any package whose version changed (only `@dudoxx/ddx-term-mcp`).

Manual local equivalent:
```sh
pnpm changeset        # add changeset
pnpm version          # changeset version (bump)
pnpm release          # build:bundle + changeset publish
```

## CI — `.github/workflows/release.yml`

Triggered on `push` to `main`. Steps:

1. Checkout (full history, `fetch-depth: 0`).
2. Setup pnpm `10.24.0` + Node 20, registry `https://registry.npmjs.org`.
3. `pnpm install --frozen-lockfile`.
4. **Gate:** `pnpm -F @dudoxx/ddx-term-mcp typecheck` + `test` — publish is blocked if
   either fails.
5. `changesets/action@v1` with `version: pnpm run version`, `publish: pnpm run release`.

Permissions: `contents: write` (tags + Version PR), `pull-requests: write`,
`id-token: write` (npm provenance). Concurrency group `release-${{ github.ref }}`,
no cancel-in-progress.

### The `NPM_TOKEN` secret

Publish requires the repo secret **`NPM_TOKEN`** — an npm automation / granular token
with publish rights to the `@dudoxx` scope. `setup-node` writes `~/.npmrc` with
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`, and the publish step
authenticates via `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. Provenance is enabled
via `NPM_CONFIG_PROVENANCE: "true"`.

## Version bumping (semver)

Choose the bump when adding the changeset:

| Bump | Use for |
|---|---|
| **patch** | bug fixes, internal changes, doc fixes that ship in the bundle |
| **minor** | new MCP verb, new env var, backwards-compatible capability |
| **major** | breaking change to a tool's input/output schema or env contract |

Because the contract is bundled in, a breaking contract change that alters the MCP's
public tool I/O is a **major** bump of `@dudoxx/ddx-term-mcp`.

## See also

- [Registration](../03-mcp-reference/registration.md) — the npx path this flow enables.
- [Contributing](../04-development/contributing.md) — the changeset-per-change rule.
- [MCP package](../02-packages/mcp.md) — the package being published.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
