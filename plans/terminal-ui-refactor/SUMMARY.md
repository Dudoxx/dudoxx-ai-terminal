# Plan Reconciliation: terminal-ui-refactor
> Reconciled: 2026-07-14 | Plan: plans/terminal-ui-refactor/_index.md | Job: ddx-wip/job_terminal-ui-refactor

## Execution Summary
| Metric | Value |
|--------|-------|
| Tasks Planned | 6 |
| Completed | 6 |
| Deviated | 1 (task_002 resumed after orchestrator error — no scope change) |
| Skipped | 0 |
| Unplanned Changes | 1 (edit-route stub fix + snapshot-ordering test — post-review, main session) |

## Task Status (by parallel group)
**Group A** (contract + independent):
- **001** COMPLETED — `SnapshotFrame` added to `@ddx/term-contract` (`ws-frames.ts` +33, spec +39).
- **002** COMPLETED (DEVIATED) — broker restore-on-attach (`pushInitialSnapshot`) + bounded scrollback (`SCROLLBACK_LINES=500`). Deviation: original teammate stopped mid-refactor by a lead reaping error; resumed by `impl-broker-terminal-2` from ~90% disk state — the remaining work was a spec-harness fix (`liveMessages()` wiring), not the predicted type errors. See `progress/002.md` + `progress/_team_recovery.md`.
- **005** COMPLETED — Toucan Signal tokens: `--color-primary`=`--color-accent`=terracotta (oklch 0.62 0.16 47), cobalt `--color-link`, Bricolage display face, dead `--xterm-*-hex` mirror removed, `as never` i18n escapes typed.
- **006** COMPLETED — MCP hardening: error un-swallow (`isNoMatchExit`/`err.code===1`), DRY `execTmux`, `term_ps` full-tree `descendantPids`, `term_wait_for` non-reset documented. NO-PTY intact.

**Group B**:
- **003** COMPLETED — full §10 route family: `view/[terminalId]/{,edit,readonly}`, `list/{grid,list,timeline}`, `new`, index redirect. `TerminalWorkspace` keyed by route-param prop (no `useState` selection); `TerminalListView` + `TerminalBreadcrumb` (§13). Locale-aware root redirect. en/de/fr lockstep.

**Group C**:
- **004** COMPLETED — `xterm-client.ts` buffer-until-painted guard; consumes broker `snapshot` frame; closed the exhaustive-`never` gap (fixed the TS2322 that task_001 opened). Race-correct: snapshot-wins and REST-fallback-wins both flush in order; disposed client never flushes.

## Acceptance Criteria
| Task | EARS Predicate | Status | Evidence |
|------|----------------|--------|----------|
| 003 | WHEN a §10 view route is requested THE SYSTEM SHALL derive the terminal from the URL param | PASS | `view/[terminalId]/page.tsx` `await params`; no `useState activeId` in `TerminalWorkspace.tsx` |
| 003 | WHEN list views are requested THE SYSTEM SHALL serve grid/list/timeline | PASS | `list/{grid,list,timeline}/page.tsx` all exist |
| 003 | WHEN the root is loaded THE SYSTEM SHALL redirect locale-aware (no hardcoded /en) | PASS | `app/page.tsx` — `getLocale()`, zero `/en/terminal` literals |
| 003 | WHEN a URL terminalId is unknown THE SYSTEM SHALL render not-found | UNTESTED (browser) | `notFound()` guard present; runtime-only |
| 005 | WHEN the theme resolves THE SYSTEM SHALL use one terracotta primary=accent + cobalt link | PASS | `globals.css:32-39` |
| 005 | WHEN display type renders THE SYSTEM SHALL use Bricolage | PASS | `layout.tsx` + `globals.css:64` |
| 005 | WHEN the theme block is read THE SYSTEM SHALL contain no dead xterm-hex mirror / as-never | PASS | `--xterm-*-hex` removed; `as never` only in a doc comment (code escapes removed, git diff `-` lines) |
| 002/004 | WHEN a client attaches WS THE SYSTEM SHALL push a snapshot frame before any live frame | PASS | `term.gateway.ts pushInitialSnapshot`; new gateway spec test "sends the snapshot frame FIRST" (10 tests green) |
| 002 | WHEN scrollback is captured THE SYSTEM SHALL bound it (never bare -S) | PASS | `terminal.service.ts SCROLLBACK_LINES=500` |
| 002 | WHEN dims are read THE SYSTEM SHALL keep 120×30 pinned | PASS | `session.service.ts` untouched; descriptor-sourced |
| 004 | WHEN live frames arrive before paint THE SYSTEM SHALL buffer then flush in order | PASS | `xterm-client.ts` painted/pendingFrames buffer + 3 new spec cases |
| 006 | WHEN pgrep/ps exit≠1 THE SYSTEM SHALL surface a fault not [] | PASS | `tmux.client.ts isNoMatchExit` |
| 006 | WHEN term_ps lists processes THE SYSTEM SHALL walk the full tree | PASS | `term-ps.tool.ts descendantPids` + spec |
| 006 | WHEN no-pty.spec runs THE SYSTEM SHALL stay green (no PTY) | PASS | mcp 72 tests green incl. no-pty.spec |
| all | Browser ACs (AC1.6 deep-link restore, AC1.7 not-found, AC2.7 light/dark, AC3.3 rapid-switch, AC4.2 cold-attach, AC4.3b scrollback) | UNTESTED (browser) | Deferred to operator browser-verify pass by explicit decision this session |

