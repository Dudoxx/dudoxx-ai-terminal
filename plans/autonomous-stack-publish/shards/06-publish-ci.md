# Shard 06 — publish-ci (.github/workflows/release.yml)

| Field | Value |
|---|---|
| Layer | CI/CD |
| Agent | Kai (`typescript-strict`) |
| Skills | (none — YAML/CI) |
| Parallel? | No — group E, depends on bundling (05) |
| Task id | `ci1-publish-ci` |

## Why
The existing `release.yml` runs the changesets flow but its gate only does `typecheck + test` on the MCP package — it never builds the FULL stack (broker + web standalone) before `changeset publish`. Since the supervisor spawns `dist/broker` + `dist/web` from the tarball, the release MUST build them or it ships a broken package. EXTEND release.yml — do NOT replace it (locked instruction).

## Scope
1. **Build the full stack before publish** — in the `release` job, before the changesets `publish` step, add steps that run the MCP package's `build:stack` (broker + web standalone) + `build:bundle` (MCP server). Note: `prepublishOnly` already chains these (shard 05), and `changeset publish` runs `prepublishOnly` per package — so the primary mechanism is `prepublishOnly`. The CI must still install web/broker deps (`pnpm install --frozen-lockfile` already does the whole workspace) and ensure the build toolchain (Next, Nest) is available. Add an explicit pre-publish build step as a belt-and-suspenders gate so a `prepublishOnly` regression fails loudly in CI, not silently at publish.
2. **Pre-publish assertions (gate)** — add a step (before the changesets action) that runs the pack-manifest + size-budget check from shard 05 (`node scripts/verify-pack.mjs`). This is the FM#3 enforcement at CI level: a missing `dist/broker`/`dist/web` path or an oversized tarball fails the release.
3. **Keep existing wiring** — NPM_TOKEN / NODE_AUTH_TOKEN / NPM_CONFIG_PROVENANCE / permissions / concurrency all UNCHANGED. The gate step (`typecheck + test`) stays; add the build + verify-pack steps after it and before the changesets action.

## Boundaries
- Do NOT replace release.yml or the changesets action — extend with new steps.
- Do NOT change the publish trigger (push to main) or the Version-Packages PR flow.
- Do NOT publish broker/web — changeset `ignore[]` already prevents it; verify it stays.
- Honor PR-plane cardinals: no `--admin` merges, this is CI publish only.

## Pattern basis
- `release.yml` lines 54-58 — the existing gate step shape to mirror for the new build + verify steps.
- `package.json` `prepublishOnly` — the publish-time build hook the CI step backstops.

## Pitfalls
- `changeset publish` runs `prepublishOnly` in the package dir — if the CI runner lacks the broker/web build deps the publish silently builds a thin tarball. The explicit CI build + verify-pack step is what catches that.
- The size budget in verify-pack.mjs must be tuned to the REAL standalone size after shard 05 — set it once measured, not guessed.

## Verification
CI dry-run: push a branch with a changeset, confirm the workflow runs the new build + verify-pack steps green before the changesets action. Locally: `pnpm install --frozen-lockfile && pnpm -F @dudoxx/ddx-term-mcp run build:stack && pnpm -F @dudoxx/ddx-term-mcp run build:bundle && node scripts/verify-pack.mjs`.
