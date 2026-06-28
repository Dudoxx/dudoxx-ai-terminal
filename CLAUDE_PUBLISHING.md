# CLAUDE_PUBLISHING.md — dudoxx-ai-terminal

> Referencable deep-dive (loaded on demand from `CLAUDE.md`). The npm publish +
> Changesets versioning flow. Prose mirror: `ddx-documentation/05-publishing/`.

## What publishes
ONLY `@dudoxx/ddx-term-mcp` → public npm. `ddx-term-broker`, `ddx-term-web`, and
`@ddx/term-contract` are `"private": true` and listed in `.changeset/config.json`
`ignore[]` — Changesets never versions or publishes them.

## The bundling story (why the contract is NOT separately published)
`@dudoxx/ddx-term-mcp` depends on `@ddx/term-contract` as a `workspace:*` **devDependency**.
A naive `npm publish` would leave that unresolvable `workspace:*` in the tarball. It does
not, because:
- `tsup.config.ts` sets `noExternal: ['@ddx/term-contract']` and aliases it to the
  contract's TS **source** — so `build:bundle` inlines the contract into a single
  self-contained `dist/server.js`. Only `zod` + `@modelcontextprotocol/sdk` stay external.
- `build:bundle` is wired as `prepublishOnly`, so the bundle always rebuilds before publish.
- Result: the published tarball has **no `workspace:*` reference**; the contract ships
  inlined, never as a registry dependency.

Verify any time:
```sh
cd ddx-term-mcp && pnpm build:bundle && npm pack --dry-run --json | jq '.[0].files[].path'
# expect: dist/server.js · package.json · README.md · INSTALLATION.md · LICENSE · assets/*.png
grep -c '@ddx/term-contract' dist/server.js   # expect 0 (fully inlined)
```

## Release flow (Changesets)
```
pnpm changeset            # describe change + pick bump → writes .changeset/<name>.md
→ commit the changeset in your PR
→ merge PR to main
→ release.yml runs changesets/action:
    • opens/updates a "Version Packages" PR (bumps package.json, writes CHANGELOG.md)
→ merge the "Version Packages" PR
→ release.yml runs `pnpm release`:
    • pnpm -F @dudoxx/ddx-term-mcp build:bundle
    • changeset publish → npm publish (only changed packages)
```

## Version bumping
| Bump | When |
|---|---|
| `patch` | bug fix, doc fix, internal change — no API/tool-surface change |
| `minor` | new MCP tool, new env var, new optional behavior — backward-compatible |
| `major` | removed/renamed a tool, changed a tool's required input, broke a frame schema |

The MCP self-reports its version from `package.json` at build time (tsup `define:
__PKG_VERSION__`) — never hardcode it in `server.ts`.

## CI (`.github/workflows/release.yml`)
- Trigger: `push` to `main`.
- Gate: `pnpm -F @dudoxx/ddx-term-mcp typecheck` + `test` before any publish.
- Auth: repo secret **`NPM_TOKEN`** (npm automation/granular token, publish rights to the
  `@dudoxx` scope) → `NODE_AUTH_TOKEN`. Provenance on (`NPM_CONFIG_PROVENANCE=true`,
  needs `id-token: write`).
- Permissions: `contents: write` (tags + Version PR), `pull-requests: write`.

## Pitfalls
- **npm strips data URIs from `package.json`** — host logos on a CDN/raw file host,
  never inline as a data URI (they vanish in the published tarball).
- Don't run a bare `pnpm publish` from a package dir — go through `pnpm release` so
  `build:bundle` fires. `prepublishOnly` is the safety net, but `release` is the path.
- After the first registry release, `npx -y @dudoxx/ddx-term-mcp` resolves; before it,
  register the MCP by absolute path (see README).

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
