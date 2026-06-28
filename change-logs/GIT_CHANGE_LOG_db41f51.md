# Change Log — main @ blocker-fixes
**Date**: 2026-06-28 14:25  |  **Projects**: ddx-term-broker

## Summary
Fixed the two deferred broker blockers (0.C, 0.D) from HANDOFF_2026-06-28_14-02.
term_destroy is now idempotent (evict-in-finally; missing window = success; DELETE
on an already-gone terminal returns 204 not 404/500). A boot-time registry↔tmux
reconcile rebuilds the in-memory registry from surviving tmux windows on restart
(adopts unknown windows, drops stale entries), so term_list and the web viewer
reconnect after a broker restart. Both fixes live-verified via REST.

## Files Changed
- session.service.ts: reconcileRegistry() in onModuleInit; idempotent destroyTerminal (finally)
- terminal.service.ts: REST destroy is a no-op (204) when terminal already gone
- session.service.spec.ts + terminal.service.spec.ts: 3 new cases (idempotent destroy, adopt-on-boot, drop-stale)
- CLAUDE.md: DOX local contracts for reconcile + idempotent destroy

## Build & Lint
- ddx-term-broker: tsc clean, 50/50 tests pass (eslint skipped — pre-existing eslint-v9 config gap)

## Commit
