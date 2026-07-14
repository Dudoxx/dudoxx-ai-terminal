# Shard 03 — Web: §10 entity routing + breadcrumbs + i18n

- **Task**: `tasks/task_003.json`
- **Agent**: `ddx-term-web-specialist`
- **Skills**: ddx-nextjs-navigation, frontend-stack, i18n-nextintl
- **Rules**: `_invariants.md`, `ddx-term-web/CLAUDE.md`, `~/.claude/rules/shared/dudoxx-design-system.md` (§10-13), root CLAUDE.md
- **WS**: WS1 (CRITICAL) · **Wave**: 2 · **Group**: B · **Depends**: task_002

## Why this scope
The single-page `useState` selection (`terminal/page.tsx:77`) is the ONE critical
defect: deep-link/refresh/shared-link do not restore the intended terminal. D2=YES
replaces it with the full design-system §10 entity grammar for the `terminal`
entity — `view/[terminalId]/{,readonly,edit}`, `list/{grid,list,timeline}`, `new`,
an index redirect/empty-state, `notFound()` for stale ids, URL-reconstructible
breadcrumbs (§13), URL-persistent view-mode + selection (§11-12). Active id derives
from `await params`, never state; selection is `router.push`, never setState.

## Boundary (WS1 NOT)
EXCLUDE §10 sub-entity/export/print branches — terminals have none. No broker CRUD
API change, no DB persistence.

## i18n
Every new user-facing string (view-mode labels, breadcrumb labels, empty/notFound,
new/rename UI) gets a key in `messages/{en,de,fr}.json` in LOCKSTEP under the
`terminal` namespace. This is an explicit AC (Cardinal #23).

## Reciprocal pair
Route producers (view/list/new) → breadcrumb consumer + i18n key set. The
`view/[terminalId]/page.tsx` mount is re-aligned to the buffering contract in
task_004.
