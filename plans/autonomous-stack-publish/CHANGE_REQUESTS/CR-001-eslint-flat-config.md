# CR-001 — Repo-wide missing ESLint flat config

**Status:** OPEN (follow-up, out of scope for autonomous-stack-publish)
**Found during:** Wave B / task b1-broker-health-identity (impl-broker-kai)
**Severity:** non-blocking for this plan

## Evidence
- No `eslint.config.{js,mjs,cjs,ts}` or `.eslintrc*` exists anywhere in the repo
  (outside node_modules); none in git history.
- ESLint 9 requires the flat-config format; `pnpm --filter ddx-term-broker lint:check`
  exits 2 with "couldn't find a configuration file" — a MISSING-CONFIG error, not a
  rule violation in any task's diff.
- `ddx-term-web` uses `next lint` (own config) and was unaffected.

## Why not fixed inline
- Out of every shard's file boundary; no shard owns lint infra.
- Publish gate (release.yml) is `typecheck + test`, NOT lint — so this does not block
  the autonomous-publish goal. b1 correctness gate (tsc:check + 50/50 tests) is GREEN.

## Recommended follow-up (separate CR/PR)
Add a root flat `eslint.config.js` (typescript-eslint v8 flat preset) shared by
ddx-term-broker (+ contract/mcp if desired). One chore commit. Not part of this plan.

## Addendum (found during w1, impl-web-neo)
- `ddx-term-web` lint is ALSO broken: `pnpm --filter ddx-term-web lint` calls `next lint`,
  which was REMOVED in Next.js 16 (`next --help` = build/dev/start/info only); eslint is
  not installed in the web package either. Pre-existing, not introduced by w1. Typecheck clean.
- Follow-up: replace web `lint` script with `eslint src/` (after root flat config lands) or remove it.