**Static gates**: `pnpm typecheck` ✅ (5/5) · `pnpm lint` ✅ (5/5) · tests web 8 / contract 24 / mcp 72 / broker 51 ✅ · zero `any` · contract-sourced types intact · DOX pass done (`ddx-term-web/CLAUDE.md`).

## Boundary Compliance
CLEAN. `appearance.ts` raw-hex untouched; broker `node-pty` NOT removed (legitimate `-CC` attach); no broker CRUD API / `reconcileRegistry` / dims-renegotiation change; no `@ddx/term-contract` schema change outside the task_001 frame; NO-PTY surface intact; no §10 sub-entity/export/print routes; no supervisor deep audit.

## Coverage Audit
| Dimension | Status | Evidence / Reason |
|-----------|--------|-------------------|
| contract (frame) | Covered | task_001 — `ws-frames.ts` |
| broker (restore + scrollback) | Covered | task_002 — `term.gateway.ts`, `terminal.service.ts` |
| web routing (§10) | Covered | task_003 — 8 route files + 3 components |
| web redraw (buffering) | Covered | task_004 — `xterm-client.ts` |
| web design tokens | Covered | task_005 — `globals.css`, `layout.tsx` |
| mcp hardening | Covered | task_006 — `tmux.client.ts`, 2 tools |
| i18n (en/de/fr) | Covered | task_003 — all 3 locale JSONs in diff, lockstep |
| browser runtime verification | Deferred | Operator browser-verify pass (explicit decision; NOT a gap) |
| §10 export/print/sub-entity | Deferred | NOT line in _index.md — terminals have none |

