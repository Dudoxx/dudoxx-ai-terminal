# Job: Terminal UI Refactor + Stack Robustness

**Status**: RECONCILED
**Created**: 2026-07-14
**Owner**: Walid Boudabbous <walid@acceleate.com>
**Origin**: Long multi-ask operator prompt (3 ask-signals) → `/ddx-job` intake. Evidence base =
3-service parallel audit at `findings/2026-07-14_terminal-ui-refactor/` (do NOT re-audit).

## What this job does

Refactor the terminal frontend so the **URL is the source of truth for which terminal renders**
(deep-link/refresh-safe), bring the UI to the **Dudoxx Toucan Signal** design rules, harden the
**redraw/snapshot restore** on both sides of the wire, and do a **robustness pass on the MCP server
and broker** — all grounded in the audit (web = 1 CRITICAL + 3 HIGH; broker = restore gaps; mcp =
hardening only, architecture healthy, NO-PTY intact).

## Files

| File | Role |
|------|------|
| `00_JOB.md` | Rewritten prompt: numbered symptoms → WS, phases, outcomes, constraints, ASSUMPTIONS |
| `01_SCOPE.md` | WS1–WS5 with Goal / Surface / **NOT** each + cross-WS boundary rules |
| `02_OUTCOMES_AC.md` | Mechanically-checkable ACs per WS + job-level gates (ACJ.*) |
| `03_EXECUTION.md` | Engine = `plan-feature-loop` + browser-loop; wave order; 3 failure modes → ACs |
| `04_PROGRESS.md` | Per-WS board + 4 open decisions + append-only event log |
| `99_ORIGINAL_PROMPT.md` | Original prompt verbatim (never edited) |

## Workstreams at a glance

| WS | Title | Severity | Shape |
|----|-------|----------|-------|
| WS1 | URL-based terminalId routing | CRITICAL | restructure (new `[terminalId]` route) |
| WS2 | Toucan Signal design compliance | HIGH | token + component fix |
| WS3 | Snapshot/live-frame ordering guard | MED | buffering guard (web) |
| WS4 | Broker restore-on-attach (+scrollback decision) | HIGH | additive (broker) |
| WS5 | MCP + broker hardening | MED/LOW | harden, no restructure |

## Pipeline

```
[you are here: DRAFT — redline the files, resolve the 4 open decisions in 04_PROGRESS]
  → /plan-feature --job ddx-wip/job_terminal-ui-refactor
  → plan-feature-loop  (browser-verify frontend shards; unit-gate backend)
  → code-reviewer (+ security-reviewer on WS1/WS4)
  → /unify → SUMMARY.md → Status RECONCILED
```

## Decisions — RESOLVED 2026-07-14 (operator redline)

1. **D1 → YES** full bounded scrollback restore on deep-link (WS4 grows)
2. **D2 → YES** full design-system §10 entity grammar (WS1 grows: list/view/new + breadcrumbs)
3. **D3 → document non-reset** (default)
4. **D4 → align to descendantPids** (WS5: term_ps full-tree)

Status is **APPROVED**. Next: `/plan-feature --job ddx-wip/job_terminal-ui-refactor`.
