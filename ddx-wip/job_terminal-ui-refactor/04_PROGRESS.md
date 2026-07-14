# 04 — Progress Board

Roll-up only. Task-level truth lives in `plans/terminal-ui-refactor/tasks/` + `progress/{id}.md`
once planned. Per-WS rows flipped only by the engine executing that WS. Event log is append-only.

## Board (per-WS status)

| WS | Title | Owner | Status | Progress surface |
|----|-------|-------|--------|------------------|
| WS1 | URL-based terminalId routing | ddx-term-web-specialist | NOT_STARTED | plan-feature-loop shard + browser evidence |
| WS2 | Toucan Signal design compliance | ddx-term-web-specialist | NOT_STARTED | plan-feature-loop shard (light+dark) |
| WS3 | Snapshot/live-frame ordering guard | ddx-term-web-specialist | NOT_STARTED | plan-feature-loop shard + xterm-client.spec |
| WS4 | Broker restore-on-attach (+scrollback decision) | ddx-term-broker-specialist | NOT_STARTED · **DECISION PENDING** (scrollback) | broker unit-gate + browser AC4.2 |
| WS5 | MCP + broker hardening | ddx-term-mcp-specialist | NOT_STARTED | /execute unit-gate |

Status values: NOT_STARTED → PLANNED → IN_PROGRESS → VERIFIED → DONE.

## Open decisions — RESOLVED 2026-07-14 (operator redline, Tier-0)

| # | Decision | RESOLVED | Impact |
|---|----------|----------|--------|
| D1 | Full scrollback restore on deep-link (WS4)? | **YES — full scrollback** | WS4 adds bounded `capture-pane -S -<n>` variant; AC4.3 is ACTIVE (not N/A) |
| D2 | URL grammar for terminals? | **YES — full design-system §10 entity grammar** | WS1 grows: `/terminal/new`, `/terminal/list/{grid,list,timeline}`, `/terminal/view/[id]/{edit,readonly}` + breadcrumb + URL-persistent state (§10–§13) |
| D3 | term_wait_for cursor (WS5)? | **document non-reset** | AC5.3 = inline comment explaining intentional non-reset |
| D4 | term_ps depth (WS5)? | **YES — align to descendantPids** | WS5: term_ps walks full tree; processes[] lists grandchildren (behavior change) |

## Event log

- 2026-07-14 · Cipher (orchestrator) · Job package created from 3-service audit synthesis (findings/2026-07-14_terminal-ui-refactor/). Status DRAFT. Awaiting operator redline.
- 2026-07-14 · Walid (operator) · Redline: D1=YES scrollback, D2=YES §10 grammar, D3=document, D4=align. Status DRAFT→APPROVED.
- 2026-07-14 · /plan-feature · plan created at plans/terminal-ui-refactor/ (Status: PLANNED)
- 2026-07-14 · /team-execute · wave 1 complete: WS4 (task 001+002 contract+broker restore), WS2 (task 005 design tokens), WS5 (task 006 mcp hardening) landed + verified. WS1/WS3 (003/004 web routing+buffering) in progress.
- 2026-07-14 · /team-execute · ALL 6 tasks complete (impl). Full-stack typecheck+lint green; web 8, contract 24, mcp 72, broker 50 unit tests pass. code-reviewer + security-reviewer running. Browser-verify (operator) + /unify pending.
- 2026-07-14 · /unify · plan reconciled — plans/terminal-ui-refactor/SUMMARY.md (Status: RECONCILED). 6/6 tasks, all code ACs PASS, 6 browser ACs UNTESTED (operator pass pending).