## Deviations
- **task_002 resume**: orchestrator (lead) accidentally `TaskStop`'d three live teammates after misreading a peer's background-ID report (a teammate reports the WHOLE team's process IDs, not just its own). Recovered cleanly — task state lives on disk, so `impl-broker-terminal-2` resumed 002 from partial state; `impl-web-terminal` was revived from its transcript by a `SendMessage`. Zero lost work. Logged in `progress/_team_recovery.md`; memory `[[team-reap-verify-ownership]]` written.

## Unplanned Changes
- **edit-route stub fix** (post-code-review, main session): `view/[terminalId]/edit` was a stub — `mode='edit'` rendered identically to `view` while its docstring claimed rename-by-default. Wired `autoRename` prop `TerminalWorkspace → TerminalSidePanel → TerminalRow` (active row opens in inline-rename). Doc now matches code.
- **snapshot-ordering test** (post-code-review): added broker gateway spec asserting the snapshot frame precedes any live frame on attach (hardens the reciprocal contract the reviewer flagged as comment-only).

## Deferred Issues
- **[security MED, pre-existing]** `term.gateway.ts:~189` — `match[1] as TerminalId` is an unchecked cast at the WS-entry boundary (re-validated downstream via `toTerminalId()`, so no live injection/crash path). Harden with `TerminalIdSchema.safeParse` + `close(1008)` on failure. Filed to project scratchpad (`spad-20260714-836504`). NOT in this diff's scope (Cardinal #5).
- **Browser-verify pass (DONE 2026-07-14)** — two ENVIRONMENT issues found + fixed (neither a code defect): (1) stale `.next` build predating the refactor → rebuilt; (2) `server.mjs` run with `NODE_ENV=development` wedges React because the custom server doesn't proxy `_next/webpack-hmr` → must run `NODE_ENV=production`. After rebuild + prod serve, verified in Playwright:
  - **AC1.6 deep-link restore: PASS** — cold-load `/view/content-gen-cli` renders THAT terminal (not first-sorted) with restored scrollback + ANSI colors, status Connected.
  - **AC1.7 not-found: PASS** — `/view/does-not-exist` → "This terminal no longer exists." + back button, no crash.
  - **AC1.3 URL navigation: PASS** — clicking a list card does `router.push` → URL becomes `/view/{id}`.
  - **AC2.7 design: PASS (visible)** — JetBrains Mono terminal data, terracotta primary=accent chips/buttons, Bricolage H1, shadow-elevation no borders.
  - **AC4.3b scrollback: PASS** — restored content exceeds the 30-row viewport (bounded scrollback delivered on cold load).
  - **§10 list/grid + breadcrumb: PASS** — H1 "Terminals", grid/list/timeline switcher, both terminals as cards, breadcrumb reconstructible from URL (§13).
  - **Byte-fidelity confirmed**: `hellohellohello` (no spaces) rendered = broker raw snapshot `repr` identical (`echo -n` source) — restore is byte-for-byte, not a bug.
  - NOT re-run under a screenshot: AC3.3 rapid-switch, AC2.7 dark-mode toggle (both structurally sound; light mode + switching verified live). Broker needs `nohup`/real-tty to stay up (`[[terminal-broker-needs-real-tty]]`).

## Learnings
- A dispatched subagent writing a relative `plans/`/`findings/` path lands it under the shell's cwd, not the repo root, if cwd drifted into a subpackage — verify + relocate, never re-dispatch (`[[plan-agent-cwd-drift]]`).
- In `/team-execute`, a teammate's SubagentStop hook reports the WHOLE team's background task IDs; confirm ownership before `TaskStop` or you kill working siblings. Recovery is clean because task state is on disk (`[[team-reap-verify-ownership]]`).
- `SendMessage` to a stopped named teammate resumes it from its transcript — accidental reaps of still-needed teammates cost nothing but churn.
- Grep-based AC/design checks false-positive on comments (`as never`, `window.confirm` in docstrings) — evaluate the git diff, not the raw grep count.
- `TerminalDescriptor.windowId` is a zod-branded STRING (tmux `@N` handle), never orderable — use `createdAt` (epoch ms) for chronological sort. Now a contract in `ddx-term-web/CLAUDE.md`.

## Extracted Pattern
- **Pattern**: "Cross-service reciprocal frame round-trip" — a new WS frame added to the shared contract package FIRST (turbo DAG head), then a producer shard (broker `pushX`) and a consumer shard (web `case 'X'` + buffer-until-painted), with a broker-side ordering test + a contract exhaustive-`never` switch that mechanically forces the consumer to handle the new type.
- **Where reused**: any future ddx-terminal-bridge frame (resize, bell, title-change, exit-code) — same 3-shard shape (contract → producer → consumer) with the exhaustive-switch guard closing the loop.
- **Artefact**: `packages/ddx-term-contract/src/ws-frames.ts` (open union + `SnapshotFrame`), `ddx-term-broker/.../term.gateway.ts` (`pushInitialSnapshot` + ordering spec), `ddx-term-web/.../xterm-client.ts` (buffer-until-painted consumer). Reciprocal Pairs table in `_index.md`.
