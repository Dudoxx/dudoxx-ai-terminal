# Shard 05 — Web: Toucan Signal design-token compliance

- **Task**: `tasks/task_005.json`
- **Agent**: `ddx-term-web-specialist`
- **Skills**: ddx-nextjs-visuals, dudoxx-branding, typescript-strict
- **Rules**: `_invariants.md`, `ddx-term-web/CLAUDE.md`, `~/.claude/rules/shared/dudoxx-design-system.md` (§9a, §25), root CLAUDE.md
- **WS**: WS2 · **Wave**: 4 (parallel-safe) · **Group**: A · **Depends**: —

## Why this scope
`globals.css:31-37,51` has token drift (primary ≠ accent hue); Toucan Signal
(D-014) requires primary = accent = ONE terracotta + a cobalt `--color-link` axis,
green = success-only. `globals.css:64-67` has a DEAD `--xterm-*-hex` mirror
(orphaned by `appearance.ts`) — delete it. Add Bricolage display face. Replace two
`t(... as never)` i18n escapes in `AppearanceControls.tsx` with typed keys.

## Critical guardrail (FM3)
NEVER rewire the xterm canvas theme to OKLCH `@theme` tokens — xterm ITheme cannot
parse OKLCH → blank terminal. `appearance.ts` raw hex is the ONE sanctioned
exemption; leave it untouched. Only the DEAD globals.css mirror is removed.

## Parallelism
Touches only `globals.css`, `layout.tsx`, `AppearanceControls.tsx` — no overlap
with routing/xterm-client, so it runs parallel to the WS4→WS1→WS3 chain.
