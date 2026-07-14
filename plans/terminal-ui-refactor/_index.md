# Plan: terminal-ui-refactor

**Status**: RECONCILED | **Scope**: terminal-ui-refactor | **Engine**: plan-feature-loop (browser-verify frontend; unit-gate backend) | **Model**: parallel | **Branch**: feature/terminal-ui-refactor
Job package: ddx-wip/job_terminal-ui-refactor

## Context
Terminal UI refactor + 3-service robustness for ddx-terminal-bridge. The web frontend carries the only CRITICAL defect (single-page `useState` terminal selection — deep-link/refresh/share do not restore the intended terminal) plus all design-rule gaps; the broker needs two additive changes to support deep-link restore (restore-on-attach push + bounded scrollback); the MCP server is healthy and needs only hardening. Authority = the operator-redlined job package (`ddx-wip/job_terminal-ui-refactor/`, Tier-0) + design-system §10-25. Ground truth from `findings/2026-07-14_terminal-ui-refactor/` (file:line audits — reused, not re-explored).

## Acceptance Criteria (ACn.m ids preserved from 02_OUTCOMES_AC.md)
| WS | ACs | Task |
|---|---|---|
| WS1 routing | AC1.1 AC1.2 AC1.3 AC1.4 AC1.4b AC1.4c AC1.5 AC1.6 AC1.7 | task_003 |
| WS2 design | AC2.1 AC2.2 AC2.3 AC2.4 AC2.5 AC2.6 AC2.7 | task_005 |
| WS3 ordering | AC3.1 AC3.2 AC3.3 | task_004 |
| WS4 broker | AC4.1 AC4.2 AC4.3 AC4.3b AC4.4 | task_001 (frame) + task_002 |
| WS5 mcp | AC5.1 AC5.2 AC5.3 AC5.4 AC5.5 | task_006 |
| Job gates | ACJ.1–ACJ.7 (typecheck/lint/test/zero-any/contract/DOX/reviewers) | all + `/unify` |

## Boundaries (from 01_SCOPE NOT lines)
- NO §10 sub-entity / export / print routes (terminals have none) — task_003.
- NO broker CRUD API change, NO DB persistence of terminals — task_003.
- NO touching `appearance.ts` raw-hex values (the ONE xterm ITheme exemption); NO restyling xterm canvas colors — task_005.
- NO unbounded scrollback; NO dims-renegotiation; NO `reconcileRegistry` change — task_002.
- NO reconnect-backoff rewrite; NO `@ddx/term-contract` schema change outside task_001 — task_004.
- NO NO-PTY surface change; NO resolver/registry/dispatch restructure; NO supervisor deep audit; NO re-reporting the 3 fixed prod-launch bugs — task_006.

## Implementation Order
| Shard | Layer | Agent | Skills | Parallel? |
|---|---|---|---|---|
| 01-contract-frame | contract | ddx-term-broker-specialist | typescript-strict, frontend-stack | Group A (head) |
| 02-broker-restore | broker | ddx-term-broker-specialist | nestjs-backend, typescript-strict | Group A (after 01) |
| 05-web-design-tokens | web | ddx-term-web-specialist | ddx-nextjs-visuals, dudoxx-branding | Group A (parallel) |
| 06-mcp-hardening | mcp | ddx-term-mcp-specialist | typescript-strict, nestjs-backend | Group A (parallel) |
| 03-web-routing | web | ddx-term-web-specialist | ddx-nextjs-navigation, frontend-stack, i18n-nextintl | Group B (after A) |
| 04-web-snapshot-guard | web | ddx-term-web-specialist | frontend-stack, typescript-strict | Group C (after B) |

Groups: A `{001,002,005,006}` → B `{003}` → C `{004}`. Within A, 002 depends on 001; 005 + 006 are independent and parallel-safe with the whole chain.

## Reciprocal Pairs (Round-Trip Coverage)
- Contract `snapshot` frame (task_001) ⇄ broker producer (task_002) ⇄ web consumer (task_004).
- Broker restore-on-attach push (task_002) → web buffer-until-painted flush (task_004).
- §10 route producers view/list/new (task_003) → breadcrumb consumer + i18n key set (task_003) → route mount aligned to buffering (task_004).

## Cross-Service Authorizations
- task_001 (broker-specialist) authors in `packages/ddx-term-contract/` — sanctioned: any new frame lands in the contract package FIRST (turbo DAG), and the frame is broker-driven. Web (task_004) only IMPORTS the type.

## All Files
See each `tasks/task_NNN.json` `files` block + `tasks/manifest.json` per-row `files`. Net new: 8 web route/component files (task_003) + `TerminalBreadcrumb.tsx`. Modified: contract frame + spec, broker gateway + service, web xterm-client + specs + globals.css + layout + AppearanceControls + 3 locale JSONs, mcp tmux.client + 2 tools.

## Pattern Basis
| Decision | Basis (path / §) |
|---|---|
| §10 entity route grammar (view/list/new + modes) | `~/.claude/rules/shared/dudoxx-design-system.md` §10 (D2=YES) |
| URL-persistent view-mode/selection + breadcrumbs | design-system.md §11-13 |
| New WS frame in contract package first | `packages/ddx-term-contract/CLAUDE.md` (invariant) + `ws-frames.ts:12` (open union) |
| Bounded `-S` scrollback as separate method | existing `terminal.service.ts:127 snapshot()` viewport pattern (D1=YES) |
| Buffer-until-painted ordering | web-audit `xterm-client.ts` race + existing `this.disposed` guard |
| Toucan Signal terracotta/cobalt tokens | design-system.md §9a (D-014) |
| descendantPids for term_ps processes[] | mcp-audit + `term-signal` tree boundary (D4=align) |
| Raw hex only in appearance.ts | web CLAUDE.md + `_invariants.md` #4 |

## Research Sources
- `findings/2026-07-14_terminal-ui-refactor/{_index,web-audit,broker-audit,mcp-audit}.md` (file:line ground truth).
- `ddx-wip/job_terminal-ui-refactor/{00_JOB,01_SCOPE,02_OUTCOMES_AC,03_EXECUTION}.md` (operator-redlined, Tier-0).

## Verification
Per-task: package-scoped `pnpm --filter ... build/typecheck/lint/test` (see each task `validation`). Job gates (`/unify`): `pnpm typecheck` · `pnpm lint` · `pnpm test` · zero-`any` (ACJ.4) · contract imports intact (ACJ.5) · DOX pass on touched CLAUDE.md (ACJ.6) · `code-reviewer` (all) + `security-reviewer` (task_002/003/004 — WS endpoints) clean (ACJ.7). Browser-verify AC1.6/1.7/2.7/3.3/4.2/4.3b via plan-feature-loop against broker(13330)+web(13340).
